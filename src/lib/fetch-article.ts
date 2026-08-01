import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 12000;

export type FetchedArticle = {
  text: string | null;
  /** ページから取れた見出し（媒体名サフィックス除去済み） */
  pageTitle: string | null;
};

/** 元記事ページから本文と見出しを抽出する（直接取得と Jina を併用） */
export async function fetchArticleContent(
  url: string,
  title = "",
): Promise<FetchedArticle> {
  const candidates = expandUrlCandidates(url);
  const results = await Promise.all(
    candidates.flatMap((candidate) => [
      fetchDirect(candidate, title),
      fetchViaJina(candidate),
    ]),
  );

  const ranked = results
    .filter((r): r is NonNullable<typeof r> => Boolean(r?.text && r.text.length >= 80))
    .map((r) => ({
      ...r,
      score: relevanceScore(r.text!, title),
    }))
    .filter((x) => x.score > 0 || x.text!.length >= 400)
    .sort((a, b) => b.score - a.score || b.text!.length - a.text!.length);

  let pageTitle: string | null = null;
  for (const item of ranked) {
    if (item.pageTitle && !pageTitle) pageTitle = item.pageTitle;
    if (isUsefulText(item.text!, title)) {
      return { text: item.text!, pageTitle: item.pageTitle || pageTitle };
    }
  }

  const best = ranked[0];
  return {
    text: best?.text ?? null,
    pageTitle: best?.pageTitle || pageTitle,
  };
}

/** 互換: 本文のみ返す */
export async function fetchArticlePlainText(
  url: string,
  title = "",
): Promise<string | null> {
  const { text } = await fetchArticleContent(url, title);
  return text;
}

/** excite の PR TIMES ミラー等を元サイト URL に展開する */
function expandUrlCandidates(url: string): string[] {
  const out = [url];
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // https://www.excite.co.jp/news/article/Prtimes_2025-09-01-72985-310/
    const m = u.pathname.match(
      /Prtimes_(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)/i,
    );
    if (host.includes("excite.co.jp") && m) {
      const companyId = m[2].padStart(9, "0");
      const releaseId = m[3].padStart(9, "0");
      out.push(
        `https://prtimes.jp/main/html/rd/p/${releaseId}.${companyId}.html`,
      );
    }
  } catch {
    // ignore
  }
  return [...new Set(out)].slice(0, 3);
}

