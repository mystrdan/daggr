import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = Record<string, string>;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.$/, "");
}

function parseCsv(input: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const n = input[i + 1];
    if (quoted) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => {
    const out: Row = {};
    headers.forEach((h, i) => { out[h] = (r[i] ?? "").trim(); });
    return out;
  });
}

function pick(row: Row, names: string[]): string {
  for (const name of names) {
    const value = row[name.toLowerCase()];
    if (value) return value;
  }
  return "";
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isNaN(ts)) return new Date(ts).toISOString();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function parsePrice(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "POST required" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dbKey = secretKeys || legacyKey;
  if (!supabaseUrl || !dbKey) return new Response(JSON.stringify({ ok: false, error: "Supabase server configuration is incomplete" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

  let body: { file?: string };
  try { body = await req.json(); } catch { body = {}; }

  const allowed = new Set([
    "alist.csv",
    "mostactive.csv",
    "allexpiring_list.csv",
    "deleting_list.csv",
    "deleting_list_light.csv",
    "expiring_list_light.csv",
  ]);
  const file = body.file || "alist.csv";
  if (!allowed.has(file)) return new Response(JSON.stringify({ ok: false, error: "Unsupported NameJet list" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

  const upstream = await fetch("https://www.namejet.com/file_dl.sn?file=" + encodeURIComponent(file), {
    headers: { "User-Agent": "Daggr/1.0 market-data-ingestion" }
  });
  if (!upstream.ok) return new Response(JSON.stringify({
    ok: false, source: "NameJet", file, error: "Upstream HTTP " + upstream.status
  }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const csv = await upstream.text();
  const rows = parseCsv(csv);

  const supabase = createClient(supabaseUrl, dbKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: source, error: sourceError } = await supabase
    .from("sources").select("id").eq("name", "NameJet").maybeSingle();
  if (sourceError || !source?.id) return new Response(JSON.stringify({
    ok: false, error: "NameJet source is not configured"
  }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const run = await supabase.from("ingestion_runs").insert({
    source_id: source.id,
    connector: "ingest-namejet-auctions",
    status: "running",
    filename: file,
    received: rows.length
  }).select("id").single();

  const runId = run.data?.id;
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const domain = normalize(pick(row, ["domain", "domain name", "domainname", "name"]));
    if (!domain || !domain.includes(".")) { skipped++; continue; }

    const dot = domain.lastIndexOf(".");
    const tld = domain.slice(dot + 1);
    const normalizedName = domain;
    const externalId = pick(row, ["auction id", "auctionid", "id", "listing id", "listingid"]) || domain;
    const endsAt = parseDate(pick(row, ["end date", "enddate", "auction end", "auctionend", "ends", "end time", "endtime"]));
    const startsAt = parseDate(pick(row, ["start date", "startdate", "auction start", "auctionstart", "start time", "starttime"]));
    const currentPrice = parsePrice(pick(row, ["current bid", "currentbid", "high bid", "highbid", "price", "minimum bid", "min bid"]));
    const bidCountRaw = pick(row, ["bids", "bid count", "bidcount", "number of bids"]);
    const bidCount = Number.isFinite(Number(bidCountRaw)) ? Number(bidCountRaw) : 0;

    const existing = await supabase.from("domains").select("id,metadata").eq("normalized_name", normalizedName).maybeSingle();
    if (existing.error) { skipped++; continue; }

    const now = new Date().toISOString();
    const domainResult = existing.data
      ? await supabase.from("domains").update({
          name: domain, tld, last_seen_at: now,
          metadata: { ...(existing.data.metadata || {}), namejet: { file, checked_at: now } }
        }).eq("id", existing.data.id)
      : await supabase.from("domains").insert({
          name: domain, tld, normalized_name: normalizedName,
          first_seen_at: now, last_seen_at: now,
          metadata: { namejet: { file, checked_at: now } }
        }).select("id").single();

    if (domainResult.error) { skipped++; continue; }
    const domainId = existing.data?.id || domainResult.data?.id;
    if (!domainId) { skipped++; continue; }

    const auction = await supabase.from("auctions").upsert({
      domain_id: domainId,
      source_id: source.id,
      external_id: externalId,
      status: endsAt && new Date(endsAt).getTime() < Date.now() ? "ended" : "live",
      starts_at: startsAt,
      ends_at: endsAt,
      current_price: currentPrice,
      currency: "USD",
      bid_count: Math.max(0, bidCount),
      source_url: "https://www.namejet.com/",
      metadata: { namejet_file: file, raw: row }
    }, { onConflict: "source_id,external_id" });

    if (auction.error) skipped++;
    else imported++;
  }

  await supabase.from("ingestion_runs").update({
    status: skipped && !imported ? "failed" : "success",
    completed_at: new Date().toISOString(),
    processed: rows.length,
    prepared: rows.length,
    imported,
    skipped,
    error: skipped && !imported ? "No rows were imported" : null
  }).eq("id", runId);

  await supabase.from("sources").update({
    access_status: "connected",
    feed_types: ["auctions", "expired", "deleting", "backorders"]
  }).eq("id", source.id);

  return new Response(JSON.stringify({
    ok: true, source: "NameJet", file,
    received: rows.length, imported, skipped, run_id: runId
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
