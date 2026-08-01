import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

/** Slack section の上限に余裕を持たせる */
const SLACK_TEXT_MAX = 2900;

/** X投稿用の短文 */
export function buildShareText(article: Pick<Article, "title" | "summary" | "url" | "tags">): string {
  const tagLine = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";

  return [
    `【${SERVICE_NAME}】${article.title}`,
    "",
    trimText(plainText(article.summary), 110),
    "",
    article.url,
    "",
    `${tagLine} ${SERVICE_TAG}`,
  ].join("\n");
}

/**
 * Slack掲載用テキスト（見出し + 要約全文 + ハッシュタグ）
 * ※文字数カットは Slack 上限近くのみ。要約は原則そのまま出す。
 */
export function buildSlackArticleText(
  article: Pick<Article, "title" | "summary" | "url" | "tags">,
): string {
  const tags = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";
  const hashtags = `${tags} ${SERVICE_TAG}`;
  const title = plainText(article.title);
  const summary = plainText(article.summary) || title;

  let text = [
    `*【${title}】*`,
    "",
    summary,
    "",
    hashtags,
    "",
    `<${article.url}|記事を読む>`,
  ].join("\n");

  if ([...text].length > SLACK_TEXT_MAX) {
    // ハッシュタグとURLは残し、要約側だけ収める
    const footer = `\n\n${hashtags}\n\n<${article.url}|記事を読む>`;
    const header = `*【${title}】*\n\n`;
    const budget = SLACK_TEXT_MAX - [...header].length - [...footer].length - 1;
    const clipped = trimText(summary, Math.max(80, budget));
    text = `${header}${clipped}${footer}`;
  }
  return text;
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

function plainText(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function trimText(text: string, max: number): string {
  const cleaned = plainText(text);
  const chars = [...cleaned];
  if (chars.length <= max) return cleaned;
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}
