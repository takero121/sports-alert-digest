import type { Article } from "./types";

/** X投稿用の短文を作る（コピペしやすい長さ） */
export function buildShareText(article: Pick<Article, "title" | "summary" | "url" | "tags">): string {
  const tagLine = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツイノベーション";

  const body = [
    `【スポーツイノベーション】${article.title}`,
    "",
    trimForX(article.summary, 110),
    "",
    article.url,
    "",
    `${tagLine} #スポーツテック #SIDELINE`,
  ].join("\n");

  return body;
}

function trimForX(text: string, max: number): string {
  const cleaned = text.replace(/（注目点:.*?）$/, "").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function buildDigestShareText(articles: Article[], dateLabel: string): string {
  const top = articles.slice(0, 3);
  const lines = top.map((a, i) => `${i + 1}. ${a.title}`);
  return [
    `【SIDELINE】${dateLabel} のスポーツイノベーション`,
    "",
    ...lines,
    "",
    "#スポーツイノベーション #スポーツテック #SIDELINE",
  ].join("\n");
}
