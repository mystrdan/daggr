import { fetchGoDaddyListings } from "../../../../lib/market/godaddy";

export const revalidate = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? "50") || 50));
  const sort = url.searchParams.get("sort") ?? "newest";
  const minPrice = Math.max(10, Number(url.searchParams.get("minPrice") ?? "10") || 10);
  const offset = (page - 1) * limit;

  try {
    const { listings, observedAt, rawCount } = await fetchGoDaddyListings(0, 0);
    const filtered = listings.filter((listing) => listing.currentPrice !== null && listing.currentPrice >= minPrice);
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "ending") return (new Date(a.endsAt ?? "9999-12-31").getTime() - new Date(b.endsAt ?? "9999-12-31").getTime());
      if (sort === "bids") return b.bidCount - a.bidCount;
      if (sort === "price-low") return (a.currentPrice ?? Number.POSITIVE_INFINITY) - (b.currentPrice ?? Number.POSITIVE_INFINITY);
      if (sort === "price-high") return (b.currentPrice ?? -1) - (a.currentPrice ?? -1);
      return 0;
    });
    const pageListings = sorted.slice(offset, offset + limit);

    return Response.json({
      ok: true,
      source: "GoDaddy Auctions",
      observedAt,
      page,
      limit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      minPrice,
      sort,
      count: pageListings.length,
      listings: pageListings,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: "GoDaddy inventory could not be read",
      detail: error instanceof Error ? error.message : "unknown error",
    }, { status: 502 });
  }
}