async function fetchDirect(
  url: string,
  title: string,
): Promise<FetchedArticle | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.8",
      },
    });

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!/html|text|xml/i.test(contentType) && contentType) return null;

    const html = await res.text();
    if (!html || html.length < 200) return null;
    return extractMainContent(html, title);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaJina(url: string): Promise<FetchedArticle | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "text",
        "X-Retain-Images": "none",
      },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text || text.length < 80) return null;
    if (/403 ERROR|Request blocked|could not be satisfied/i.test(text)) {
      return null;
    }

    const titleMatch = text.match(/^Title:\s*(.+)$/im);
    const pageTitle = titleMatch?.[1]
      ? stripMediaSuffix(clean(titleMatch[1]))
      : null;

    const cleaned = text
      .replace(/^Title:.*$/gim, "")
      .replace(/^URL Source:.*$/gim, "")
      .replace(/^Warning:.*$/gim, "")
      .replace(/^Markdown Content:\s*/gim, "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 80) return null;
    return { text: cleaned.slice(0, 8000), pageTitle };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractMainContent(html: string, title: string): FetchedArticle {
  const $ = cheerio.load(html);
  const pageTitle = extractPageTitle($);

  $("script, style, noscript, svg, iframe, nav, footer, header, aside, form").remove();
  $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();

  const blocks: string[] = [];
  $("article p, main p, [itemprop='articleBody'] p, .article p, .content p, p").each(
    (_, el) => {
      const text = clean($(el).text());
      if (text.length < 40) return;
      if (isNoise(text)) return;
      blocks.push(text);
    },
  );

  const tokens = tokenize(title || pageTitle || "");
  const ranked = blocks
    .map((text, i) => {
      const overlap = tokens.filter((t) => text.includes(t)).length;
      let score = overlap * 6;
      if (i < 12) score += 1;
      if (/発表|調達|提携|導入|開始|出資|契約|明らか/.test(text)) score += 2;
      return { text, score, overlap };
    })
    .sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  let total = 0;
  for (const item of ranked) {
    if (item.overlap === 0 && picked.length > 0) continue;
    if (picked.includes(item.text)) continue;
    picked.push(item.text);
    total += item.text.length;
    if (total >= 2500) break;
  }

  if (picked.length === 0) {
    const root =
      $("article").first().length > 0
        ? $("article").first()
        : $("main").first().length > 0
          ? $("main").first()
          : $("body");
    const fallback = clean(root.text());
    if (fallback.length < 80) return { text: null, pageTitle };
    return { text: fallback.slice(0, 6000), pageTitle };
  }

  const order = new Map(blocks.map((t, i) => [t, i]));
  picked.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { text: picked.join("\n").slice(0, 8000), pageTitle };
}

function extractPageTitle($: ReturnType<typeof cheerio.load>): string | null {
  const candidates = [
    $('meta[property="og:title"]').attr("content"),
    $('meta[name="twitter:title"]').attr("content"),
    $("h1").first().text(),
    $("title").first().text(),
  ];

  for (const raw of candidates) {
    const t = stripMediaSuffix(clean(String(raw || "")));
    if (t.length >= 8 && t.length <= 200) return t;
  }
  return null;
}

/** 見出し・本文から除く媒体名（表記ゆれ含む） */
const MEDIA_OUTLET_PATTERN =
  /(?:PR[\s-]?TIMES|Yahoo!?ニュース|Yahoo!?ファイナンス|Yahoo!|エキサイト(?:ニュース)?|excite(?:ニュース)?|innovaTopia|Innovatopia|イノベートピア|時事通信|共同通信|ロイター(?:通信)?|Bloomberg|日本経済新聞|日経(?:新聞|電子版|COMPASS)?|NIKKEI(?:\s*COMPASS)?|朝日新聞|毎日新聞|読売新聞|産経新聞|スポーツ報知|日刊スポーツ|サンスポ|スポニチ|スポーツ\s*マニア|スポーツマニア|Number Web|Sportsnavi|スポーツナビ|AFPBB|CNET|ITmedia|TechCrunch|BRIDGE|NewsPicks|東洋経済|ダイヤモンド|Forbes|Impress|マイナビニュース|レスポンス|スマートニュース|SmartNews|HashHub(?:\s*Research)?|あたらしい経済|ANIMAGIC\s*DAO|公募ガイド|福島民友(?:新聞社)?|トレーダーズ[・･]?ウェブ|ベンチャーズクエア|벤처스퀘어|公式サイト|プレスリリース)/iu;

/** 見出し末尾の媒体名（| PR TIMES / - エキサイト / - innovaTopia 等）を除く */
export function stripMediaSuffix(title: string, source = ""): string {
  let t = clean(title);

  // 「タイトル | 媒体」「タイトル｜媒体」は媒体側を全部落とす
  t = t.replace(/\s*[|｜]\s*[^|｜]{1,60}$/u, "");

  // 「タイトル - 媒体名」（既知媒体）
  t = t.replace(new RegExp(`\\s*[-–—―]\\s*${MEDIA_OUTLET_PATTERN.source}\\s*$`, "iu"), "");

  // 「タイトル(媒体)」「タイトル（媒体）」
  t = t.replace(new RegExp(`[（(]\\s*${MEDIA_OUTLET_PATTERN.source}\\s*[）)]\\s*$`, "iu"), "");
  t = t.replace(/\s*[【\[](?:PR|広告|プレスリリース)[】\]]\s*$/iu, "");

  // source（hostname 等）由来の末尾ブランドも落とす
  for (const brand of sourceBrands(source)) {
    const escaped = escapeRegExp(brand);
    t = t.replace(new RegExp(`\\s*[-–—―|｜]\\s*${escaped}\\s*$`, "iu"), "");
    t = t.replace(new RegExp(`[（(]\\s*${escaped}\\s*[）)]\\s*$`, "iu"), "");
  }

  // ヒューリスティック: 「 - 短い固有名」は媒体サフィックスとみなす
  // （動詞っぽい語が無く、カタカナ/英字/メディア語尾が多いとき）
  t = t.replace(/\s*[-–—―]\s*([^\s。！？]{2,40})\s*$/u, (full, media: string) => {
    return looksLikeMediaLabel(media) ? "" : full;
  });
  t = t.replace(/[（(]\s*([^）)]{2,30})\s*[）)]\s*$/u, (full, media: string) => {
    return looksLikeMediaLabel(media) ? "" : full;
  });

  return clean(t);
}

