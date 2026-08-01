import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

/** Slack section の上限に余裕を持たせる */
const SLACK_TEXT_MAX = 2800;

/** X投稿用の短文 */
export function buildShareText(article: Pick<Article, "title" | "summary" | "url" | "tags">): string {
  const tagLine = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";

  return [
    `【${SERVICE_NAME}】${article.title}`,
    "",
    trimText(cleanSummary(article.summary), 110),
    "",
    article.url,
    "",
    `${tagLine} ${SERVICE_TAG}`,
  ].join("\n");
}

/**
 * Slack掲載用テキスト（見出し + 要約全文 + ハッシュタグ）
 */
export function buildSlackArticleText(
  article: Pick<Article, "title" | "summary" | "url" | "tags">,
): string {
  const tags = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";
  const hashtags = `${tags} ${SERVICE_TAG}`;
  const summary = cleanSummary(article.summary) || article.title;

  let text = [
    `【${article.title.trim()}】`,
    "",
    summary,
    "",
    hashtags,
    "",
    article.url,
  ].join("\n");

  if ([...text].length > SLACK_TEXT_MAX) {
    text = `${[...text].slice(0, SLACK_TEXT_MAX - 1).join("")}…`;
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

function cleanSummary(text: string): string {
  return text.replace(/（注目点:.*?）$/, "").trim();
}

function trimText(text: string, max: number): string {
  const cleaned = text.trim();
  const chars = [...cleaned];
  if (chars.length <= max) return cleaned;
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}
