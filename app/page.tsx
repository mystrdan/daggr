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

async function getAuctions(): Promise<Auction[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("auctions")
    .select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld)")
    .eq("status", "live")
    .order("ends_at", { ascending: true })
    .limit(20);

  return (data ?? []) as unknown as Auction[];
}

function formatPrice(price: number | null, currency: string) {
  if (price === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

export default async function Home() {
  const auctions = await getAuctions();

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
        <div><strong>{endingSoon || "—"}</strong><span>Ending in 24h</span></div>
        <div><strong>{sales || "—"}</strong><span>Recorded sales</span></div>
        <div><strong>—</strong><span>Tracked domains</span></div>
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
