const feeds = [
  ["Domain Name Wire", "https://domainnamewire.com/feed/"],
  ["DNJournal", "https://www.dnjournal.com/rss.xml"],
  ["Domain Incite", "https://domainincite.com/feed"],
  ["The Domains", "https://www.thedomains.com/feed/"],
  ["DomainInvesting.com", "https://domaininvesting.com/feed/"],
] as const;

const clean = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

function firstItem(xml: string) {
  return xml.match(/<item[\s\S]*?<\/item>/i)?.[0] ??
    xml.match(/<entry[\s\S]*?<\/entry>/i)?.[0] ??
    null;
}

function field(item: string, name: string) {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ? clean(match[1]) : "";
}

function link(item: string) {
  const plain = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1];
  if (plain) return clean(plain);
  const href = item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
  return href ? clean(href) : "";
}

export async function getNews() {
  const results = await Promise.all(
    feeds.map(async ([source, url]) => {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Daggr/1.0 (+https://daggr.vercel.app)" },
          next: { revalidate: 900 },
        });
        if (!response.ok) return null;
        const item = firstItem(await response.text());
        if (!item) return null;
        const title = field(item, "title");
        const href = link(item);
        return title && href ? { source, title, url: href } : null;
      } catch {
        return null;
      }
    }),
  );

  return results.filter(Boolean) as { source: string; title: string; url: string }[];
}
