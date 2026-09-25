import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as cheerio from "npm:cheerio@1.1.2";

const SOURCE = "DropCatch";
const PAGE_URL = "https://www.dropcatch.com/";
const BATCH = 100;

function json(status:number, body:unknown) {
  return new Response(JSON.stringify(body), { status, headers: {"Content-Type":"application/json"} });
}

function money(value:string): number|null {
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bids(value:string): number {
  const n = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function cleanDomain(value:string): string|null {
  const d = value.trim().toLowerCase().replace(/^https?:\/\/[^/]+\/domain\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return d.includes(".") && !/\s/.test(d) ? d : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, {ok:false,error:"POST required"});

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, {ok:false,error:"Missing Supabase configuration"});

  const headers = {
    "User-Agent":"Mozilla/5.0 (compatible; Daggr/1.0; +https://daggr.vercel.app)",
    "Accept":"text/html,application/xhtml+xml"
  };

  let html = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(PAGE_URL, {headers, signal:controller.signal});
      if (!response.ok) return json(502,{ok:false,error:"DropCatch upstream HTTP "+response.status});
      html = await response.text();
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return json(502,{ok:false,error:"DropCatch upstream unavailable",detail:error instanceof Error ? error.message : "fetch failed"});
  }

  const $ = cheerio.load(html);
  const source = await fetch(supabaseUrl+"/rest/v1/sources?name=eq."+encodeURIComponent(SOURCE)+"&select=id",{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
  let sourceRows = await source.json();
  let sourceId = sourceRows?.[0]?.id;
  if (!sourceId) {
    const created = await fetch(supabaseUrl+"/rest/v1/sources?on_conflict=name",{
      method:"POST",
      headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify({name:SOURCE,kind:"auction",base_url:"https://www.dropcatch.com/",active:true,access_status:"connected",feed_types:["auctions"]})
    });
    if (!created.ok) return json(500,{ok:false,error:"Could not initialize DropCatch source"});
    sourceRows = await created.json();
    sourceId = sourceRows?.[0]?.id;
  }
  if (!sourceId) return json(500,{ok:false,error:"DropCatch source ID unavailable"});

  const rows:Array<{domain:string;price:number|null;bidCount:number;type:string}> = [];
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("th,td").map((__, cell) => $(cell).text(" ", true).replace(/\s+/g," ").trim()).get();
    if (cells.length < 5) return;
    const domain = cleanDomain(cells[0]);
    const price = money(cells[cells.length-2]);
    const bidCount = bids(cells[cells.length-1]);
    const type = cells[2] || "";
    if (domain && (price !== null || bidCount > 0)) rows.push({domain,price,bidCount,type});
  });

  const unique = [...new Map(rows.map(r => [r.domain,r])).values()].slice(0,500);
  if (!unique.length) return json(502,{ok:false,error:"No DropCatch auction rows found in public page"});

  const now = new Date().toISOString();
  let imported=0, skipped=0;

  for (let offset=0; offset<unique.length; offset+=BATCH) {
    const batch=unique.slice(offset,offset+BATCH);
    const domains=batch.map(r=>{
      const dot=r.domain.lastIndexOf(".");
      return {name:r.domain,tld:r.domain.slice(dot+1),normalized_name:r.domain,last_seen_at:now,first_seen_at:now,metadata:{provider:"dropcatch"}};
    });
    const dres=await fetch(supabaseUrl+"/rest/v1/domains?on_conflict=normalized_name",{
      method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify(domains)
    });
    if(!dres.ok){skipped+=batch.length;continue;}

    const or=batch.map(r=>"normalized_name.eq."+encodeURIComponent(r.domain)).join(",");
    const lookup=await fetch(supabaseUrl+"/rest/v1/domains?select=id,normalized_name&or=("+or+")",{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
    if(!lookup.ok){skipped+=batch.length;continue;}
    const domainRows=await lookup.json();
    const ids=new Map(domainRows.map((r:{id:string;normalized_name:string})=>[r.normalized_name,r.id]));
    const auctions=batch.map(r=>{
      const domainId=ids.get(r.domain);
      if(!domainId)return null;
      return {domain_id:domainId,source_id:sourceId,external_id:r.domain,status:"live",current_price:r.price,currency:"USD",bid_count:r.bidCount,source_url:"https://www.dropcatch.com/domain/"+r.domain,metadata:{provider:"dropcatch",listing_type:r.type,observed_at:now},updated_at:now};
    }).filter(Boolean);
    if(!auctions.length){skipped+=batch.length;continue;}
    const ares=await fetch(supabaseUrl+"/rest/v1/auctions?on_conflict=source_id,external_id",{
      method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify(auctions)
    });
    if(ares.ok) imported+=auctions.length; else skipped+=batch.length;
  }

  await fetch(supabaseUrl+"/rest/v1/sources?id=eq."+encodeURIComponent(sourceId),{
    method:"PATCH",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json"},
    body:JSON.stringify({access_status:"connected",feed_types:["auctions"]})
  });

  return json(200,{ok:imported>0,source:SOURCE,received:rows.length,prepared:unique.length,imported,skipped});
});
