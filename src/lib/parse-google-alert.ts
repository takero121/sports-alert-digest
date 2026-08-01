import * as cheerio from "cheerio";

export type ParsedAlertArticle = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

function unwrapGoogleRedirect(href: string): string {
  try {
    const parsed = new URL(href);
    const nested = parsed.searchParams.get("url");
    if (nested) return nested;
    return href;
  } catch {
    return href;
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractAlertQuery(subject: string | undefined, html: string): string {
  if (subject) {
    const match = subject.match(/Google アラート\s*[-–—]\s*(.+)$/i)
      || subject.match(/Google Alert\s*[-–—]\s*(.+)$/i);
    if (match?.[1]) return cleanText(match[1]);
  }

  const $ = cheerio.load(html);
  const heading = $("h2, h3").first().text();
  if (heading) return cleanText(heading);
  return "スポーツ";
}


/**
 * Google アラートの HTML メールから記事一覧を抜き出す。
 */
export function parseGoogleAlertEmail(input: {
  html?: string;
  text?: string;
  emailSubject?: string;
}): { alertQuery: string; articles: ParsedAlertArticle[] } {
  const html = input.html || "";
  const alertQuery = extractAlertQuery(input.emailSubject, html);

  if (!html && input.text) {
    return {
      alertQuery,
      articles: parsePlainTextAlert(input.text),
    };
  }

  const $ = cheerio.load(html);
  const articles: ParsedAlertArticle[] = [];
  const seen = new Set<string>();

  $("a").each((_, el) => {
    const rawHref = $(el).attr("href") || "";
    if (!rawHref.includes("google.com/url") && !/^https?:\/\//.test(rawHref)) {
      return;
    }

    const title = cleanText($(el).text());
    if (!title || title.length < 8) return;
    if (/^(すべてのニュース|すべての記事|すべての結果|See more|View all)/i.test(title)) {
      return;
    }

    const url = unwrapGoogleRedirect(rawHref);
    if (!url.startsWith("http") || url.includes("google.com/alerts")) return;
    if (seen.has(url)) return;

    const container = $(el).closest("li, tr, div");
    const blockText = cleanText(container.text());
    let snippet = blockText.replace(title, "").trim();
    snippet = snippet
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\b\d{1,2}\s*(時間|分|日前|hours?|minutes?|days?)\b/gi, "")
      .trim();

    // ソース名は短いドメインっぽい断片を優先
    let source = "";
    const sourceCandidate = container.find("font, span").last().text();
    if (sourceCandidate && sourceCandidate.length < 40) {
      source = cleanText(sourceCandidate);
    }
    if (!source) {
      try {
        source = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        source = "unknown";
      }
    }

    // 抜粋は文単位で収める（途中切断の … は付けない）
    if (snippet.length > 400) {
      const cut = snippet.slice(0, 400);
      const end = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
      snippet = end >= 40 ? cut.slice(0, end + 1) : cut;
    }
    if (!snippet) snippet = title;

    seen.add(url);
    articles.push({ title, url, snippet, source });
  });

  return { alertQuery, articles: articles.slice(0, 30) };
}

function parsePlainTextAlert(text: string): ParsedAlertArticle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const articles: ParsedAlertArticle[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const urlMatch = line.match(/https?:\/\/\S+/);
    if (!urlMatch) continue;

    const url = unwrapGoogleRedirect(urlMatch[0]);
    const title = cleanText(line.replace(urlMatch[0], "")) || lines[i - 1] || "無題の記事";
    const snippet = lines[i + 1] && !lines[i + 1].startsWith("http")
      ? lines[i + 1]
      : title;

    articles.push({
      title,
      url,
      snippet,
      source: (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return "unknown";
        }
      })(),
    });
  }

  return articles.slice(0, 30);
}
