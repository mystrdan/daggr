import { createClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";
import Link from "next/link";
import LiveAuctions from "./live-auctions";


async function getLiveGoDaddy(): Promise<Auction[]> {
  try {
    const response = await fetch("https://origin-auctions-inventory.godaddy.com/recent_listings.json.zip", { cache: "no-store", headers: { "User-Agent": "Daggr/1.0 market explorer" } });
    if (!response.ok) return [];
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const jsonFile = Object.keys(archive).find((name) => /\\.json$/i.test(name));
    if (!jsonFile) return [];
    const parsed = JSON.parse(strFromU8(archive[jsonFile]));
    const findRecords = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value) && value.length && typeof value[0] === "object") return value as Record<string, unknown>[];
      if (value && typeof value === "object") {
        for (const key of ["listings","auctions","domains","items","results","auctionListings","records","data","rows","entries"]) {
          const candidate = (value as Record<string, unknown>)[key];
          if (Array.isArray(candidate) && candidate.length && typeof candidate[0] === "object") return candidate as Record<string, unknown>[];
        }
        for (const child of Object.values(value as Record<string, unknown>)) { const found = findRecords(child); if (found.length) return found; }
      }
      return [];
    };
    const pick = (row: Record<string, unknown>, names: string[]) => names.map((name) => row[name]).find((v) => v !== undefined && v !== null && v !== "") ?? null;
    const money = (value: unknown) => { const n = Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : null; };
    return findRecords(parsed).slice(0, 200).map((row, index) => {
      const domain = String(pick(row, ["domainName","domain","name"]) ?? "").toLowerCase();
      const link = String(pick(row, ["link"]) ?? "");
      const listingId = String(pick(row, ["listingId","listingID","id"]) ?? link.match(/-(\\d+)(?:\\?|$)/)?.[1] ?? index);
      return { id: "godaddy-" + listingId, status: "live", current_price: money(pick(row, ["priceCurrent","currentBid","bidAmountUsd","price"])), currency: "USD", bid_count: Number(pick(row, ["bidsCount","bidCount","numberOfBids","bids"]) ?? 0), ends_at: String(pick(row, ["auctionEndAt","auctionEndTime","endTime","endsAt","auction_end_at"]) ?? "") || null, domains: { name: domain, tld: domain.split(".").pop() ?? "" }, sources: { name: "GoDaddy Auctions" } };
    }).filter((row) => row.domains.name.includes("."));
  } catch { return []; }
}

type Auction = {
  id: string; status: string; current_price: number | null; currency: string;
  bid_count: number; ends_at: string | null;
  domains: { name: string; tld: string } | null;
  sources: { name: string } | null;
};
type ActivityEvent = {
  id: number; event_type: string; price: number | null; bid_count: number | null; occurred_at: string;
  auctions: { domains: { name: string; tld: string } | null; sources: { name: string } | null; currency: string } | null;
};
type Sale = {
  id: string; sale_price: number | null; currency: string; sold_at: string | null; source_url: string | null;
  domains: { name: string; tld: string } | null; sources: { name: string } | null;
};
type MarketUpdate = {
  id: string; title: string; url: string; category: string; published_at: string | null;
  sources: { name: string } | null;
};
type MarketStats = { endingSoon: number; sales: number; domains: number };
type Source = { id: string; name: string; active: boolean; kind: string; access_status: string; credential_env: string[]; feed_types: string[] };
type SourceFreshness = { id: string; name: string; active: boolean; access_status: string; credential_env: string[]; feed_types: string[]; latest: string | null };
export const dynamic = "force-dynamic";

 type MarketData = {
  auctions: Auction[]; activity: ActivityEvent[]; sales: Sale[]; endingSoon: Auction[];
  pulse: MarketUpdate[]; stats: MarketStats; sources: SourceFreshness[];
};

