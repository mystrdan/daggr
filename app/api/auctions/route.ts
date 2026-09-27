import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PRICE = 10;
const PAGE_SIZE_MAX = 50;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(10, Number(params.get("limit") ?? "25") || 25));
  const sort = params.get("sort") ?? "newest";
  const sourceName = params.get("source")?.trim() || "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "Market storage is not configured." }, { status: 503 });
  }

  try {
    const supabase = createClient(url, key);
    let query = supabase.from("auctions")
      .select("id,status,current_price,currency,bid_count,starts_at,ends_at,source_url,domains(name,tld),sources!inner(name,active,access_status)", { count: "exact" })
      .eq("status", "live")
      .eq("sources.active", true)
      .gte("current_price", MIN_PRICE);

    if (sourceName) query = query.eq("sources.name", sourceName);

    if (sort === "ending") query = query.order("ends_at", { ascending: true, nullsFirst: false });
    else if (sort === "bids") query = query.order("bid_count", { ascending: false });
    else if (sort === "price-low") query = query.order("current_price", { ascending: true });
    else if (sort === "price-high") query = query.order("current_price", { ascending: false });
    else query = query.order("updated_at", { ascending: false });

    const from = (page - 1) * limit;
    const { data, error, count } = await query.range(from, from + limit - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const total = count ?? 0;
    return NextResponse.json({
      ok: true,
      market: "domain-auctions",
      minimumPrice: MIN_PRICE,
      source: sourceName || "all-connected-sources",
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      listings: data ?? [],
      observedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Market feed unavailable" }, { status: 502 });
  }
}