/** 要約先頭や文中の媒体クレジットを落とす */
export function stripMediaLabels(text: string, source = ""): string {
  let s = clean(text);
  // 先頭の媒体名（「エキサイト ○○は」「PR TIMES ○○」）
  s = s.replace(new RegExp(`^${MEDIA_OUTLET_PATTERN.source}\\s*[:：]?\\s*`, "iu"), "");
  for (const brand of sourceBrands(source)) {
    s = s.replace(new RegExp(`^${escapeRegExp(brand)}\\s*[:：]?\\s*`, "iu"), "");
  }
  // 「○○によると」「○○が報じた」
  s = s.replace(
    new RegExp(`${MEDIA_OUTLET_PATTERN.source}(?:によると|が報じた|の報道によると|の報道では)`, "giu"),
    "",
  );
  s = s.replace(new RegExp(`[（(]\\s*${MEDIA_OUTLET_PATTERN.source}\\s*[）)]`, "giu"), "");
  return clean(s);
}

function sourceBrands(source: string): string[] {
  const raw = clean(source);
  if (!raw || raw === "unknown") return [];
  const host = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  const base = host.split(".")[0] || host;
  const brands = new Set<string>([raw, host, base]);
  // excite.co.jp → エキサイト も候補に
  if (/^excite$/i.test(base)) brands.add("エキサイト");
  if (/^innovatopia$/i.test(base)) {
    brands.add("innovaTopia");
    brands.add("Innovatopia");
  }
  if (/^prtimes$/i.test(base)) brands.add("PR TIMES");
  if (/yahoo/i.test(host)) {
    brands.add("Yahoo!ニュース");
    brands.add("Yahoo!ファイナンス");
  }
  return [...brands].filter((b) => b.length >= 3);
}

function looksLikeMediaLabel(media: string): boolean {
  const m = clean(media);
  if (!m || m.length > 40) return false;
  if (MEDIA_OUTLET_PATTERN.test(m)) return true;
  if (/[。！？]/.test(m)) return false;
  // ニュース本文っぽい動詞が入っていたら媒体名ではない
  if (
    /発表|調達|提携|導入|開始|出資|契約|開設|決定|実施|提供|開催|設立|買収|発売|開始し|結び|受け/.test(
      m,
    )
  ) {
    return false;
  }
  if (/(?:新聞|ニュース|通信|タイムズ|マニア|ガイド|Research|COMPASS|DAO|Web|ウェブ)$/i.test(m)) {
    return true;
  }
  // カタカナ・英字・数字・記号中心の短いラベル
  const compact = m.replace(/[\s・･&.]/g, "");
  const mediaChars = compact.replace(/[A-Za-z0-9ぁ-んァ-ヶー一-龥]/g, "");
  if (mediaChars.length > 0) return false;
  const katakanaLatin = compact.replace(/[^A-Za-zァ-ヶー0-9]/g, "");
  return katakanaLatin.length >= 3 && katakanaLatin.length / compact.length >= 0.7;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relevanceScore(text: string, title: string): number {
  if (!title) return text.length > 200 ? 1 : 0;
  const tokens = tokenize(title);
  if (!tokens.length) return 0;
  return tokens.filter((t) => text.includes(t)).length;
}

function isUsefulText(text: string, title: string): boolean {
  if (text.length < 80) return false;
  if (isNoise(text.slice(0, 200))) return false;
  if (
    /サービスを終了|会員登録|ログインしてお|購入前確認|免責事項|cookie|プライバシーポリシー|アクセスランキング|ニュースまとめ|公式サイト：\s*■/i.test(
      text.slice(0, 500),
    )
  ) {
    return false;
  }

  if (!title) return text.length >= 160;
  const score = relevanceScore(text, title);
  // タイトル語がほとんど無い本文は別ページ混入とみなす
  return score >= 2 || score / Math.max(tokenize(title).length, 1) >= 0.25;
}

function tokenize(title: string): string[] {
  return title
    .replace(/[｜|【】\[\]（）()\-－、。・\/]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !/^(お知らせ|について|まとめ|株式会社|ニュース)$/.test(t));
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
