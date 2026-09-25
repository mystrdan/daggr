import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type Source = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  access_status: string;
  credential_env: string[];
  feed_types: string[];
  docs_url: string | null;
};

type Run = {
  id: string;
  connector: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  received: number;
  imported: number;
  skipped: number;
  error: string | null;
};

async function getData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { sources: [] as Source[], runs: [] as Run[] };

  const supabase = createClient(url, key);
  const [sources, runs] = await Promise.all([
    supabase.from("sources")
      .select("id,name,kind,active,access_status,credential_env,feed_types,docs_url")
      .order("name"),
    supabase.from("ingestion_runs")
      .select("id,connector,status,started_at,completed_at,received,imported,skipped,error")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  return {
    sources: (sources.data ?? []) as Source[],
    runs: (runs.data ?? []) as Run[],
  };
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function relative(value: string | null) {
  if (!value) return "—";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return "just now";
  const minutes = Math.round(absolute / 60);
  if (minutes < 60) return `${minutes}m ${seconds < 0 ? "ago" : "from now"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${seconds < 0 ? "ago" : "from now"}`;
  return `${Math.round(hours / 24)}d ${seconds < 0 ? "ago" : "from now"}`;
}

export default async function SourcesPage() {
  const { sources, runs } = await getData();

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">daggr<span>.</span></Link>
        <nav><Link href="/">Market</Link><a href="/#activity">Activity</a><a href="/#sales">Sales</a></nav>
        <Link className="search-button" href="/search">Search domains</Link>
      </header>

      <section className="hero source-hero">
        <div className="eyebrow">DATA SOURCES</div>
        <h1>Where Daggr gets its market signals.</h1>
        <p>Connector status, supported feeds and ingestion history. Daggr only displays data from sources it can legitimately access.</p>
      </section>

      <section className="section">
        <div className="section-heading">
          <div><span className="eyebrow">CONNECTORS</span><h2>Market sources</h2></div>
          <span className="muted">{sources.length} configured</span>
        </div>

        <div className="source-detail-grid">
          {sources.map((source) => (
            <article className="source-detail" key={source.id}>
              <div className="source-detail-head">
                <div>
                  <strong>{source.name}</strong>
                  <span>{source.kind} · {source.active ? "active" : "disabled"}</span>
                </div>
                <span className={`source-status status-${source.access_status}`}>{statusLabel(source.access_status)}</span>
              </div>
              <div className="source-meta">
                <div><span>Feeds</span><strong>{source.feed_types.length ? source.feed_types.join(" · ") : "Not defined"}</strong></div>
                <div><span>Credentials</span><strong>{source.credential_env.length ? source.credential_env.join(" · ") : "None configured"}</strong></div>
              </div>
              {source.docs_url && <a className="source-doc" href={source.docs_url} target="_blank" rel="noreferrer">Connector documentation ↗</a>}
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div><span className="eyebrow">INGESTION</span><h2>Recent connector runs</h2></div>
          <span className="muted">{runs.length ? "Latest 20" : "No runs yet"}</span>
        </div>

        {runs.length === 0 ? (
          <div className="empty compact">
            <h3>No ingestion runs recorded yet.</h3>
            <p>Runs will appear here after a connector has valid credentials and is executed.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Connector</th><th>Status</th><th>Started</th><th>Received</th><th>Imported</th><th>Skipped</th><th>Error</th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td><strong>{run.connector}</strong></td>
                    <td><span className={`pill run-${run.status}`}>{run.status.toUpperCase()}</span></td>
                    <td>{relative(run.started_at)}</td>
                    <td>{run.received}</td>
                    <td>{run.imported}</td>
                    <td>{run.skipped}</td>
                    <td className="run-error">{run.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer><span>daggr</span><span>Domain market explorer · data sources</span></footer>
    </main>
  );
}
