import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DYNADOT_URL = "https://api.dynadot.com/api3.json";

type Auction = {
  auction_id: number | string;
  domain: string;
  bid_price?: number | string;
  bid_price_currency?: string;
  bids?: number | string;
  end_time?: string;
  end_timestamp?: number | string;
  age?: number | string;
  visitors?: number | string;
  links?: number | string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function secretKey() {
  const grouped = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (grouped) {
    try {
      const parsed = JSON.parse(grouped);
      if (parsed.default) return parsed.default;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

async function recordRun(
  supabaseUrl: string,
  key: string,
  runId: string,
  patch: Record<string, unknown>,
) {
  await fetch(supabaseUrl + "/rest/v1/ingestion_runs?id=eq." + runId, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST required" });

  const apiKey = Deno.env.get("DYNADOT_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = secretKey();

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return json(500, { error: "Missing connector configuration" });
  }

  const input = await req.json().catch(() => ({}));
  const page = Math.max(1, Number(input.page ?? 1));
  const count = Math.min(100, Math.max(1, Number(input.count ?? 100)));

  const headers = {
    apikey: serviceKey,
    Authorization: "Bearer " + serviceKey,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };

  const runId = crypto.randomUUID();
  await fetch(supabaseUrl + "/rest/v1/ingestion_runs", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: runId,
      connector: "ingest-dynadot-auctions",
      status: "running",
      started_at: new Date().toISOString(),
      metadata: { page, count },
    }),
  });

  try {
    const url = new URL(DYNADOT_URL);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("command", "get_open_auctions");
    url.searchParams.set("currency", "usd");
    url.searchParams.set("type", "expired");
    url.searchParams.set("count_per_page", String(count));
    url.searchParams.set("page_index", String(page));

    const upstream = await fetch(url);
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      await recordRun(supabaseUrl, serviceKey, runId, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Dynadot request failed: " + upstream.status,
      });
      return json(502, { error: "Dynadot request failed", status: upstream.status, detail });
    }

    const payload = await upstream.json();
    const auctions: Auction[] = Array.isArray(payload.auction_list) ? payload.auction_list : [];

    const sourceResponse = await fetch(supabaseUrl + "/rest/v1/sources?on_conflict=name", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Dynadot",
        kind: "auction",
        base_url: "https://www.dynadot.com/",
        active: true,
        access_status: "connected",
        credential_env: ["DYNADOT_API_KEY"],
        feed_types: ["auctions", "expired", "backorders", "registry_expired"],
        docs_url: "https://www.dynadot.com/domain/api-commands",
      }),
    });

    if (!sourceResponse.ok) {
      const detail = (await sourceResponse.text()).slice(0, 500);
      await recordRun(supabaseUrl, serviceKey, runId, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Could not initialize source",
      });
      return json(500, { error: "Could not initialize source", detail });
    }

    const sourceLookup = await fetch(
      supabaseUrl + "/rest/v1/sources?name=eq.Dynadot&select=id",
      { headers },
    );
    const sourceRows = await sourceLookup.json();
    const sourceId = sourceRows?.[0]?.id;
    if (!sourceId) throw new Error("Source ID unavailable");

    let imported = 0;
    let skipped = 0;

    for (const item of auctions) {
      const name = String(item.domain ?? "").trim().toLowerCase().replace(/\.$/, "");
      if (!name || !name.includes(".")) {
        skipped++;
        continue;
      }

      const dot = name.lastIndexOf(".");
      const tld = name.slice(dot + 1);
      const normalized = name;

      const domainResponse = await fetch(supabaseUrl + "/rest/v1/domains?on_conflict=normalized_name", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          tld,
          normalized_name: normalized,
          last_seen_at: new Date().toISOString(),
        }),
      });
      if (!domainResponse.ok && domainResponse.status !== 409) {
        skipped++;
        continue;
      }

      const domainLookup = await fetch(
        supabaseUrl + "/rest/v1/domains?normalized_name=eq." +
          encodeURIComponent(normalized) + "&select=id",
        { headers },
      );
      const domainRows = await domainLookup.json();
      const domainId = domainRows?.[0]?.id;
      if (!domainId) {
        skipped++;
        continue;
      }

      const price = item.bid_price == null ? null : Number(item.bid_price);
      const bids = Math.max(0, Math.trunc(Number(item.bids ?? 0)));
      const endsAt = item.end_timestamp
        ? new Date(Number(item.end_timestamp)).toISOString()
        : item.end_time
          ? new Date(item.end_time).toISOString()
          : null;

      const auctionResponse = await fetch(
        supabaseUrl + "/rest/v1/auctions?on_conflict=source_id,external_id",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            domain_id: domainId,
            source_id: sourceId,
            external_id: String(item.auction_id),
            status: "live",
            ends_at: endsAt,
            current_price: Number.isFinite(price) ? price : null,
            currency: item.bid_price_currency ?? "USD",
            bid_count: bids,
            source_url: "https://www.dynadot.com/domain/auction",
            metadata: {
              provider: "dynadot",
              age: item.age ?? null,
              visitors: item.visitors ?? null,
              links: item.links ?? null,
            },
            updated_at: new Date().toISOString(),
          }),
        },
      );

      if (auctionResponse.ok) imported++;
      else skipped++;
    }

    await recordRun(supabaseUrl, serviceKey, runId, {
      source_id: sourceId,
      status: "success",
      completed_at: new Date().toISOString(),
      received: auctions.length,
      processed: auctions.length,
      prepared: auctions.length - skipped,
      imported,
      skipped,
    });

    return json(200, {
      ok: true,
      source: "Dynadot",
      page,
      received: auctions.length,
      imported,
      skipped,
      run_id: runId,
    });
  } catch (error) {
    await recordRun(supabaseUrl, serviceKey, runId, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown connector error",
    });
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown connector error",
      run_id: runId,
    });
  }
});
