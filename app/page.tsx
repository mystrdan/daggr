import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type Auction = {
  id: string;
  status: string;
  current_price: number | null;
  currency: string;
  bid_count: number;
  ends_at: string | null;
  domains: { name: string; tld: string } | null;
  sources: { name: string } | null;
};

type ActivityEvent = {
  id: number;
  event_type: string;
  price: number | null;
  bid_count: number | null;
  occurred_at: string;
  auctions: {
    domains: { name: string; tld: string } | null;
    sources: { name: string } | null;
    currency: string;
  } | null;
};

type Sale = {
  id: string;
  sale_price: number | null;
  currency: string;
  sold_at: string | null;
  source_url: string | null;
  domains: { name: string; tld: string } | null;
  sources: { name: string } | null;
};

type MarketStats = {
  endingSoon: number;
  sales: number;
  domains: number;
};

type MarketData = {
  auctions: Auction[];
  activity: ActivityEvent[];
  sales: Sale[];
  endingSoon: Auction[];
  stats: MarketStats;
};

async function getMarketData(): Promise<MarketData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return {
      auctions: [],
      activity: [],
      sales: [],
      endingSoon: [],
      stats: { endingSoon: 0, sales: 0, domains: 0 },
    };
  }

  const supabase = createClient(url, key);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [auctionResult, endingResult, activityResult, salesResult, salesCountResult, domainsResult] =
    await Promise.all([
      supabase
        .from("auctions")
        .select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld),sources(name)")
        .eq("status", "live")
        .order("ends_at", { ascending: true })
        .limit(20),
      supabase
        .from("auctions")
        .select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld),sources(name)")
        .eq("status", "live")
        .gte("ends_at", now.toISOString())
        .lte("ends_at", tomorrow.toISOString())
        .order("ends_at", { ascending: true })
        .limit(8),
      supabase
        .from("auction_events")
        .select("id,event_type,price,bid_count,occurred_at,auctions(domains(name,tld),sources(name),currency)")
        .order("occurred_at", { ascending: false })
        .limit(12),
      supabase
        .from("sales")
        .select("id,sale_price,currency,sold_at,source_url,domains(name,tld),sources(name)")
        .order("sold_at", { ascending: false })
        .limit(8),
      supabase
        .from("sales")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("domains")
        .select("id", { count: "exact", head: true }),
    ]);

  return {
    auctions: (auctionResult.data ?? []) as unknown as Auction[],
    endingSoon: (endingResult.data ?? []) as unknown as Auction[],
    activity: (activityResult.data ?? []) as unknown as ActivityEvent[],
    sales: (salesResult.data ?? []) as unknown as Sale[],
    stats: {
      endingSoon: endingResult.count ?? 0,
      sales: salesCountResult.count ?? 0,
      domains: domainsResult.count ?? 0,
    },
  };
}

