import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

type SummaryInput = Pick<Article, "title" | "summary" | "tags"> &
  Partial<Pick<Article, "source" | "alertQuery" | "summarizedFromArticle">>;

/** X投稿用の短文 */
export function buildShareText(article: Pick<Article, "title" | "summary" | "url" | "tags">): string {
  const tagLine = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";

  return [
    `【${SERVICE_NAME}】${plainText(article.title)}`,
    "",
    trimText(plainText(article.summary), 120),
    "",
    article.url,
    "",
    `${tagLine} ${SERVICE_TAG}`,
  ].join("\n");
}

/**
 * Slack掲載用: 見出し + 要約文 + ハッシュタグ
 * 元記事要約済みならそのまま使い、未要約のときだけ整形フォールバックする
 */
export function buildSlackArticleText(article: SummaryInput & Pick<Article, "url">): string {
  const title = plainText(article.title);
  const body = article.summarizedFromArticle
    ? plainText(article.summary)
    : polishSummary(article);
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

export function polishSummary(article: SummaryInput): string {
  const title = plainText(article.title);
  const themes =
    article.tags.slice(0, 3).join("・") ||
    plainText(article.alertQuery || "").replace(/^スポーツ\s*/, "") ||
    "スポーツ";

  const body = plainText(article.summary);
  if (body.length >= 40 && /[。！？]/.test(body) && !/<[a-z]|table|td/i.test(body)) {
    return body;
  }

  return `「${title}」について報じられています。${themes}の観点から注目される動きです。`;
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
