"use client";

import { useEffect, useState } from "react";

type DropRecord = { domain: string; expires_on: string; order: number };

export default function VerisignDropOrder({ domain }: { domain: string }) {
  const [record, setRecord] = useState<DropRecord | null>(null);
  const [state, setState] = useState<"loading" | "found" | "none" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market/verisign?domains=${encodeURIComponent(domain)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("lookup failed")))
      .then((data) => {
        if (cancelled) return;
        const next = Array.isArray(data.records) ? data.records[0] ?? null : null;
        setRecord(next);
        setState(next ? "found" : "none");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [domain]);

  return (
    <div className="context-card">
      <div className="eyebrow">REGISTRY</div>
      <h3>Verisign drop order</h3>
      {state === "loading" && <p className="muted">Checking .com/.net registry drop data…</p>}
      {state === "none" && <p className="muted">No pending-delete drop record found.</p>}
      {state === "error" && <p className="muted">Registry data is temporarily unavailable.</p>}
      {record && <div className="context-row"><span>Position</span><strong>#{record.order.toLocaleString()}</strong></div>}
      {record && <div className="context-row"><span>Release window</span><strong>{new Date(record.expires_on).toLocaleString()}</strong></div>}
      <small className="source-note">Source: NameBio / Verisign drop-order feed</small>
    </div>
  );
}