function formatPrice(price: number | null, currency: string) {
  if (price === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price.toLocaleString("en-US")} ${currency}`;
  }
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
    case "created":
      return "Listed";
    case "bid":
      return "Bid";
    case "price_change":
      return "Price change";
    case "extended":
      return "Extended";
    case "ended":
      return "Ended";
    case "cancelled":
      return "Cancelled";
    case "status_change":
      return "Status change";
    default:
      return "Snapshot";
  }
}

function DomainLink({ name }: { name: string | undefined }) {
  if (!name) return <span>Unknown</span>;
  return <Link href={`/domains/${encodeURIComponent(name)}`}>{name}</Link>;
}

export default async function Home() {
  const { auctions, activity, sales, endingSoon, stats } = await getMarketData();

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">daggr<span>.</span></a>
        <nav>
          <a href="#auctions">Auctions</a>
          <a href="#activity">Activity</a>
        </nav>
        <button className="search-button">Search domains</button>
      </header>

      <section className="hero">
        <div className="eyebrow">DOMAIN MARKET EXPLORER</div>
        <h1>See what&apos;s happening in the domain market.</h1>
        <p>Live auctions, expired domains, sales and market activity — brought together in one place.</p>
        <div className="search">
          <span>⌕</span>
          <input aria-label="Search domains" placeholder="Search a domain, TLD or keyword" />
          <kbd>⌘ K</kbd>
        </div>
      </section>

      <section className="stats">
        <div><strong>{auctions.length || "—"}</strong><span>Live auctions shown</span></div>
        <div><strong>{stats.endingSoon || "—"}</strong><span>Ending in 24h</span></div>
        <div><strong>{stats.sales || "—"}</strong><span>Recorded sales</span></div>
        <div><strong>{stats.domains || "—"}</strong><span>Tracked domains</span></div>
      </section>

      <section className="section" id="auctions">
        <div className="section-heading">
          <div><span className="eyebrow">MARKET</span><h2>Live auctions</h2></div>
          <span className="muted">{auctions.length ? auctions.length + " active" : "Waiting for market data"}</span>
        </div>

        {auctions.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">◎</div>
            <h3>No live market data yet.</h3>
            <p>Daggr is ready for domain-market data. Connect an auction source to start filling the terminal.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Domain</th><th>Source</th><th>Status</th><th>Bids</th><th>Current</th><th>Ends</th></tr></thead>
              <tbody>
                {auctions.map((auction) => (
                  <tr key={auction.id}>
                    <td><strong><DomainLink name={auction.domains?.name} /></strong></td>
                    <td>{auction.sources?.name ?? "Unknown"}</td>
                    <td><span className="pill live">LIVE</span></td>
                    <td>{auction.bid_count}</td>
                    <td>{formatPrice(auction.current_price, auction.currency)}</td>
                    <td>{auction.ends_at ? new Date(auction.ends_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section activity-grid" id="activity">
        <div>
          <div className="section-heading">
            <div><span className="eyebrow">ACTIVITY</span><h2>Recent market events</h2></div>
          </div>
          {activity.length === 0 ? (
            <div className="empty compact">
              <h3>No activity recorded yet.</h3>
              <p>Events will appear here as connected sources change.</p>
            </div>
          ) : (
            <div className="feed">
              {activity.map((event) => (
                <div className="feed-row" key={event.id}>
                  <div>
                    <strong><DomainLink name={event.auctions?.domains?.name} /></strong>
                    <span>{eventLabel(event.event_type)} · {event.auctions?.sources?.name ?? "Unknown source"}</span>
                  </div>
                  <div className="feed-value">
                    {event.price !== null
                      ? formatPrice(event.price, event.auctions?.currency ?? "USD")
                      : event.bid_count !== null
                        ? `${event.bid_count} bids`
                        : "—"}
                    <small>{relativeTime(event.occurred_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-heading">
            <div><span className="eyebrow">EXPIRING</span><h2>Ending soon</h2></div>
            <span className="muted">Next 24h</span>
          </div>
          {endingSoon.length === 0 ? (
            <div className="empty compact">
              <h3>Nothing ending soon.</h3>
              <p>When auctions approach their end, they will surface here.</p>
            </div>
          ) : (
            <div className="feed">
              {endingSoon.map((auction) => (
                <div className="feed-row" key={auction.id}>
                  <div>
                    <strong><DomainLink name={auction.domains?.name} /></strong>
                    <span>{auction.sources?.name ?? "Unknown source"} · {auction.bid_count} bids</span>
                  </div>
                  <div className="feed-value">
                    {formatPrice(auction.current_price, auction.currency)}
                    <small>{auction.ends_at ? relativeTime(auction.ends_at) : "—"}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section" id="sales">
        <div className="section-heading">
          <div><span className="eyebrow">SALES</span><h2>Recent recorded sales</h2></div>
          <span className="muted">{sales.length ? "Latest recorded activity" : "Waiting for sales data"}</span>
        </div>
        {sales.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">◇</div>
            <h3>No recorded sales yet.</h3>
            <p>Connect an authorized sales-data source to make completed transactions discoverable here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Domain</th><th>Source</th><th>Sale price</th><th>Sold</th><th>Reference</th></tr></thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><strong><DomainLink name={sale.domains?.name} /></strong></td>
                    <td>{sale.sources?.name ?? "Unknown"}</td>
                    <td>{formatPrice(sale.sale_price, sale.currency)}</td>
                    <td>{sale.sold_at ? relativeTime(sale.sold_at) : "—"}</td>
                    <td>{sale.source_url ? <a href={sale.source_url} target="_blank" rel="noreferrer">Source ↗</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section split">
        <div>
          <span className="eyebrow">DISCOVERY</span>
          <h2>Built for signals, not noise.</h2>
          <p className="copy">Daggr turns domain-market events into something you can scan, filter and understand quickly.</p>
        </div>
        <div className="signal-list">
          <div><b>01</b><span>Live auctions</span></div>
          <div><b>02</b><span>Expired &amp; dropping</span></div>
          <div><b>03</b><span>Recent sales</span></div>
          <div><b>04</b><span>Historical activity</span></div>
        </div>
      </section>

      <footer><span>daggr</span><span>Domain market explorer · v0.1</span></footer>
    </main>
  );
}
