import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams; const page=Math.max(1,Number(p.get("page")||"1")||1); const limit=Math.min(50,Math.max(10,Number(p.get("limit")||"25")||25)); const sort=p.get("sort")||"newest";
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return NextResponse.json({ok:false,error:"Market storage is not configured."},{status:503});
 const sb=createClient(url,key);
 let q=sb.from("auctions").select("id,current_price,currency,bid_count,starts_at,ends_at,source_url,domains(name,tld),sources(name)",{count:"exact"})
   .eq("status","live").gte("current_price",10);
 if(sort==="ending")q=q.order("ends_at",{ascending:true,nullsFirst:false}); else if(sort==="bids")q=q.order("bid_count",{ascending:false}); else if(sort==="price-low")q=q.order("current_price",{ascending:true}); else if(sort==="price-high")q=q.order("current_price",{ascending:false}); else q=q.order("updated_at",{ascending:false});
 const from=(page-1)*limit; const {data,error,count}=await q.range(from,from+limit-1);
 if(error)return NextResponse.json({ok:false,error:error.message},{status:500});
 const total=count??0;
 return NextResponse.json({ok:true,page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit)),listings:data??[],observedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}