"use client";

import { useEffect, useState } from "react";

type Listing = {
  id: string;
  current_price: number | null;
  currency: string;
  bid_count: number;
  starts_at: string | null;
  ends_at: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
  domains: { name: string; tld: string } | null;
  sources: { name: string } | null;
};

type Sort = "newest" | "ending" | "bids" | "price-low" | "price-high";

export default function TokenizedMarket() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<Sort>("newest");
  const [updatedAt, setUpdatedAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/market/tokenized?page=${page}&limit=50&sort=${sort}`, { cache: "no-store" })
      .then(async (r) => {
        const payload = await r.json();
        if (!r.ok || !payload.ok) throw new Error(payload.error || "Tokenized market unavailable");
        if (!active) return;
        setListings(payload.listings ?? []);
        setTotal(payload.total ?? 0);
        setTotalPages(payload.totalPages ?? 1);
        setUpdatedAt(payload.observedAt ?? "");
        setError("");
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "Tokenized market unavailable"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [page, sort]);

  const money = (value: number | null, currency: string) => {
    if (value === null) return "—";
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value)} ${currency}`;
  };

  return <div>
    <div className="market-toolbar">
      <div className="market-tabs" aria-label="Tokenized market sort">
        {([["newest","Newest"],["ending","Ending soon"],["bids","Most bids"],["price-low","Lowest"],["price-high","Highest"]] as const).map(([value,label]) =>
          <button key={value} className={sort === value ? "active" : ""} onClick={() => { setSort(value); setPage(1); }}>{label}</button>
        )}
      </div>
      <span className="market-total">{total ? `${total.toLocaleString()} tokenized listings` : "Tokenized market"}</span>
    </div>

    {loading && !listings.length ? <div className="empty compact"><h3>Loading tokenized market…</h3><p>Reading Doma market records.</p></div>
      : error ? <div className="empty"><div className="empty-mark">!</div><h3>Tokenized market feed unavailable.</h3><p>{error}</p></div>
      : !listings.length ? <div className="empty"><div className="empty-mark">◇</div><h3>No tokenized listings yet.</h3><p>Daggr is intentionally not showing traditional domain auctions. Connect the Doma market feed to populate this view.</p></div>
      : <>
        <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Market</th><th>Offers/Bids</th><th>Price</th><th>Expires</th><th></th></tr></thead><tbody>
          {listings.map((item) => {
            const open = !item.ends_at || new Date(item.ends_at).getTime() > Date.now();
            return <tr key={item.id}>
              <td><strong>{item.domains?.name ?? "Unknown"}</strong><small className="muted"> tokenized</small></td>
              <td>Doma</td>
              <td>{item.bid_count}</td>
              <td>{money(item.current_price, item.currency)}</td>
              <td>{item.ends_at ? new Date(item.ends_at).toLocaleString() : "—"}</td>
              <td>{open && item.source_url ? <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="auction-link">Open market ↗</a> : "Closed"}</td>
            </tr>;
          })}
        </tbody></table></div>
        <div className="market-pagination">
          <button disabled={page <= 1 || loading} onClick={() => setPage((v) => Math.max(1, v - 1))}>← Previous</button>
          <span>Page {page.toLocaleString()} of {totalPages.toLocaleString()}</span>
          <button disabled={page >= totalPages || loading} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>Next →</button>
        </div>
        <p className="muted" style={{marginTop:"12px"}}>Tokenized domains only · minimum listing price 10 units · observed {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "now"}</p>
      </>}
  </div>;
}
