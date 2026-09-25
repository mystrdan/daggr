import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import VerisignDropOrder from "../../verisign-drop-order";

type Event = {
  id: number;
  event_type: string;
  price: number | null;
  bid_count: number | null;
  occurred_at: string;
};

type Auction = {
  id: string;
  status: string;
  current_price: number | null;
  currency: string;
  bid_count: number;
  starts_at: string | null;
  ends_at: string | null;
  source_url: string | null;
};

type Sale = {
  id: string;
  sale_price: number | null;
  currency: string;
  sold_at: string | null;
  source_url: string | null;
};

function price(value: number | null, currency: string) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

export default async function DomainPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const name = decodeURIComponent(domain).trim().toLowerCase().replace(/\.$/, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return <main><p>Supabase configuration is missing.</p></main>;

  const supabase = createClient(url, key);
  const { data: domainRow } = await supabase
    .from("domains")
    .select("id,name,tld,first_seen_at,last_seen_at")
    .eq("normalized_name", name)
    .maybeSingle();

  if (!domainRow) {
    return (
      <main>
        <header className="topbar"><Link className="brand" href="/">daggr<span>.</span></Link></header>
        <section className="hero">
          <div className="eyebrow">DOMAIN</div>
          <h1>{name}</h1>
          <p>This domain is not currently tracked by Daggr.</p>
          <Link href="/" className="search-button">Back to market</Link>
        </section>
      </main>
    );
  }

  const { data: auctionsData } = await supabase
    .from("auctions")
    .select("id,status,current_price,currency,bid_count,starts_at,ends_at,source_url")
    .eq("domain_id", domainRow.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  const auctions = (auctionsData ?? []) as Auction[];
  const auctionIds = auctions.map((a) => a.id);

  const [eventsResult, salesResult] = await Promise.all([
    auctionIds.length
      ? supabase
          .from("auction_events")
          .select("id,event_type,price,bid_count,occurred_at")
          .in("auction_id", auctionIds)
          .order("occurred_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    supabase
      .from("sales")
      .select("id,sale_price,currency,sold_at,source_url")
      .eq("domain_id", domainRow.id)
      .order("sold_at", { ascending: false })
      .limit(10),
  ]);

  const events = (eventsResult.data ?? []) as Event[];
  const sales = (salesResult.data ?? []) as Sale[];
  const tld = domainRow.tld.startsWith(".") ? domainRow.tld : `.${domainRow.tld}`;
  const keyword = domainRow.name.split(".")[0];
  const [tldStatsResult, retailStatsResult] = await Promise.all([
    fetch("https://api.namebio.com/tldstats", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({extension:tld}).toString(), next:{revalidate:86400} }).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch("https://api.namebio.com/retailstats", { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({keyword}).toString(), next:{revalidate:86400} }).then(r=>r.ok?r.json():null).catch(()=>null)
  ]);
  const tldStats = tldStatsResult?.data;
  const retailStats = retailStatsResult?.data;

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">daggr<span>.</span></Link>
        <nav><Link href="/#auctions">Auctions</Link><Link href="/#activity">Activity</Link></nav>
      </header>

      <section className="hero">
        <div className="eyebrow">DOMAIN MARKET</div>
        <h1>{domainRow.name}</h1>
        <p>Market activity recorded by Daggr across connected sources.</p>
      </section>

      <section className="stats">
        <div><strong>{auctions.length || "—"}</strong><span>Tracked auctions</span></div>
        <div><strong>{events.length || "—"}</strong><span>Recorded events</span></div>
        <div><strong>{sales.length || "—"}</strong><span>Recorded sales</span></div>
        <div><strong>.{domainRow.tld}</strong><span>TLD</span></div>
      </section>

      <section className="section">
        <div className="context-grid"><VerisignDropOrder domain={domainRow.name} /></div>
      </section>

      <section className="section">
        <div className="section-heading"><div><span className="eyebrow">AUCTIONS</span><h2>Auction history</h2></div></div>
        {auctions.length === 0 ? <div className="empty"><h3>No auction activity recorded.</h3></div> : (
          <div className="table-wrap"><table><thead><tr><th>Status</th><th>Bids</th><th>Current</th><th>Ends</th></tr></thead><tbody>
            {auctions.map((a) => <tr key={a.id}><td><span className="pill live">{a.status.toUpperCase()}</span></td><td>{a.bid_count}</td><td>{price(a.current_price,a.currency)}</td><td>{a.ends_at ? new Date(a.ends_at).toLocaleString() : "—"}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <section className="section">
        <div className="section-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Market events</h2></div></div>
        {events.length === 0 ? <div className="empty"><h3>No historical events recorded.</h3><p>Events appear as connected auction sources change.</p></div> : (
          <div className="table-wrap"><table><thead><tr><th>Event</th><th>Price</th><th>Bids</th><th>Time</th></tr></thead><tbody>
            {events.map((e) => <tr key={e.id}><td>{e.event_type.replace("_"," ").toUpperCase()}</td><td>{e.price === null ? "—" : e.price.toLocaleString()}</td><td>{e.bid_count ?? "—"}</td><td>{new Date(e.occurred_at).toLocaleString()}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <section className="section">
        <div className="section-heading"><div><span className="eyebrow">SALES</span><h2>Recorded sales</h2></div></div>
        {sales.length === 0 ? <div className="empty"><h3>No recorded sales yet.</h3></div> : (
          <div className="table-wrap"><table><thead><tr><th>Price</th><th>Sold</th><th>Source</th></tr></thead><tbody>
            {sales.map((s) => <tr key={s.id}><td>{price(s.sale_price,s.currency)}</td><td>{s.sold_at ? new Date(s.sold_at).toLocaleString() : "—"}</td><td>{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer">Open source</a> : "—"}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <footer><span>daggr</span><span>Domain market explorer · {domainRow.name}</span></footer>
    </main>
  );
}