async function getMarketData(): Promise<MarketData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabase = url && key ? createClient(url, key) : null;
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (!supabase) {
    const liveAuctions = await getLiveGoDaddy();
    return { auctions: liveAuctions, activity: [], sales: [], endingSoon: [], pulse: [], stats: { endingSoon: 0, sales: 0, domains: liveAuctions.length }, sources: [] };
  }

  const [auctionResult, endingResult, activityResult, salesResult, salesCountResult, domainsResult, pulseResult, sourcesResult, freshnessResult] =
    await Promise.all([
      supabase.from("auctions").select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld),sources(name)")
        .eq("status", "live").order("ends_at", { ascending: true }).limit(20),
      supabase.from("auctions").select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld),sources(name)")
        .eq("status", "live").gte("ends_at", now.toISOString()).lte("ends_at", tomorrow.toISOString())
        .order("ends_at", { ascending: true }).limit(8),
      supabase.from("auction_events").select("id,event_type,price,bid_count,occurred_at,auctions(domains(name,tld),sources(name),currency)")
        .order("occurred_at", { ascending: false }).limit(12),
      supabase.from("sales").select("id,sale_price,currency,sold_at,source_url,domains(name,tld),sources(name)")
        .order("sold_at", { ascending: false }).limit(8),
      supabase.from("sales").select("id", { count: "exact", head: true }),
      supabase.from("domains").select("id", { count: "exact", head: true }),
      supabase.from("market_updates").select("id,title,url,category,published_at,sources(name)")
        .order("published_at", { ascending: false, nullsFirst: false }).limit(6),
      supabase.from("sources").select("id,name,active,kind,access_status,credential_env,feed_types").eq("active", true).order("name"),
      supabase.from("auctions").select("source_id,updated_at").not("source_id", "is", null).order("updated_at", { ascending: false }).limit(500),
    ]);

  const dbAuctions = (auctionResult.data ?? []) as unknown as Auction[];
  let liveAuctions = dbAuctions;

  if (liveAuctions.length === 0) liveAuctions = await getLiveGoDaddy();

  return {
    auctions: liveAuctions,
    endingSoon: (endingResult.data ?? []) as unknown as Auction[],
    activity: (activityResult.data ?? []) as unknown as ActivityEvent[],
    sales: (salesResult.data ?? []) as unknown as Sale[],
    pulse: (pulseResult.data ?? []) as unknown as MarketUpdate[],
    stats: { endingSoon: endingResult.count ?? 0, sales: salesCountResult.count ?? 0, domains: domainsResult.count ?? liveAuctions.length },
    sources: (sourcesResult.data ?? []).map((source) => {
      const latest = ((freshnessResult.data ?? []) as { source_id: string; updated_at: string }[])
        .find((row) => row.source_id === source.id)?.updated_at ?? null;
      return { ...source, latest };
    }) as SourceFreshness[],
  };
}

function formatPrice(price: number | null, currency: string) {
  if (price === null) return "—";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(price); }
  catch { return `${price.toLocaleString("en-US")} ${currency}`; }
}
function relativeTime(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return "just now";
  const minutes = Math.round(absolute / 60);
  if (minutes < 60) return `${minutes}m ${seconds < 0 ? "ago" : "from now"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${seconds < 0 ? "ago" : "from now"}`;
  const days = Math.round(hours / 24);
  return `${days}d ${seconds < 0 ? "ago" : "from now"}`;
}
function eventLabel(eventType: string) {
  switch (eventType) {
    case "created": return "Listed"; case "bid": return "Bid"; case "price_change": return "Price change";
    case "extended": return "Extended"; case "ended": return "Ended"; case "cancelled": return "Cancelled";
    case "status_change": return "Status change"; default: return "Snapshot";
  }
}
function DomainLink({ name }: { name: string | undefined }) {
  if (!name) return <span>Unknown</span>;
  return <Link href={`/domains/${encodeURIComponent(name)}`}>{name}</Link>;
}

