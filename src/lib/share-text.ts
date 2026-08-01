import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

type SummaryInput = Pick<Article, "title" | "summary" | "tags"> &
  Partial<Pick<Article, "source" | "alertQuery">>;

/** X投稿用の短文 */
export function buildShareText(article: Pick<Article, "title" | "summary" | "url" | "tags">): string {
  const tagLine = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";
  const body = polishSummary(article);

  return [
    `【${SERVICE_NAME}】${plainText(article.title)}`,
    "",
    trimText(body, 120),
    "",
    article.url,
    "",
    `${tagLine} ${SERVICE_TAG}`,
  ].join("\n");
}

/**
 * Slack掲載用: 見出し + 文章として成立する要約 + ハッシュタグ
 */
export function buildSlackArticleText(article: SummaryInput & Pick<Article, "url">): string {
  const title = plainText(article.title);
  const body = polishSummary(article);
  const tags = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";

  return [
    `*${title}*`,
    "",
    body,
    "",
    `${tags} ${SERVICE_TAG}`,
    "",
    `<${article.url}|元記事を開く>`,
  ].join("\n");
}

export function buildDigestShareText(articles: Article[], dateLabel: string): string {
  const top = articles.slice(0, 3);
  const lines = top.map((a, i) => `${i + 1}. ${a.title}`);
  return [
    `【${SERVICE_NAME}】${dateLabel} のスポーツニュース`,
    "",
    ...lines,
    "",
    `${SERVICE_TAG} #スポーツ`,
  ].join("\n");
}

/** 壊れた抜粋を、読みやすい日本語の要約文に整える */
export function polishSummary(article: SummaryInput): string {
  const title = plainText(article.title);
  const themes =
    article.tags.slice(0, 3).join("・") ||
    plainText(article.alertQuery || "").replace(/^スポーツ\s*/, "") ||
    "スポーツ";

  let body = plainText(article.summary)
    .replace(/（注目点:[^）]*）/g, " ")
    .replace(/<\/?[a-zA-Z][^>\s]*/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    // 省略記号は句点にせず、不完全文を作らない
    .replace(/\.{2,}|…+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  body = body
    .replace(
      /^(?:NIKKEI|PR TIMES|SmartNews|FNNプライムオンライン|HashHub Research|エキサイト|日本経済新聞|【NIKKEI COMPASS】)\s*/i,
      "",
    )
    .replace(/^【[^】]{1,40}】\s*/, "")
    .trim();

  if (article.source) {
    const source = plainText(article.source);
    if (source && body.toLowerCase().startsWith(source.toLowerCase())) {
      body = body.slice(source.length).replace(/^[\s\-|:：]+/, "").trim();
    }
  }

  if (body.startsWith(title)) {
    body = body.slice(title.length).replace(/^[\s\-|:：]+/, "").trim();
  }

  const sentences = body
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter((s) => isCompleteSentence(s));

  if (sentences.length > 0) {
    body = sentences[0];
    if (
      sentences[1] &&
      [...body].length + [...sentences[1]].length <= 180 &&
      isCompleteSentence(sentences[1])
    ) {
      body += sentences[1];
    }
  } else {
    body = "";
  }

  if (!isReadableBlurb(body)) {
    return `「${title}」について報じられています。${themes}の観点から注目される動きです。`;
  }

  return `${ensurePeriod(body)}${themes}がテーマのニュースです。`;
}

function isCompleteSentence(sentence: string): boolean {
  if ([...sentence].length < 22) return false;
  if (!/[。！？]$/.test(sentence)) return false;
  const core = sentence.replace(/[。！？]$/, "").trim();
  if (/[やのをがはとにもへでて、,]$/u.test(core)) return false;
  if (/<[a-z]|table|td|tr/i.test(sentence)) return false;
  // カギ括弧が閉じていない
  if ((core.match(/「/g) || []).length !== (core.match(/」/g) || []).length) return false;
  return true;
}

function ensurePeriod(text: string): string {
  return /[。！？]$/.test(text) ? text : `${text}。`;
}

function isReadableBlurb(text: string): boolean {
  if (!text || [...text].length < 22) return false;
  if (/<[a-z]|table|td|tr|nbsp/i.test(text)) return false;
  if (!/[。！？]/.test(text)) return false;
  if ((text.match(/[ぁ-んァ-ヶ一-龥]/g) || []).length < 10) return false;
  return true;
}

function plainText(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function trimText(text: string, max: number): string {
  const cleaned = plainText(text);
  const chars = [...cleaned];
  if (chars.length <= max) return cleaned;
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}
