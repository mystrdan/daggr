"use client";

import { useEffect, useState } from "react";

type Listing = {
  domain: string;
  listingId: string | null;
  currentPrice: number | null;
  bidCount: number;
  endsAt: string | null;
  listingType: string | null;
  sourceUrl: string | null;
};

type Sort = "newest" | "ending" | "bids" | "price-low" | "price-high";

export default function LiveAuctions() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const MIN_PRICE = 10;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/market/godaddy?page=${page}&limit=50&sort=${sort}&minPrice=${MIN_PRICE}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Market feed unavailable");
        if (active) {
          setListings(payload.listings ?? []);
          setUpdatedAt(payload.observedAt ?? new Date().toISOString());
          setTotalPages(payload.totalPages ?? 1);
          setTotal(payload.total ?? 0);
          setError("");
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Market feed unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [page, sort, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshKey((value) => value + 1);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:0}).format(value);

  if (error) return <div className="empty"><div className="empty-mark">!</div><h3>Live market feed unavailable.</h3><p>{error}</p></div>;

  return <div>
    <div className="market-toolbar">
      <div className="market-tabs" aria-label="Auction sort">
        {([
          ["newest","Newest"],
          ["ending","Ending soon"],
          ["bids","Most bids"],
          ["price-low","Lowest price"],
          ["price-high","Highest price"],
        ] as const).map(([value,label]) => (
          <button key={value} className={sort === value ? "active" : ""} onClick={() => { setSort(value); setPage(1); }}>{label}</button>
        ))}
      </div>
      <span className="market-total">{total ? `${total.toLocaleString()} listings ≥ ${MIN_PRICE}` : `Live feed · minimum ${MIN_PRICE}`}</span>
    </div>

    {loading && !listings.length ? <div className="empty compact"><h3>Loading live market data…</h3><p>Fetching the latest auction inventory.</p></div> : !listings.length ? <div className="empty compact"><h3>No listings on this page.</h3><p>Try another sort or page.</p></div> : (
      <>
        <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Source</th><th>Type</th><th>Bids</th><th>Current</th><th>Ends</th><th></th></tr></thead><tbody>
          {listings.map((item) => <tr key={item.listingId ?? item.domain}><td><strong>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.domain}</a> : item.domain}</strong></td><td>GoDaddy Auctions</td><td>{item.listingType ?? "—"}</td><td>{item.bidCount}</td><td>{money(item.currentPrice)}</td><td>{item.endsAt ? new Date(item.endsAt).toLocaleString() : "—"}</td><td>{item.sourceUrl && (!item.endsAt || new Date(item.endsAt).getTime() > Date.now()) ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="auction-link">Open auction ↗</a> : "Closed"}</td></tr>)}
        </tbody></table></div>
        <div className="market-pagination">
          <button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Previous</button>
          <span>Page {page.toLocaleString()} of {totalPages.toLocaleString()}</span>
          <button disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next →</button>
        </div>
        <p className="muted" style={{marginTop:"12px"}}>Live feed · minimum $10 · {total.toLocaleString()} qualifying listings · observed {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "now"} · refreshes every 5 minutes</p>
      </>
    )}
  </div>;
}
