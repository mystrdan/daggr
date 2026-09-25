"use client";

import { useEffect, useState } from "react";

type Listing = {
  domain: string;
  listingId: string | null;
  currentPrice: number | null;
  bidCount: number;
  endsAt: string | null;
  listingType: string | null;
};

export default function LiveAuctions() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/market/godaddy", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Market feed unavailable");
        if (active) {
          setListings(payload.listings ?? []);
          setUpdatedAt(payload.observedAt ?? new Date().toISOString());
          setError("");
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Market feed unavailable");
      }
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (error) return <div className="empty"><div className="empty-mark">!</div><h3>Live market feed unavailable.</h3><p>{error}</p></div>;
  if (!listings.length) return <div className="empty"><div className="empty-mark">◎</div><h3>Loading live market data…</h3><p>Fetching the latest GoDaddy Auctions inventory.</p></div>;

  const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:0}).format(value);

  return <div>
    <div className="table-wrap"><table><thead><tr><th>Domain</th><th>Source</th><th>Type</th><th>Bids</th><th>Current</th><th>Ends</th></tr></thead><tbody>
      {listings.map((item) => <tr key={item.listingId ?? item.domain}><td><strong><a href={`/domains/${encodeURIComponent(item.domain)}`}>{item.domain}</a></strong></td><td>GoDaddy Auctions</td><td>{item.listingType ?? "—"}</td><td>{item.bidCount}</td><td>{money(item.currentPrice)}</td><td>{item.endsAt ? new Date(item.endsAt).toLocaleString() : "—"}</td></tr>)}
    </tbody></table></div>
    <p className="muted" style={{marginTop:"12px"}}>Live feed · observed {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "now"} · refreshes every 5 minutes</p>
  </div>;
}
