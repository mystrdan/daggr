import Link from "next/link";
import { db } from "../lib/db";
import { getNews } from "../lib/news";

export const dynamic = "force-dynamic";
const SIZE = 25;

async function getMarkets(page: number, query: string) {
  const s = db();
  if (!s) return { items: [], total: 0 };
  const from = (page - 1) * SIZE, to = from + SIZE - 1;
  let request = s.from("markets").select("id,price,currency,bid_count,min_bid,starts_at,ends_at,source_url,market_type,status,assets(name,tld),sources(name)", { count: "exact" }).eq("status", "active").gte("min_bid", 10);\n  if (query) request = request.ilike("assets.name", `%${query.replace(/[%_]/g, "")}%`);\n  const { data, count } = await request.order("ends_at", { ascending: true }).range(from, to);
  return { items: data || [], total: count || 0 };
}
async function getCoverage() {
  const s = db();
  if (!s) return [];
  const { data } = await s.from("sources").select("slug,name,url,access_status").eq("kind", "domainfi").order("name");
  return data || [];
}
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const q = await searchParams, page = Math.max(1, Number(q.page || 1) || 1);
  const [markets, news, coverage] = await Promise.all([getMarkets(page), getNews(), getCoverage()]);
  const pages = Math.max(1, Math.ceil(markets.total / SIZE));
  return <main>
    <header><Link href="/" className="logo">daggr.</Link><nav><Link href="/">Markets</Link><a href="#news">News</a></nav></header>
    <section className="hero"><small>DOMAIN MARKET EXPLORER</small><h1>Discover domains moving onchain.</h1><p>Market discovery for domain listings, auctions, sales and activity.</p><form className="bar" action="/" method="get"><input name="q" defaultValue={query} placeholder="Search domains..." aria-label="Search domains" /><button type="submit">Search</button></form></section>
    <div className="grid">
      <section><div className="head"><div><small>MARKET</small><h2>Live markets</h2></div><b>Minimum bid $10</b></div>
      {markets.items.length ? <div className="list">{markets.items.map((x:any)=><div className="row" key={x.id}><div><Link className="domain" href={"/domains/"+encodeURIComponent(x.assets?.name||"")}>{x.assets?.name||"—"}</Link><small>{x.sources?.name||"Unknown"} · {x.market_type}</small></div><strong>{x.currency||"USD"} {Number(x.price||0).toLocaleString()}</strong><span>{x.bid_count||0} bids · min {`${x.currency||"USD"} ${Number(x.min_bid).toLocaleString()}`}</span><span>{x.ends_at?new Date(x.ends_at).toLocaleString():"—"}</span>{x.status==="active"&&x.source_url?<a href={x.source_url} target="_blank" rel="noopener noreferrer">Open ↗</a>:<span>Closed</span>}</div>)}</div> : <div className="empty">No live markets with a minimum bid of $10 or more. Low-value listings are intentionally excluded.</div>}
      <div className="pager">{page>1?<Link href={"/?page="+(page-1)}>← Prev</Link>:<i/>}<span>Page {page} / {pages}</span>{page<pages?<Link href={"/?page="+(page+1)}>Next →</Link>:<i/>}</div></section>
      <aside id="news"><div className="head"><div><small>DOMAIN PULSE</small><h2>News</h2></div><span>5 sources</span></div>{news.slice(0,5).map(x=><a className="news" href={x.url} target="_blank" rel="noopener noreferrer" key={x.source}><small>{x.source}</small><b>{x.title}</b></a>)}</aside>

    </div>
  </main>;
}
