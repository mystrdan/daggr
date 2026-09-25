import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type Domain = {
  id: string;
  name: string;
  tld: string;
  first_seen_at: string;
  last_seen_at: string;
};

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

function formatPrice(value: number | null, currency: string) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString("en-US")} ${currency}`;
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 30;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return (
      <main>
        <header className="topbar"><Link className="brand" href="/">daggr<span>.</span></Link></header>
        <section className="hero"><div className="empty"><h3>Supabase configuration is missing.</h3></div></section>
      </main>
    );
  }

  const supabase = createClient(url, key);
  let domains: Domain[] = [];
  let auctions: Auction[] = [];
  let domainTotal = 0;
  let domainTotalPages = 1;

  if (query) {
    const safeQuery = query.replace(/[^a-zA-Z0-9.-]/g, "");
    const pattern = `%${safeQuery}%`;
    const domainResult = await supabase
      .from("domains")
      .select("id,name,tld,first_seen_at,last_seen_at", { count: "exact" })
      .or(`name.ilike.${pattern},tld.ilike.${pattern},normalized_name.ilike.${pattern}`)
       .order("last_seen_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    domains = (domainResult.data ?? []) as unknown as Domain[];
    domainTotal = domainResult.count ?? 0;
    domainTotalPages = Math.max(1, Math.ceil(domainTotal / pageSize));
    const domainIds = domains.map((domain) => domain.id);

    if (domainIds.length) {
      const auctionResult = await supabase
        .from("auctions")
        .select("id,status,current_price,currency,bid_count,ends_at,domains(name,tld),sources(name)")
        .eq("status", "live")
        .in("domain_id", domainIds)
        .order("ends_at", { ascending: true })
        .limit(20);
      auctions = (auctionResult.data ?? []) as unknown as Auction[];
    }
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">daggr<span>.</span></Link>
        <nav><Link href="/#auctions">Auctions</Link><Link href="/#activity">Activity</Link></nav>
        <Link className="search-button" href="/">Market</Link>
      </header>

      <section className="hero search-hero">
        <div className="eyebrow">SEARCH</div>
        <h1>Find a domain.</h1>
        <p>Search domains tracked by Daggr and inspect their recorded market activity.</p>
        <form className="search" action="/search" method="get">
          <span>⌕</span>
          <input name="q" defaultValue={query} autoFocus aria-label="Search domains" placeholder="Search a domain, TLD or keyword" />
          <kbd>↵</kbd>
        </form>
      </section>

      {query ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div><span className="eyebrow">DOMAINS</span><h2>Matches for “{query}”</h2></div>
              <span className="muted">{domainTotal || domains.length} found</span>
            </div>
            {domains.length === 0 ? (
              <div className="empty"><h3>No tracked domains matched.</h3><p>Daggr only shows domains present in its connected market data.</p></div>
            ) : (
              <div className="table-wrap"><table><thead><tr><th>Domain</th><th>TLD</th><th>Last seen</th></tr></thead><tbody>
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <td><strong><Link href={`/domains/${encodeURIComponent(domain.name)}`}>{domain.name}</Link></strong></td>
                    <td>.{domain.tld}</td>
                    <td>{new Date(domain.last_seen_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </section>

          <section className="section">
            <div className="section-heading">
              <div><span className="eyebrow">LIVE MARKET</span><h2>Matching auctions</h2></div>
              <span className="muted">{auctions.length} found</span>
            </div>
            {auctions.length === 0 ? (
              <div className="empty"><h3>No live auctions matched.</h3><p>Try a domain name or a broader keyword.</p></div>
            ) : (
              <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Source</th><th>Bids</th><th>Current</th><th>Ends</th></tr></thead><tbody>
                {auctions.map((auction) => (
                  <tr key={auction.id}>
                    <td><strong>{auction.domains?.name ?? "Unknown"}</strong></td>
                    <td>{auction.sources?.name ?? "Unknown"}</td>
                    <td>{auction.bid_count}</td>
                    <td>{formatPrice(auction.current_price, auction.currency)}</td>
                    <td>{auction.ends_at ? new Date(auction.ends_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </section>
        </>
      ) : (
        <section className="section"><div className="empty"><div className="empty-mark">⌕</div><h3>Search the market.</h3><p>Enter a domain, extension or keyword to explore what Daggr has recorded.</p></div></section>
      )}

      <footer><span>daggr</span><span>Domain market explorer · search</span></footer>
    </main>
  );
}
