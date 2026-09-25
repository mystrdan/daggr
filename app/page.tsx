import { createClient } from "@supabase/supabase-js";

type Auction = {
  id: string;
  status: string;
  current_price: number | null;
  currency: string;
  bid_count: number;
  ends_at: string | null;
  domains: { name: string; tld: string } | null;
};

type MarketStats = {
  endingSoon: number;
  sales: number;
  domains: number;
};

async function getMarketData(): Promise<{ auctions: Auction[]; stats: MarketStats }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return { auctions: [], stats: { endingSoon: 0, sales: 0, domains: 0 } };
  }

  const supabase = createClient(url, key);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [auctionResult, endingResult, salesResult, domainsResult] = await Promise.all([
    supabase
      .from("auctions")
      .select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld)")
      .eq("status", "live")
      .order("ends_at", { ascending: true })
      .limit(20),
    supabase
      .from("auctions")
      .select("id", { count: "exact", head: true })
      .eq("status", "live")
      .gte("ends_at", now.toISOString())
      .lte("ends_at", tomorrow.toISOString()),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("domains")
      .select("id", { count: "exact", head: true }),
  ]);

  return {
    auctions: (auctionResult.data ?? []) as unknown as Auction[],
    stats: {
      endingSoon: endingResult.count ?? 0,
      sales: salesResult.count ?? 0,
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

export default async function Home() {
  const { auctions, stats } = await getMarketData();

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
              <thead><tr><th>Domain</th><th>Status</th><th>Bids</th><th>Current</th><th>Ends</th></tr></thead>
              <tbody>
                {auctions.map((auction) => (
                  <tr key={auction.id}>
                    <td><strong>{auction.domains?.name ?? "Unknown"}</strong></td>
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

      <section className="section split" id="activity">
        <div>
          <span className="eyebrow">DISCOVERY</span>
          <h2>Built for signals, not noise.</h2>
          <p className="copy">Daggr will turn domain-market events into something you can scan, filter and understand quickly.</p>
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
