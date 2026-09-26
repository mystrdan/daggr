import { createClient } from "@supabase/supabase-js";
import { fetchGoDaddyListings } from "../../../../lib/market/godaddy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "Server-side Supabase credentials are not configured" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startedAt = new Date().toISOString();

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id")
    .eq("name", "GoDaddy Auctions")
    .maybeSingle();

  if (sourceError || !source) {
    return Response.json({ ok: false, error: "GoDaddy source is not configured" }, { status: 500 });
  }

  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({
      source_id: source.id,
      connector: "vercel:goddaddy-recent-listings",
      status: "running",
      started_at: startedAt,
      filename: "recent_listings.json.zip",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return Response.json({ ok: false, error: "Could not create ingestion run" }, { status: 500 });
  }

  try {
    const { listings: allListings, observedAt, rawCount } = await fetchGoDaddyListings(0, 0);
    const listings = allListings.filter((listing) => listing.currentPrice !== null && listing.currentPrice >= 10);

    const domains = listings.map((listing) => {
      const [label, ...rest] = listing.domain.split(".");
      return {
        name: listing.domain,
        normalized_name: listing.domain,
        tld: rest.length ? rest.join(".") : "",
        last_seen_at: observedAt,
        metadata: { source: "GoDaddy Auctions" },
      };
    }).filter((domain) => domain.tld);

    const { data: domainRows, error: domainError } = await supabase
      .from("domains")
      .upsert(domains, { onConflict: "normalized_name" })
      .select("id,normalized_name");

    if (domainError) throw new Error(`Domain upsert failed: ${domainError.message}`);

    const domainMap = new Map((domainRows ?? []).map((row) => [row.normalized_name, row.id]));

    const externalIds = listings.map((listing) => listing.listingId).filter(Boolean) as string[];
    const { data: existingAuctions, error: existingError } = externalIds.length
      ? await supabase
          .from("auctions")
          .select("id,external_id")
          .eq("source_id", source.id)
          .in("external_id", externalIds)
      : { data: [], error: null };

    if (existingError) throw new Error(`Auction lookup failed: ${existingError.message}`);

    const existingMap = new Map((existingAuctions ?? []).map((row) => [row.external_id, row.id]));
    const auctionRows = listings.map((listing) => {
      const domainId = domainMap.get(listing.domain);
      if (!domainId || !listing.listingId) return null;
      return {
        id: existingMap.get(listing.listingId) ?? undefined,
        domain_id: domainId,
        source_id: source.id,
        external_id: listing.listingId,
        status: "live",
        starts_at: listing.startsAt,
        ends_at: listing.endsAt,
        current_price: listing.currentPrice,
        currency: "USD",
        bid_count: Number.isFinite(listing.bidCount) ? Math.max(0, listing.bidCount) : 0,
        source_url: `https://www.godaddy.com/domain-auctions/${listing.domain.replace(/\./g, "-")}-${listing.listingId}`,
        metadata: {
          listing_type: listing.listingType,
          observed_at: observedAt,
        },
      };
    }).filter(Boolean) as Record<string, unknown>[];

    let imported = 0;
    if (auctionRows.length) {
      const { error: auctionError } = await supabase.from("auctions").upsert(auctionRows);
      if (auctionError) throw new Error(`Auction upsert failed: ${auctionError.message}`);
      imported = auctionRows.length;
    }

    await supabase
      .from("sources")
      .update({ access_status: "connected" })
      .eq("id", source.id);

    await supabase
      .from("ingestion_runs")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        received: rawCount,
        processed: listings.length,
        prepared: auctionRows.length,
        imported,
        skipped: listings.length - auctionRows.length,
        metadata: { observed_at: observedAt, minimum_price_usd: 10 },
      })
      .eq("id", run.id);

    return Response.json({
      ok: true,
      source: "GoDaddy Auctions",
      runId: run.id,
      received: rawCount,
      processed: listings.length,
      imported,
      skipped: listings.length - auctionRows.length,
      observedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error";
    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", run.id);

    return Response.json({ ok: false, runId: run.id, error: message }, { status: 502 });
  }
}
