import "jsr:@supabase/supabase-js@2";

const DOMA_API = "https://api.doma.xyz";
const CURSOR = "daggr-tokenized-market";
const EVENTS = ["NAME_TOKEN_LISTED","NAME_TOKEN_LISTING_CANCELLED","NAME_TOKEN_PURCHASED"];

function humanPrice(raw: unknown, symbol: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const decimals = symbol === "USDC" ? 6 : (symbol === "ETH" || symbol === "WETH" ? 18 : null);
  return decimals === null ? null : n / (10 ** decimals);
}

async function poll(apiKey: string) {
  const url = new URL("/v1/poll", DOMA_API);
  url.searchParams.set("cursor", CURSOR);
  url.searchParams.set("limit", "100");
  url.searchParams.set("finalizedOnly", "true");
  for (const type of EVENTS) url.searchParams.append("eventTypes", type);
  const response = await fetch(url, { headers: { "Api-Key": apiKey, Accept: "application/json" } });
  if (!response.ok) throw new Error("Doma poll HTTP " + response.status);
  return await response.json();
}

async function ack(apiKey: string, lastId: number) {
  const url = new URL(`/v1/poll/ack/${lastId}`, DOMA_API);
  url.searchParams.set("cursor", CURSOR);
  const response = await fetch(url, { method: "POST", headers: { "Api-Key": apiKey, Accept: "application/json" } });
  if (!response.ok) throw new Error("Doma ack HTTP " + response.status);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST required" }, { status: 405 });

  const apiKey = Deno.env.get("DOMA_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!apiKey) return Response.json({ ok: false, error: "DOMA_API_KEY is not configured" }, { status: 503 });
  if (!supabaseUrl || !rawKeys) return Response.json({ ok: false, error: "Supabase runtime credentials unavailable" }, { status: 503 });

  const secret = Object.values(JSON.parse(rawKeys) as Record<string, string>)[0];
  const supabase = createClient(supabaseUrl, secret);
  const { data: source } = await supabase.from("sources").select("id").eq("name", "Doma").maybeSingle();
  if (!source) return Response.json({ ok: false, error: "Doma source is not configured" }, { status: 500 });

  const started = new Date().toISOString();
  const { data: run } = await supabase.from("ingestion_runs").insert({
    source_id: source.id, connector: "supabase:doma-events", status: "running",
    started_at: started, filename: "doma-event-poll",
  }).select("id").single();

  let processed = 0, imported = 0, skipped = 0, lastId: number | null = null;

  try {
    for (let page = 0; page < 5; page++) {
      const payload = await poll(apiKey);
      const events = Array.isArray(payload.events) ? payload.events : [];
      if (!events.length) break;

      for (const event of events) {
        processed++;
        const type = String(event.type ?? "");
        const data = event.eventData ?? {};
        const name = String(event.name ?? data.name ?? "").toLowerCase();
        if (!name.includes(".")) { skipped++; continue; }

        const { data: domain } = await supabase.from("domains").upsert({
          name, normalized_name: name, tld: name.split(".").pop() ?? "",
          last_seen_at: new Date().toISOString(), metadata: { tokenized: true, protocol: "Doma" },
        }, { onConflict: "normalized_name" }).select("id").single();

        if (type === "NAME_TOKEN_LISTED") {
          const symbol = String(data.payment?.currencySymbol ?? "USDC");
          const price = humanPrice(data.payment?.price, symbol);
          if (price === null || price < 10) { skipped++; continue; }

          const externalId = String(data.orderId ?? event.uniqueId ?? event.id);
          const endsAt = data.expiresAt ?? null;
          const status = endsAt && new Date(endsAt).getTime() <= Date.now() ? "ended" : "live";
          const { error } = await supabase.from("auctions").upsert({
            domain_id: domain?.id ?? null, source_id: source.id, external_id: externalId,
            status, starts_at: data.startsAt ?? data.createdAt ?? started, ends_at: endsAt,
            current_price: price, currency: symbol, bid_count: 0,
            source_url: `https://app.doma.xyz/domain/${encodeURIComponent(name)}`,
            metadata: { tokenized: true, protocol: "Doma", token_id: data.tokenId ?? event.tokenId ?? null, token_address: data.tokenAddress ?? null, orderbook: data.orderbook ?? null, seller: data.seller ?? null, event_id: event.id ?? null },
          }, { onConflict: "source_id,external_id" });
          if (error) throw new Error("Doma listing upsert failed: " + error.message);
          imported++;
        } else {
          const externalId = String(data.orderId ?? event.uniqueId ?? event.id);
          const status = type === "NAME_TOKEN_PURCHASED" ? "ended" : "cancelled";
          const { error } = await supabase.from("auctions").update({ status }).eq("source_id", source.id).eq("external_id", externalId);
          if (error) throw new Error("Doma status update failed: " + error.message);
          imported++;
        }
        lastId = Number(event.id);
      }

      if (!payload.hasMoreEvents || !lastId) break;
      await ack(apiKey, lastId);
    }

    if (lastId) await ack(apiKey, lastId);
    await supabase.from("sources").update({ access_status: "connected" }).eq("id", source.id);
    await supabase.from("ingestion_runs").update({
      status: "success", completed_at: new Date().toISOString(),
      received: processed, processed, prepared: processed, imported, skipped,
      metadata: { cursor: CURSOR, last_event_id: lastId },
    }).eq("id", run.id);
    return Response.json({ ok: true, source: "Doma", received: processed, imported, skipped, lastEventId: lastId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Doma ingestion error";
    if (run) await supabase.from("ingestion_runs").update({ status: "failed", completed_at: new Date().toISOString(), received: processed, processed, imported, skipped, error: message }).eq("id", run.id);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
});