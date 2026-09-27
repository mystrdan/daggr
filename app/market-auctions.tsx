"use client";

import { useEffect, useState } from "react";

type Listing = {
  id: string; current_price: number | null; currency: string; bid_count: number;
  starts_at: string | null; ends_at: string | null; source_url: string | null;
  domains: { name: string; tld: string } | null; sources: { name: string } | null;
};
type Payload = { ok:boolean; listings:Listing[]; total:number; totalPages:number; page:number; limit:number; error?:string; observedAt?:string };

export default function MarketAuctions() {
  const [data,setData]=useState<Payload|null>(null);
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState("newest");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let live=true; setLoading(true);
    fetch(`/api/market/auctions?page=${page}&limit=25&sort=${sort}`,{cache:"no-store"})
      .then(async r=>{const p=await r.json(); if(!r.ok||!p.ok) throw new Error(p.error||"Market feed unavailable"); if(live)setData(p);})
      .catch(e=>live&&setData({ok:false,listings:[],total:0,totalPages:1,page,limit:25,error:e instanceof Error?e.message:"Market feed unavailable"}))
      .finally(()=>live&&setLoading(false));
    return()=>{live=false};
  },[page,sort]);

  const money=(v:number|null,c:string)=>v===null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:c,maximumFractionDigits:2}).format(v);
  const rows=data?.listings??[];

  return <div>
    <div className="market-toolbar">
      <div className="market-tabs">
        {([["newest","Newest"],["ending","Ending soon"],["bids","Most bids"],["price-low","Lowest $10+"],["price-high","Highest"]] as const).map(([v,l])=>
          <button key={v} className={sort===v?"active":""} onClick={()=>{setSort(v);setPage(1)}}>{l}</button>)}
      </div>
      <span className="market-total">{data?.total ? `${data.total.toLocaleString()} qualifying auctions` : "Minimum current price: $10"}</span>
    </div>
    {loading&&!rows.length?<div className="empty compact"><h3>Loading market…</h3><p>Showing open auctions with a current price of at least $10.</p></div>
    :data?.error?<div className="empty"><div className="empty-mark">!</div><h3>Market feed unavailable.</h3><p>{data.error}</p></div>
    :!rows.length?<div className="empty"><div className="empty-mark">◇</div><h3>No qualifying auctions.</h3><p>Daggr filters out active auctions below $10 to keep the market feed focused.</p></div>
    :<>
      <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Market</th><th>Bids</th><th>Current</th><th>Ends</th><th>Open</th></tr></thead><tbody>
      {rows.map(item=>{const open=!!item.source_url&&(!item.ends_at||new Date(item.ends_at).getTime()>Date.now());return <tr key={item.id}>
        <td><strong>{item.domains?.name??"Unknown"}</strong></td>
        <td>{item.sources?.name??"Unknown"}</td><td>{item.bid_count}</td><td>{money(item.current_price,item.currency)}</td>
        <td>{item.ends_at?new Date(item.ends_at).toLocaleString():"—"}</td>
        <td>{open?<a href={item.source_url!} target="_blank" rel="noopener noreferrer" className="auction-link">Open auction ↗</a>:"Closed"}</td>
      </tr>})}</tbody></table></div>
      <div className="market-pagination">
        <button disabled={page<=1||loading} onClick={()=>setPage(v=>Math.max(1,v-1))}>← Previous</button>
        <span>Page {page.toLocaleString()} of {(data?.totalPages??1).toLocaleString()}</span>
        <button disabled={page>=(data?.totalPages??1)||loading} onClick={()=>setPage(v=>Math.min(data?.totalPages??1,v+1))}>Next →</button>
      </div>
      <p className="muted" style={{marginTop:"12px"}}>Open auctions only · current price ≥ $10 · multiple market sources · observed {data?.observedAt?new Date(data.observedAt).toLocaleTimeString():"now"}</p>
    </>}
  </div>;
}
