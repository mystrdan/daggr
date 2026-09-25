import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("domains") ?? "";
  const domains = raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).slice(0, 100);
  if (!domains.length) return NextResponse.json({ ok: true, count: 0, records: [] });

  try {
    const response = await fetch("https://api.namebio.com/verisign", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Daggr/0.1 domain market explorer" },
      body: JSON.stringify(domains),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: `Verisign lookup returned HTTP ${response.status}` }, { status: 502 });
    const records = await response.json();
    if (!Array.isArray(records)) return NextResponse.json({ ok: false, error: "Unexpected Verisign response" }, { status: 502 });
    return NextResponse.json({ ok: true, source: "NameBio / Verisign Drop Order", observedAt: new Date().toISOString(), count: records.length, records });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Verisign lookup failed" }, { status: 502 });
  }
}
