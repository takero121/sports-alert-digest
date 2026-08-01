import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 8000;

/** 元記事ページから本文テキストを抽出する */
export async function fetchArticlePlainText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SportsNewsDigest/1.0; +https://sports-alert-digest.vercel.app)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.8",
      },
    });

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!/html|text|xml/i.test(contentType) && contentType) return null;

    const html = await res.text();
    if (!html || html.length < 200) return null;
    return extractMainText(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractMainText(html: string): string | null {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, header, aside, form").remove();
  $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();

  const root =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("[itemprop='articleBody']").first().length > 0
          ? $("[itemprop='articleBody']").first()
          : $("body");

  const paragraphs: string[] = [];
  root.find("p").each((_, el) => {
    const text = clean($(el).text());
    if (text.length < 40) return;
    if (isNoise(text)) return;
    paragraphs.push(text);
  });

  if (paragraphs.length === 0) {
    const fallback = clean(root.text());
    if (fallback.length < 80) return null;
    return fallback.slice(0, 6000);
  }

  return paragraphs.join("\n").slice(0, 8000);
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isNoise(text: string): boolean {
  return (
    /cookie|プライバシー|利用規約|copyright|関連記事|おすすめ|シェア|フォロー|ログイン|会員登録|広告/i.test(
      text,
    ) || /^[\d\s./:-]+$/.test(text)
  );
}
