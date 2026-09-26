import { unzipSync, strFromU8 } from "fflate";

export const GODADDY_INVENTORY_URL = "https://origin-auctions-inventory.godaddy.com/biddable_auctions_non_adult.json.zip";

function findRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value) && value.length && typeof value[0] === "object") {
    return value as Record<string, unknown>[];
  }
  if (value && typeof value === "object") {
    for (const key of ["listings","auctions","domains","items","results","auctionListings","records","data","rows","entries"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate) && candidate.length && typeof candidate[0] === "object") {
        return candidate as Record<string, unknown>[];
      }
    }
    for (const child of Object.values(value as Record<string, unknown>)) {
      const found = findRecords(child);
      if (found.length) return found;
    }
  }
  return [];
}

function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function money(value: unknown): number | null {
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["amount", "value", "usd", "price", "current", "currentBid", "bid", "microUnits"]) {
      if (object[key] !== undefined && object[key] !== null) {
        const parsed = money(object[key]);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    const number = Number(cleaned);
    return Number.isFinite(number) ? (number > 100000 ? number / 1000000 : number) : null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 100000 ? number / 1000000 : number;
}

export type GoDaddyListing = {
  domain: string;
  listingId: string | null;
  currentPrice: number | null;
  bidCount: number;
  endsAt: string | null;
  startsAt: string | null;
  listingType: string | null;
  sourceUrl: string | null;
};

export async function fetchGoDaddyListings(limit = 200, offset = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(GODADDY_INVENTORY_URL, {
      next: { revalidate: 300 },
      headers: { "User-Agent": "Daggr/1.0 market explorer" },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`GoDaddy inventory HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    const archive = unzipSync(bytes);
    const jsonFile = Object.keys(archive).find((name) => /\.json$/i.test(name));
    if (!jsonFile) throw new Error("No JSON file in GoDaddy archive");

    const parsed = JSON.parse(strFromU8(archive[jsonFile]));
    const rows = findRecords(parsed);

    const selectedRows = limit > 0 ? rows.slice(offset, offset + limit) : rows.slice(offset);
    const listings = selectedRows.map((row) => {
      const domain = String(pick(row, ["domainName","domain","name"]) ?? "").trim().toLowerCase();
      const link = String(pick(row, ["link"]) ?? "");
      const listingId = String(
        pick(row, ["listingId","listingID","id"]) ??
        (link.match(/-(\d+)(?:\?|$)/)?.[1] ?? "")
      ) || null;

      return {
        domain,
        listingId,
        currentPrice: money(pick(row, ["priceCurrent","currentBid","bidAmountUsd","price","currentPrice","bid","bidPrice","minimumBid","price_current"])),
        bidCount: Number(pick(row, ["bidsCount","bidCount","numberOfBids","bids"]) ?? 0),
        endsAt: String(pick(row, ["auctionEndAt","auctionEndTime","endTime","endsAt","auction_end_at"]) ?? "") || null,
        startsAt: String(pick(row, ["auctionStartAt","auctionStartTime","startTime","startsAt","auction_start_at"]) ?? "") || null,
        listingType: String(pick(row, ["listingType","auctionType","type"]) ?? "") || null,
        sourceUrl: link || null,
      };
    }).filter((row) => row.domain.includes("."));

    return { listings, observedAt: new Date().toISOString(), rawCount: rows.length };
  } finally {
    clearTimeout(timeout);
  }
}
