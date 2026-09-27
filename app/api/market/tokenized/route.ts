import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE_MAX = 50;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(10, Number(params.get("limit") ?? "50") || 50));
  const sort = params.get("sort") ?? "newest";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "Tokenized market storage is not configured." }, { status: 503 });

  const supabase = createClient(url, key);
  const { data: source } = await supabase.from("sources").select("id,name").eq("name", "Doma").maybeSingle();
  if (!source) return NextResponse.json({ ok: false, error: "Doma source is not configured." }, { status: 503 });

  let query = supabase.from("auctions")
    .select("id,status,current_price,currency,bid_count,starts_at,ends_at,source_url,metadata,domains(name,tld),sources(name)", { count: "exact" })
    .eq("source_id", source.id)
    .eq("status", "live")
    .gte("current_price", 10);

  if (sort === "ending") query = query.order("ends_at", { ascending: true, nullsFirst: false });
  else if (sort === "price-low") query = query.order("current_price", { ascending: true });
  else if (sort === "price-high") query = query.order("current_price", { ascending: false });
  else if (sort === "bids") query = query.order("bid_count", { ascending: false });
  else query = query.order("updated_at", { ascending: false });

  const from = (page - 1) * limit;
  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const total = count ?? 0;
  return NextResponse.json({
    ok: true,
    source: "Doma",
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    listings: data ?? [],
    observedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
