import { unzipSync, strFromU8 } from "fflate";

const INVENTORY_URL = "https://origin-auctions-inventory.godaddy.com/recent_listings.json.zip";

function findRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value) && value.length && typeof value[0] === "object") return value as Record<string, unknown>[];
  if (value && typeof value === "object") {
    for (const key of ["listings","auctions","domains","items","results","auctionListings","records","data","rows","entries"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate) && candidate.length && typeof candidate[0] === "object") return candidate as Record<string, unknown>[];
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
    const v = row[name];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function money(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 100000 ? n / 1000000 : n;
}

export const revalidate = 300;

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(INVENTORY_URL, {
      cache: "no-store",
      headers: { "User-Agent": "Daggr/1.0 market explorer" },
      signal: controller.signal,
    });
    if (!response.ok) return Response.json({ ok: false, error: `GoDaddy inventory HTTP ${response.status}` }, { status: 502 });

    const bytes = new Uint8Array(await response.arrayBuffer());
    const archive = unzipSync(bytes);
    const jsonFile = Object.keys(archive).find((name) => /\.json$/i.test(name));
    if (!jsonFile) return Response.json({ ok: false, error: "No JSON file in GoDaddy archive" }, { status: 502 });

    const parsed = JSON.parse(strFromU8(archive[jsonFile]));
    const rows = findRecords(parsed);

    const listings = rows.slice(0, 200).map((row) => {
      const domain = String(pick(row, ["domainName","domain","name"]) ?? "").toLowerCase();
      return {
        domain,
        listingId: pick(row, ["listingId","listingID","id"]),
        currentPrice: money(pick(row, ["priceCurrent","currentBid","bidAmountUsd","price"])),
        bidCount: Number(pick(row, ["bidsCount","bidCount","bids"]) ?? 0),
        endsAt: pick(row, ["auctionEndAt","endTime","endsAt","auction_end_at"]),
        startsAt: pick(row, ["auctionStartAt","startTime","startsAt","auction_start_at"]),
        listingType: pick(row, ["listingType","type"]),
      };
    }).filter((row) => row.domain.includes("."));

    return Response.json({
      ok: true,
      source: "GoDaddy Auctions",
      observedAt: new Date().toISOString(),
      count: listings.length,
      listings,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: "GoDaddy inventory could not be read",
      detail: error instanceof Error ? error.message : "unknown error",
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}