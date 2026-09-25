import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(
    typeof value === "number" ? (value < 10000000000 ? value * 1000 : value) : String(value),
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(o: Record<string, unknown>, keys: string[]) {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return null;
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

  const apiKey = Deno.env.get("NAMECHEAP_MARKET_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = secretKey();
  const apiBase =
    Deno.env.get("NAMECHEAP_MARKET_API_URL") ??
    "https://aftermarketapi.namecheap.com/client";

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return json(500, { error: "Missing connector configuration" });
  }

  const input = await req.json().catch(() => ({}));
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.page_size ?? 100)));
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
      connector: "ingest-namecheap-auctions",
      status: "running",
      started_at: new Date().toISOString(),
      metadata: { page, page_size: pageSize },
    }),
  });

  try {
    const url = new URL(apiBase.replace(/\/$/, "") + "/sales");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));

    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + apiKey,
        "X-API-Key": apiKey,
      },
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      await recordRun(supabaseUrl, serviceKey, runId, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: "Namecheap Market request failed: " + upstream.status,
      });
      return json(502, { error: "Namecheap Market request failed", status: upstream.status, detail });
    }

    const payload = await upstream.json();
    const rows = Array.isArray(payload)
      ? payload
      : (payload.items ?? payload.sales ?? payload.data ?? payload.results ?? []);
    if (!Array.isArray(rows)) {
      throw new Error("Unrecognized Namecheap Market response shape");
    }

    const sourceUpsert = await fetch(
      supabaseUrl + "/rest/v1/sources?on_conflict=name",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Namecheap Market",
          kind: "auction",
          base_url: "https://www.namecheap.com/market/",
          active: true,
          access_status: "connected",
          credential_env: ["NAMECHEAP_MARKET_API_KEY", "NAMECHEAP_MARKET_API_URL"],
          feed_types: ["auctions", "sales"],
          docs_url: "https://aftermarketapi.namecheap.com/client/docs/",
        }),
      },
    );
    if (!sourceUpsert.ok) {
      const detail = (await sourceUpsert.text()).slice(0, 500);
      throw new Error("Could not initialize source: " + detail);
    }

    const sourceLookup = await fetch(
      supabaseUrl + "/rest/v1/sources?name=eq.Namecheap%20Market&select=id",
      { headers },
    );
    const sourceRows = await sourceLookup.json();
    const sourceId = sourceRows?.[0]?.id;
    if (!sourceId) throw new Error("Source ID unavailable");

    let imported = 0;
    let skipped = 0;

    for (const raw of rows) {
      const item = raw as Record<string, unknown>;
      const name = String(
        pick(item, ["domain", "domainName", "name"]) ?? "",
      ).trim().toLowerCase().replace(/\.$/, "");
      if (!name || !name.includes(".")) {
        skipped++;
        continue;
      }

      const dot = name.lastIndexOf(".");
      const tld = name.slice(dot + 1);
      const externalId = String(
        pick(item, ["id", "saleId", "auctionId", "listingId"]) ?? name,
      );
      const price = num(
        pick(item, ["currentBid", "currentPrice", "price", "minimumBid", "bid"]),
      );
      const bids = Math.max(
        0,
        Math.trunc(num(pick(item, ["bidCount", "bids", "numberOfBids"])) ?? 0),
      );
      const startsAt = iso(
        pick(item, ["startDate", "startTime", "auctionStart", "createdAt"]),
      );
      const endsAt = iso(
        pick(item, ["endDate", "endTime", "auctionEnd", "expiresAt"]),
      );
      const sourceUrl = String(
        pick(item, ["url", "auctionUrl", "permalink"]) ??
          "https://www.namecheap.com/market/auctions/",
      );

      const domainResponse = await fetch(
        supabaseUrl + "/rest/v1/domains?on_conflict=normalized_name",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name,
            tld,
            normalized_name: name,
            last_seen_at: new Date().toISOString(),
            metadata: { provider: "namecheap" },
          }),
        },
      );
      if (!domainResponse.ok && domainResponse.status !== 409) {
        skipped++;
        continue;
      }

      const domainLookup = await fetch(
        supabaseUrl +
          "/rest/v1/domains?normalized_name=eq." +
          encodeURIComponent(name) +
          "&select=id",
        { headers },
      );
      const domainRows = await domainLookup.json();
      const domainId = domainRows?.[0]?.id;
      if (!domainId) {
        skipped++;
        continue;
      }

      const response = await fetch(
        supabaseUrl + "/rest/v1/auctions?on_conflict=source_id,external_id",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            domain_id: domainId,
            source_id: sourceId,
            external_id: externalId,
            status: "live",
            starts_at: startsAt,
            ends_at: endsAt,
            current_price: price,
            currency: String(pick(item, ["currency", "bidCurrency"]) ?? "USD"),
            bid_count: bids,
            source_url: sourceUrl,
            metadata: { provider: "namecheap", raw: item },
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (response.ok) imported++;
      else skipped++;
    }

    await recordRun(supabaseUrl, serviceKey, runId, {
      source_id: sourceId,
      status: "success",
      completed_at: new Date().toISOString(),
      received: rows.length,
      processed: rows.length,
      prepared: rows.length - skipped,
      imported,
      skipped,
    });

    return json(200, {
      ok: true,
      source: "Namecheap Market",
      page,
      received: rows.length,
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
