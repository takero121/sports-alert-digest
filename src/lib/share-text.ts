import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

const SERVICE_TAG = `#${SERVICE_NAME.replace(/\s+/g, "")}`;

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
export function buildSlackArticleText(
  article: Pick<Article, "title" | "summary" | "url" | "tags" | "source" | "alertQuery">,
): string {
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
export function polishSummary(
  article: Pick<Article, "title" | "summary" | "tags" | "source" | "alertQuery">,
): string {
  const title = plainText(article.title);
  let body = plainText(article.summary)
    .replace(/（注目点:[^）]*）/g, " ")
    .replace(/<\/?[a-zA-Z][^>\s]*/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\.{2,}|…+/g, "。")
    .replace(/\s+/g, " ")
    .trim();

  // 先頭の媒体名を除去
  if (article.source) {
    const source = plainText(article.source);
    if (source && body.toLowerCase().startsWith(source.toLowerCase())) {
      body = body.slice(source.length).replace(/^[\s\-|:：]+/, "").trim();
    }
  }

  // タイトルの重複を除去
  if (body.startsWith(title)) {
    body = body.slice(title.length).replace(/^[\s\-|:：]+/, "").trim();
  }

  // 文として切れる位置まで使う
  const endMarks = ["。", "！", "？", ".", "!", "?"];
  let lastEnd = -1;
  for (const mark of endMarks) {
    lastEnd = Math.max(lastEnd, body.lastIndexOf(mark));
  }
  if (lastEnd >= 28) {
    body = body.slice(0, lastEnd + 1).trim();
  } else if (body.length > 0) {
    body = body
      .replace(/(?:で|の|を|が|は|と|に|も|へ|や|から|まで|について|まとめ|お知らせ)\s*$/u, "")
      .trim();
    if (body.length >= 24 && !/[。！？.!?]$/.test(body)) {
      body = `${body}。`;
    }
  }

  // 短すぎる / 壊れている場合はタイトルから文章を作る
  if (!isReadableBlurb(body)) {
    const themes =
      article.tags.slice(0, 3).join("・") ||
      plainText(article.alertQuery || "") ||
      "スポーツ";
    body = `「${title}」について報じられています。${themes}の観点から注目される動きです。`;
  } else if (article.tags.length > 0 && !/注目/.test(body)) {
    body = `${body}注目テーマは${article.tags.slice(0, 3).join("・")}です。`;
  }

  return body;
}

function isReadableBlurb(text: string): boolean {
  if (!text || [...text].length < 28) return false;
  if (/<[a-z]|table|td|tr|nbsp/i.test(text)) return false;
  if ((text.match(/[ぁ-んァ-ヶ一-龥A-Za-z0-9]/g) || []).length < 20) return false;
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
