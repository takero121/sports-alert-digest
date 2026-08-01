import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";
import { stripMediaSuffix } from "./fetch-article";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

type SummaryInput = Pick<Article, "title" | "summary" | "tags"> &
  Partial<Pick<Article, "source" | "alertQuery" | "summarizedFromArticle">>;

/** X投稿用の短文（文字数制限があるため要約のみ短縮。見出しは全文） */
export function buildShareText(article: Pick<Article, "title" | "summary" | "url" | "tags">): string {
  const tagLine = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";
  const title = displayTitle(article.title);

  return [
    `【${SERVICE_NAME}】${title}`,
    "",
    trimAtSentence(plainText(article.summary), 120),
    "",
    article.url,
    "",
    `${tagLine} ${SERVICE_TAG}`,
  ].join("\n");
}

/**
 * Slack掲載用: 見出し全文 + 要約全文 + ハッシュタグ
 * 媒体名は出さない。途中切断しない。
 */
export function buildSlackArticleText(article: SummaryInput & Pick<Article, "url">): string {
  const title = displayTitle(article.title);
  const cleaned = plainText(article.summary);
  const body =
    (article.summarizedFromArticle || isUsableSummary(cleaned)) &&
    isUsableSummary(cleaned)
      ? cleaned
      : polishSummary(article);
  const tags = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";

  return [
    `*${escapeMrkdwn(title)}*`,
    "",
    escapeMrkdwn(body),
    "",
    `${tags} ${SERVICE_TAG}`,
    "",
    `<${article.url}|元記事を開く>`,
  ].join("\n");
}

/** Slack用: 見出しだけ（番号付き） */
export function buildSlackTitleLine(index: number, title: string): string {
  return `*${index + 1}. ${escapeMrkdwn(displayTitle(title))}*`;
}

/** Slack用: 本文・タグ・リンク（見出しなし） */
export function buildSlackBodyText(article: SummaryInput & Pick<Article, "url">): string {
  const cleaned = plainText(article.summary);
  const body =
    (article.summarizedFromArticle || isUsableSummary(cleaned)) &&
    isUsableSummary(cleaned)
      ? cleaned
      : polishSummary(article);
  const tags = article.tags.length
    ? article.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "#スポーツ";

  return [
    escapeMrkdwn(body),
    "",
    `${tags} ${SERVICE_TAG}`,
    "",
    `<${article.url}|元記事を開く>`,
  ].join("\n");
}

export function buildDigestShareText(articles: Article[], dateLabel: string): string {
  const top = articles.slice(0, 3);
  const lines = top.map((a, i) => `${i + 1}. ${displayTitle(a.title)}`);
  return [
    `【${SERVICE_NAME}】${dateLabel} のスポーツニュース`,
    "",
    ...lines,
    "",
    `${SERVICE_TAG} #スポーツ`,
  ].join("\n");
}

export function polishSummary(article: SummaryInput): string {
  const title = displayTitle(article.title);
  const body = plainText(article.summary);
  if (isUsableSummary(body)) {
    return body;
  }

  return `「${title}」についての記事です。`;
}

/** 表示用見出し: 媒体名を除き、途切れ記号だけ落として全文を返す */
export function displayTitle(title: string): string {
  return stripMediaSuffix(plainText(title))
    .replace(/\s*\.{2,}\s*$/, "")
    .replace(/\s*…\s*$/, "")
    .replace(/\s*･･･\s*$/, "")
    .trim();
}

function isUsableSummary(body: string): boolean {
  if (body.length < 40 || !/[。！？]/.test(body)) return false;
  if (/<[a-z]|table|td|注目点:/i.test(body)) return false;
  if (
    /詳細は元記事を|注目|観点から|アクセスランキング|公式サイト：|ニュースまとめ/.test(
      body,
    )
  ) {
    return false;
  }
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

/** X向け: 文末で収める（途中に … を差し込まない） */
function trimAtSentence(text: string, max: number): string {
  const cleaned = plainText(text);
  if ([...cleaned].length <= max) return cleaned;
  const sentences = cleaned.split(/(?<=[。！？])/).filter((s) => s.trim());
  let out = "";
  for (const s of sentences) {
    const next = out + s;
    if ([...next].length > max) break;
    out = next;
  }
  if (out) return out.trim();
  return cleaned;
}

function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
