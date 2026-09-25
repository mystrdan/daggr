import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SOURCE_NAME="Verisign Drop Order";
const DOWNLOAD_URL="https://api.namebio.com/verisign-download";

function parseLine(line:string){
  const s=line.trim(); if(!s||s.startsWith("#")) return null;
  const i=s.indexOf(":"); if(i<=0) return null;
  const domain=s.slice(0,i).trim().toLowerCase(), expires=s.slice(i+1).trim();
  if(!domain.includes(".")) return null;
  const d=new Date(expires); return Number.isNaN(d.getTime())?null:{domain,expires_on:d.toISOString()};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return Response.json({ok:false,error:"POST required"},{status:405});
  const supabaseUrl=Deno.env.get("SUPABASE_URL"), raw=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(!supabaseUrl||!raw) return Response.json({ok:false,error:"Supabase runtime credentials unavailable"},{status:503});
  let secret:string; try{secret=Object.values(JSON.parse(raw) as Record<string,string>)[0];}catch{return Response.json({ok:false,error:"Invalid Supabase runtime credentials"},{status:503});}
  const supabase=createClient(supabaseUrl,secret);
  const provided=req.headers.get("x-daggr-ingest-key")??"";
  const {data:credential}=await supabase.from("ingestion_credentials").select("token").eq("name","verisign_full").maybeSingle();
  if(!credential||!provided||provided!==credential.token) return Response.json({ok:false,error:"Unauthorized"},{status:401});

  const started=new Date().toISOString();
  const {data:source}=await supabase.from("sources").select("id").eq("name",SOURCE_NAME).maybeSingle();
  if(!source) return Response.json({ok:false,error:"Source not configured"},{status:500});
  const {data:run}=await supabase.from("ingestion_runs").insert({source_id:source.id,connector:"supabase:verisign-drop-order-full",status:"running",started_at:started,filename:"verisign-drop-order.txt"}).select("id").single();

  try{
    const response=await fetch(DOWNLOAD_URL,{headers:{"User-Agent":"Daggr/1.0 domain market explorer"}});
    if(!response.ok) throw new Error("NameBio download HTTP "+response.status);
    const parsed=(await response.text()).split(/\\r?\\n/).map(parseLine).filter(Boolean) as {domain:string;expires_on:string}[];
    const counters=new Map<string,number>();
    const rows=parsed.map(r=>{
      const registry=r.domain.endsWith(".net")?".net":r.domain.endsWith(".com")?".com":"other";
      const key=registry+"|"+r.expires_on.slice(0,10);
      const order=(counters.get(key)??0)+1; counters.set(key,order);
      return {domain:r.domain,source_id:source.id,registry,expires_on:r.expires_on,drop_order:order,observed_at:started,metadata:{source:SOURCE_NAME}};
    }).filter(r=>r.registry!=="other");
    for(let i=0;i<rows.length;i+=1000){
      const {error}=await supabase.from("drop_orders").upsert(rows.slice(i,i+1000),{onConflict:"domain,registry"});
      if(error) throw new Error("Drop-order upsert failed: "+error.message);
    }
    await supabase.from("sources").update({access_status:"connected"}).eq("id",source.id);
    await supabase.from("ingestion_runs").update({status:"success",completed_at:new Date().toISOString(),received:parsed.length,processed:parsed.length,prepared:rows.length,imported:rows.length,skipped:parsed.length-rows.length,metadata:{observed_at:started}}).eq("id",run.id);
    return Response.json({ok:true,source:SOURCE_NAME,received:parsed.length,imported:rows.length,observedAt:started});
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown ingestion error";
    if(run) await supabase.from("ingestion_runs").update({status:"failed",completed_at:new Date().toISOString(),error:message}).eq("id",run.id);
    return Response.json({ok:false,error:message},{status:502});
  }
});