import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVENTORY_URL = "https://inventory.auctions.godaddy.com/recent_listings.json.zip";
const MIN_PRICE = 10;
const PAGE_SIZE_MAX = 50;

type Listing = {
  id: string;
  domain: string;
  currentPrice: number | null;
  bidCount: number;
  startsAt: string | null;
  endsAt: string | null;
  sourceUrl: string | null;
  listingType: string | null;
};

function money(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) > 100000 ? value / 1_000_000 : value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findRecords(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    if (value.length && value.every((x) => x && typeof x === "object")) {
      const records = value as Record<string, unknown>[];
      if (records.some((r) => text(r.domainName) || text(r.domain) || text(r.name))) return records;
    }
    for (const item of value) {
      const found = findRecords(item);
      if (found.length) return found;
    }
    return [];
  }
  const object = value as Record<string, unknown>;
  for (const key of ["listings", "auctions", "domains", "items", "results", "auctionListings", "records", "data", "rows", "entries"]) {
    const found = findRecords(object[key]);
    if (found.length) return found;
  }
  for (const child of Object.values(object)) {
    const found = findRecords(child);
    if (found.length) return found;
  }
  return [];
}

function parseListing(record: Record<string, unknown>): Listing | null {
  const domain = text(record.domainName) ?? text(record.domain) ?? text(record.name);
  if (!domain || !domain.includes(".")) return null;
  const listingId = text(record.listingId) ?? text(record.auctionId) ?? text(record.id);
  const currentPrice = money(record.currentBid ?? record.currentPrice ?? record.priceCurrent ?? record.price);
  const bidCount = Number(record.numberOfBids ?? record.bidsCount ?? record.bidCount ?? record.bids ?? 0) || 0;
  const startsAt = text(record.auctionStartTime) ?? text(record.auctionStartAt) ?? text(record.startsAt) ?? text(record.startTime);
  const endsAt = text(record.auctionEndTime) ?? text(record.auctionEndAt) ?? text(record.endsAt) ?? text(record.endTime);
  const listingType = text(record.auctionType) ?? text(record.listingType) ?? text(record.type);
  const providerLink = text(record.link) ?? text(record.url) ?? text(record.auctionUrl);
  const slug = domain.toLowerCase().replace(/\./g, "-");
  const sourceUrl = providerLink ?? (listingId ? `https://www.godaddy.com/domain-auctions/${slug}-${listingId}` : `https://www.godaddy.com/domain-auctions/${slug}`);
  return { id: listingId ?? `${domain}-${endsAt ?? ""}`, domain: domain.toLowerCase(), currentPrice, bidCount: Math.max(0, bidCount), startsAt, endsAt, sourceUrl, listingType };
}

async function fetchGoDaddy(): Promise<{ listings: Listing[]; observedAt: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(INVENTORY_URL, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "Daggr/1.0 domain market explorer", Accept: "application/zip, application/octet-stream" },
    });
    if (!response.ok) throw new Error(`GoDaddy inventory HTTP ${response.status}`);
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const jsonFile = Object.entries(archive).find(([name]) => name.toLowerCase().endsWith(".json"));
    if (!jsonFile) throw new Error("GoDaddy inventory archive contained no JSON file");
    const payload = JSON.parse(strFromU8(jsonFile[1]));
    const listings = findRecords(payload).map(parseListing).filter((x): x is Listing => Boolean(x));
    return { listings, observedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
}

async function persist(listings: Listing[], observedAt: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const supabase = createClient(url, key);
  const now = new Date();
    const qualifying = listings.filter((x) => x.currentPrice !== null && x.currentPrice >= MIN_PRICE && (!x.endsAt || new Date(x.endsAt).getTime() > now.getTime()));
  const { data: source } = await supabase.from("sources").select("id").eq("name", "GoDaddy Auctions").maybeSingle();
  if (!source || !qualifying.length) return;

  for (let i = 0; i < qualifying.length; i += 100) {
    const batch = qualifying.slice(i, i + 100);
    const domains = batch.map((item) => ({
      name: item.domain,
      normalized_name: item.domain,
      tld: item.domain.split(".").pop() ?? "",
      last_seen_at: observedAt,
      metadata: { source: "GoDaddy Auctions" },
    }));
    const { error: domainError } = await supabase.from("domains").upsert(domains, { onConflict: "normalized_name" });
    if (domainError) throw domainError;

    const names = batch.map((x) => x.domain);
    const { data: domainRows, error: lookupError } = await supabase.from("domains").select("id,normalized_name").in("normalized_name", names);
    if (lookupError) throw lookupError;
    const ids = new Map((domainRows ?? []).map((row) => [row.normalized_name, row.id]));
    const auctions = batch.flatMap((item) => {
      const domainId = ids.get(item.domain);
      if (!domainId) return [];
      return [{
        domain_id: domainId,
        source_id: source.id,
        external_id: item.id,
        status: "live",
        starts_at: item.startsAt,
        ends_at: item.endsAt,
        current_price: item.currentPrice,
        currency: "USD",
        bid_count: item.bidCount,
        source_url: item.sourceUrl,
        metadata: { listing_type: item.listingType, observed_at: observedAt, min_price_filter: MIN_PRICE },
      }];
    });
    if (auctions.length) {
      const { error } = await supabase.from("auctions").upsert(auctions, { onConflict: "source_id,external_id" });
      if (error) throw error;
    }
  }

  await supabase.from("sources").update({ active: true, access_status: "connected" }).eq("id", source.id);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(10, Number(params.get("limit") ?? "25") || 25));
  const sort = params.get("sort") ?? "newest";

  try {
    const { listings, observedAt } = await fetchGoDaddy();
    const now = new Date();
    const qualifying = listings.filter((x) => x.currentPrice !== null && x.currentPrice >= MIN_PRICE && (!x.endsAt || new Date(x.endsAt).getTime() > now.getTime()));

    if (sort === "ending") qualifying.sort((a, b) => (a.endsAt ?? "9999").localeCompare(b.endsAt ?? "9999"));
    else if (sort === "bids") qualifying.sort((a, b) => b.bidCount - a.bidCount);
    else if (sort === "price-low") qualifying.sort((a, b) => (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity));
    else if (sort === "price-high") qualifying.sort((a, b) => (b.currentPrice ?? -1) - (a.currentPrice ?? -1));
    else qualifying.sort((a, b) => (b.endsAt ?? "").localeCompare(a.endsAt ?? ""));

    await persist(qualifying, observedAt);

    const total = qualifying.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const from = (safePage - 1) * limit;
    const listingsPage = qualifying.slice(from, from + limit).map((item) => ({
      id: item.id,
      current_price: item.currentPrice,
      currency: "USD",
      bid_count: item.bidCount,
      starts_at: item.startsAt,
      ends_at: item.endsAt,
      source_url: item.sourceUrl,
      domains: { name: item.domain, tld: item.domain.split(".").pop() ?? "" },
      sources: { name: "GoDaddy Auctions" },
    }));

    return NextResponse.json({
      ok: true,
      source: "GoDaddy Auctions",
      minimumPrice: MIN_PRICE,
      page: safePage,
      limit,
      total,
      totalPages,
      listings: listingsPage,
      observedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "GoDaddy market feed unavailable" }, { status: 502 });
  }
}
