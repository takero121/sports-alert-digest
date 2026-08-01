import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

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
 * Slack掲載用テキスト（見出し・要約・ハッシュタグで 200〜300 文字）
 */
export function buildSlackArticleText(
  article: Pick<Article, "title" | "summary" | "url" | "tags">,
): string {
  const tags = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";
  const hashtags = `${tags} ${SERVICE_TAG}`;
  const footer = `\n\n${hashtags}\n\n${article.url}`;
  const footerLen = [...footer].length;

  const minBody = Math.max(40, 200 - footerLen);
  const maxBody = Math.max(minBody, 300 - footerLen);

  let title = article.title.trim();
  let summary = cleanSummary(article.summary);

  const buildBody = (t: string, s: string) => `【${t}】\n\n${s}`;

  // まず要約を調整して 200〜300 に収める
  let body = buildBody(title, summary);
  let bodyLen = [...body].length;

  if (bodyLen > maxBody) {
    const titleBudget = Math.min([...title].length, Math.floor(maxBody * 0.35));
    title = trimText(title, Math.max(12, titleBudget));
    const used = [...buildBody(title, "")].length;
    summary = trimText(summary, Math.max(40, maxBody - used));
    body = buildBody(title, summary);
  } else if (bodyLen < minBody) {
    // 短すぎる場合は要約をできるだけ使う（元文が短ければその長さで許容）
    summary = cleanSummary(article.summary) || title;
    body = buildBody(title, summary);
    if ([...body].length > maxBody) {
      const used = [...buildBody(title, "")].length;
      summary = trimText(summary, Math.max(40, maxBody - used));
      body = buildBody(title, summary);
    }
  }

  let text = `${body}${footer}`;
  const len = [...text].length;
  if (len > 300) {
    text = `${[...text].slice(0, 299).join("")}…`;
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
