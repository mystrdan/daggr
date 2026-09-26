export type DomainNewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
};

const SOURCES = [
  { name: "Domain Name Wire", site: "https://domainnamewire.com/", feed: "https://domainnamewire.com/feed/" },
  { name: "Domain Incite", site: "https://domainincite.com/", feed: "https://domainincite.com/feed/" },
  { name: "The Domains", site: "https://www.thedomains.com/", feed: "https://www.thedomains.com/feed/" },
  { name: "DomainGang", site: "https://domaingang.com/", feed: "https://domaingang.com/feed/" },
  { name: "DNJournal", site: "https://www.dnjournal.com/", feed: "https://www.dnjournal.com/rss.xml" },
] as const;

function clean(value: string) {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#(d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUrl(value: string, base: string) {
  try { return new URL(clean(value), base).toString(); } catch { return ""; }
}

function firstTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? clean(match[1]) : "";
}

function extractRss(xml: string, source: typeof SOURCES[number]): DomainNewsItem | null {
  const blocks = xml.match(/<item[\\s\\S]*?<\\/item>/gi) ?? xml.match(/<entry[\\s\\S]*?<\\/entry>/gi) ?? [];
  for (const block of blocks.slice(0, 10)) {
    const title = firstTag(block, "title");
    const linkTag = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    const link = linkTag?.[1] ?? firstTag(block, "link");
    const url = decodeUrl(link, source.site);
    const published = firstTag(block, "pubDate") || firstTag(block, "published") || firstTag(block, "updated") || null;
    if (title.length >= 12 && url) return { title, url, source: source.name, publishedAt: published };
  }
  return null;
}

function extractHtml(html: string, source: typeof SOURCES[number]): DomainNewsItem | null {
  const heading = /<h[1-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[1-4]>/gi;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(html))) {
    const title = clean(match[2]);
    const url = decodeUrl(match[1], source.site);
    if (title.length >= 20 && title.length <= 220 && url && !/^(menu|home|advertise|contact|privacy|about|search|next|previous)$/i.test(title)) {
      return { title, url, source: source.name, publishedAt: null };
    }
  }
  return null;
}

async function fetchSource(source: typeof SOURCES[number]) {
  try {
    const response = await fetch(source.feed, {
      headers: { "User-Agent": "Daggr/1.0 domain market explorer", Accept: "application/rss+xml, application/atom+xml, text/xml, text/html;q=0.8" },
      next: { revalidate: 600 },
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.text();
    return extractRss(body, source) ?? extractHtml(body, source);
  } catch {
    try {
      const response = await fetch(source.site, { headers: { "User-Agent": "Daggr/1.0 domain market explorer" }, next: { revalidate: 600 } });
      if (!response.ok) return null;
      return extractHtml(await response.text(), source);
    } catch {
      return null;
    }
  }
}

export async function getDomainNews(limit = 5): Promise<DomainNewsItem[]> {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const seen = new Set<string>();
  return results.filter((item): item is DomainNewsItem => {
    if (!item || seen.has(item.source)) return false;
    seen.add(item.source);
    return true;
  }).slice(0, Math.min(5, limit));
}
