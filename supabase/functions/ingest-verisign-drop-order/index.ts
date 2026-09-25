import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DropRecord = {
  domain: string;
  expires_on: string;
  order: number;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST required" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dbKey = secretKeys || legacyServiceKey;

  if (!supabaseUrl || !dbKey) {
    return new Response(JSON.stringify({ ok: false, error: "Supabase server configuration is incomplete" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { domains?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const domains = Array.isArray(body.domains)
    ? [...new Set(body.domains.map(normalizeDomain).filter(Boolean))].slice(0, 100)
    : [];

  if (!domains.length) {
    return new Response(JSON.stringify({ ok: false, error: "Provide 1-100 domains" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const response = await fetch("https://api.namebio.com/verisign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(domains),
  });

  if (!response.ok) {
    const detail = await response.text();
    return new Response(JSON.stringify({
      ok: false,
      source: "NameBio Verisign Drop Order",
      error: `Upstream HTTP ${response.status}`,
      detail: detail.slice(0, 500),
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return new Response(JSON.stringify({
      ok: false,
      source: "NameBio Verisign Drop Order",
      error: "Unexpected upstream response",
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const records = payload.filter((item): item is DropRecord =>
    item &&
    typeof item.domain === "string" &&
    typeof item.expires_on === "string" &&
    Number.isInteger(item.order)
  );

  const supabase = createClient(supabaseUrl, dbKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const source = await supabase
    .from("sources")
    .select("id")
    .eq("name", "Verisign Drop Order")
    .maybeSingle();

  if (source.error || !source.data?.id) {
    return new Response(JSON.stringify({ ok: false, error: "Verisign Drop Order source is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let imported = 0;
  let skipped = 0;

  for (const record of records) {
    const name = normalizeDomain(record.domain);
    const dot = name.lastIndexOf(".");
    const tld = dot >= 0 ? name.slice(dot + 1) : "";
    const normalizedName = name;

    const existing = await supabase
      .from("domains")
      .select("id,metadata")
      .eq("normalized_name", normalizedName)
      .maybeSingle();

    if (existing.error) {
      skipped++;
      continue;
    }

    const metadata = {
      ...(existing.data?.metadata && typeof existing.data.metadata === "object" ? existing.data.metadata : {}),
      verisign_drop_order: {
        expires_on: record.expires_on,
        order: record.order,
        source: "NameBio Verisign Drop Order",
        checked_at: new Date().toISOString(),
      },
    };

    const result = existing.data
      ? await supabase.from("domains").update({
          last_seen_at: new Date().toISOString(),
          metadata,
        }).eq("id", existing.data.id)
      : await supabase.from("domains").insert({
          name,
          tld,
          normalized_name: normalizedName,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          metadata,
        });

    if (result.error) skipped++;
    else imported++;
  }

  await supabase
    .from("sources")
    .update({ access_status: "connected" })
    .eq("id", source.data.id);

  return new Response(JSON.stringify({
    ok: true,
    source: "NameBio Verisign Drop Order",
    requested: domains.length,
    matched: records.length,
    imported,
    skipped,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
