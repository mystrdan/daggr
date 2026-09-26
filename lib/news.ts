export type DomainNewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
};

const SOURCES = [
  { name: "Domain Name Wire", url: "https://domainnamewire.com/" },
  { name: "DomainGang", url: "https://domaingang.com/" },
  { name: "Domain Incite", url: "https://domainincite.com/" },
  { name: "The Domains", url: "https://www.thedomains.com/" },
  { name: "GoDaddy Blog", url: "https://www.godaddy.com/resources/news" },
] as const;

function clean(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(base: string, href: string) {
  try { return new URL(href, base).toString(); } catch { return ""; }
}

function extract(html: string, source: typeof SOURCES[number]): DomainNewsItem | null {
  const candidates: { title: string; url: string }[] = [];
  const heading = /<h[1-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[1-4]>/gi;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(html)) && candidates.length < 30) {
    const title = clean(match[2]);
    const url = absoluteUrl(source.url, match[1]);
    if (title.length >= 20 && title.length <= 220 && url && !/^(menu|home|advertise|contact|privacy|about|search|next|previous)$/i.test(title)) {
      candidates.push({ title, url });
    }
  }

  if (!candidates.length) {
    const anchors = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = anchors.exec(html)) && candidates.length < 50) {
      const title = clean(match[2]);
      const url = absoluteUrl(source.url, match[1]);
      if (title.length >= 25 && title.length <= 220 && url && /domain|auction|tld|registr|icann|sale|verisign|godaddy|drop/i.test(title)) {
        candidates.push({ title, url });
      }
    }
  }

  const item = candidates.find((candidate) => {
    try { return new URL(candidate.url).hostname !== new URL(source.url).hostname || candidate.url !== source.url; } catch { return false; }
  }) ?? candidates[0];

  return item ? { ...item, source: source.name, publishedAt: null } : null;
}

async function fetchSource(source: typeof SOURCES[number]) {
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "Daggr/1.0 domain market explorer" },
      next: { revalidate: 600 },
    });
    if (!response.ok) return null;
    return extract(await response.text(), source);
  } catch {
    return null;
  }
}

export async function getDomainNews(limit = 5): Promise<DomainNewsItem[]> {
  const results = await Promise.all(SOURCES.map(fetchSource));
  return results.filter((item): item is DomainNewsItem => Boolean(item)).slice(0, limit);
}