export default async function Home() {
  const { auctions, activity, sales, endingSoon, pulse, stats, sources } = await getMarketData();
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">daggr<span>.</span></a>
        <nav><a href="#auctions">Auctions</a><a href="#activity">Activity</a><a href="#sales">Sales</a><Link href="/sources">Sources</Link></nav>
        <Link className="search-button" href="/search">Search domains</Link>
      </header>

      <section className="hero">
        <div className="eyebrow">DOMAIN MARKET EXPLORER</div>
        <h1>See what&apos;s happening in the domain market.</h1>
        <p>Live auctions, expired domains, sales and market activity — brought together in one place.</p>
        <form className="search" action="/search" method="get"><span>⌕</span><input name="q" aria-label="Search domains" placeholder="Search a domain, TLD or keyword" /><kbd>↵</kbd></form>
      </section>

      <section className="stats">
        <div><strong>{auctions.length || "—"}</strong><span>Live auctions shown</span></div>
        <div><strong>{stats.endingSoon || "—"}</strong><span>Ending in 24h</span></div>
        <div><strong>{stats.sales || "—"}</strong><span>Recorded sales</span></div>
        <div><strong>{stats.domains || "—"}</strong><span>Tracked domains</span></div>
      </section>

      <section className="section source-status">
        <div className="section-heading"><div><span className="eyebrow">DATA SOURCES</span><h2>Market feeds</h2></div><span className="muted">Connector status</span></div>
        <div className="source-grid">
          {sources.length === 0 ? <div className="empty compact"><h3>No active sources configured.</h3><p>Daggr has no connected market feeds yet.</p></div> : sources.map((source) => {
            const fresh = source.latest ? (Date.now() - new Date(source.latest).getTime()) < 24 * 60 * 60 * 1000 : false;
            return <div className="source-card" key={source.id}>
              <div><strong>{source.name}</strong><span>{source.latest ? relativeTime(source.latest) : "No market records yet"}</span></div>
              <span className={`source-dot ${fresh ? "fresh" : ""}`} title={fresh ? "Updated within 24 hours" : "No update within 24 hours"} />
            </div>;
          })}
        </div>
      </section>

      <section className="section" id="auctions">
        <div className="section-heading"><div><span className="eyebrow">MARKET</span><h2>Live auctions</h2></div><span className="muted">{auctions.length ? auctions.length + " active" : "Waiting for market data"}</span></div>
        <LiveAuctions />
      </section>

      <section className="section pulse-layout" id="activity">
        <div>
          <div className="section-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Recent market events</h2></div></div>
          {activity.length === 0 ? <div className="empty compact"><h3>No activity recorded yet.</h3><p>Events will appear here as connected sources change.</p></div> : (
            <div className="feed">{activity.map((event) => <div className="feed-row" key={event.id}>
              <div><strong><DomainLink name={event.auctions?.domains?.name} /></strong><span>{eventLabel(event.event_type)} · {event.auctions?.sources?.name ?? "Unknown source"}</span></div>
              <div className="feed-value">{event.price !== null ? formatPrice(event.price, event.auctions?.currency ?? "USD") : event.bid_count !== null ? `${event.bid_count} bids` : "—"}<small>{relativeTime(event.occurred_at)}</small></div>
            </div>)}</div>
          )}
        </div>

        <aside className="pulse">
          <div className="section-heading"><div><span className="eyebrow">DOMAIN PULSE</span><h2>Industry</h2></div><span className="muted">Curated</span></div>
          {pulse.length === 0 ? <div className="pulse-empty"><span className="empty-mark">·</span><p>No domain-industry updates connected yet.</p><small>Pulse is reserved for authorized feeds and curated source links.</small></div> : (
            <div className="pulse-list">{pulse.map((item) => <a className="pulse-item" href={item.url} target="_blank" rel="noreferrer" key={item.id}>
              <span className="pulse-category">{item.category}</span><strong>{item.title}</strong>
              <small>{item.sources?.name ?? "Source"}{item.published_at ? ` · ${relativeTime(item.published_at)}` : ""}</small>
            </a>)}</div>
          )}
        </aside>
      </section>

      <section className="section">
        <div className="section-heading"><div><span className="eyebrow">EXPIRING</span><h2>Ending soon</h2></div><span className="muted">Next 24h</span></div>
        {endingSoon.length === 0 ? <div className="empty compact"><h3>Nothing ending soon.</h3><p>When auctions approach their end, they will surface here.</p></div> : (
          <div className="feed">{endingSoon.map((auction) => <div className="feed-row" key={auction.id}>
            <div><strong><DomainLink name={auction.domains?.name} /></strong><span>{auction.sources?.name ?? "Unknown source"} · {auction.bid_count} bids</span></div>
            <div className="feed-value">{formatPrice(auction.current_price, auction.currency)}<small>{auction.ends_at ? relativeTime(auction.ends_at) : "—"}</small></div>
          </div>)}</div>
        )}
      </section>

      <section className="section" id="sales">
        <div className="section-heading"><div><span className="eyebrow">SALES</span><h2>Recent recorded sales</h2></div><span className="muted">{sales.length ? "Latest recorded activity" : "Waiting for sales data"}</span></div>
        {sales.length === 0 ? <div className="empty"><div className="empty-mark">◇</div><h3>No recorded sales yet.</h3><p>Connect an authorized sales-data source to make completed transactions discoverable here.</p></div> : (
          <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Source</th><th>Sale price</th><th>Sold</th><th>Reference</th></tr></thead><tbody>
            {sales.map((sale) => <tr key={sale.id}><td><strong><DomainLink name={sale.domains?.name} /></strong></td><td>{sale.sources?.name ?? "Unknown"}</td><td>{formatPrice(sale.sale_price, sale.currency)}</td><td>{sale.sold_at ? relativeTime(sale.sold_at) : "—"}</td><td>{sale.source_url ? <a href={sale.source_url} target="_blank" rel="noreferrer">Source ↗</a> : "—"}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <section className="section split">
        <div><span className="eyebrow">DISCOVERY</span><h2>Built for signals, not noise.</h2><p className="copy">Daggr turns domain-market events into something you can scan, filter and understand quickly.</p></div>
        <div className="signal-list"><div><b>01</b><span>Live auctions</span></div><div><b>02</b><span>Expired &amp; dropping</span></div><div><b>03</b><span>Recent sales</span></div><div><b>04</b><span>Historical activity</span></div></div>
      </section>
      <footer><span>daggr</span><span>Domain market explorer · v0.1</span></footer>
    </main>
  );
}