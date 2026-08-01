import type { ParsedAlertArticle } from "./parse-google-alert";
import { ALERT_THEMES } from "./keywords";

const HIGH_IMPACT = [
  "イノベーション",
  "テクノロジー",
  "新規事業",
  "スタートアップ",
  "資金調達",
  "シリーズA",
  "シリーズB",
  "買収",
  "提携",
  "業務提携",
  "出資",
  "ローンチ",
  "リリース",
  "プロダクト",
  "プラットフォーム",
  "生成AI",
  "AI",
  "機械学習",
  "データ分析",
  "ウェアラブル",
  "センサー",
  "VR",
  "AR",
  "メタバース",
  "Web3",
  "NFT",
  "ブロックチェーン",
  "マーケティング",
  "ブランディング",
  "ファンエンゲージメント",
  "スポーツテック",
  "SportsTech",
  "デジタルトランスフォーメーション",
  "DX",
  "ベンチャーキャピタル",
  "VC",
  "エンターテインメント",
  "エンタメ",
  "スポーツビジネス",
];

const DOMAIN_HINTS = [
  "スポーツ",
  "アスリート",
  "クラブ",
  "リーグ",
  "スタジアム",
  "観戦",
  "トレーニング",
  "パフォーマンス",
  "フィットネス",
  "eスポーツ",
  "オリンピック",
  "ワールドカップ",
];

function detectTags(text: string): string[] {
  const tags = new Set<string>();

  if (/イノベーション|革新/.test(text)) tags.add("イノベーション");
  if (/テクノロジー|テック|SportsTech|スポーツテック/.test(text)) tags.add("テクノロジー");
  if (/AI|人工知能|機械学習|生成AI/.test(text)) tags.add("AI");
  if (/新規事業|スタートアップ|起業/.test(text)) tags.add("新規事業");
  if (/ブロックチェーン|Web3|NFT|メタバース/.test(text)) tags.add("ブロックチェーン");
  if (/マーケティング|広告|ブランディング|ファンエンゲージ/.test(text)) {
    tags.add("マーケティング");
  }
  if (/ビジネス|事業|収益|マネタイズ|スポーツビジネス/.test(text)) tags.add("ビジネス");
  if (/資金調達|出資|投資|シリーズ|ベンチャーキャピタル|\bVC\b/.test(text)) {
    tags.add("資金調達");
  }
  if (/提携|買収|パートナー/.test(text)) tags.add("提携");
  if (/エンターテイ|エンタメ|entertainment/i.test(text)) tags.add("エンタメ");
  if (/スタートアップ/.test(text)) tags.add("スタートアップ");

  for (const word of DOMAIN_HINTS) {
    if (text.includes(word) && tags.size < 4) tags.add(word);
  }

  return [...tags].slice(0, 4);
}

function scoreArticle(article: ParsedAlertArticle, alertQuery: string): number {
  const text = `${article.title} ${article.snippet} ${alertQuery}`;
  let score = 35;

  for (const word of HIGH_IMPACT) {
    if (text.toLowerCase().includes(word.toLowerCase())) score += 10;
  }
  for (const word of DOMAIN_HINTS) {
    if (text.includes(word)) score += 3;
  }
  if (/スポーツ/.test(alertQuery) || /スポーツ/.test(text)) score += 8;
  for (const theme of ALERT_THEMES) {
    if (alertQuery.includes(theme) || text.includes(theme)) score += 6;
  }
  if (article.title.length >= 20 && article.title.length <= 70) score += 4;
  if (article.snippet.length >= 40) score += 3;

  return Math.min(score, 100);
}

export function buildSummary(article: ParsedAlertArticle, alertQuery: string): string {
  const tags = detectTags(`${article.title} ${article.snippet} ${alertQuery}`);
  const base = sanitizeSnippet(article.snippet || "");
  const title = sanitizeSnippet(article.title);

  let body = base;
  if (body.toLowerCase().startsWith(title.toLowerCase())) {
    body = body.slice(title.length).replace(/^[\s\-|:：]+/, "").trim();
  }

  const end = Math.max(body.lastIndexOf("。"), body.lastIndexOf("！"), body.lastIndexOf("？"));
  if (end >= 28) {
    body = body.slice(0, end + 1);
  } else if (body.length >= 24 && !/[。！？]$/.test(body)) {
    body = `${body.replace(/(?:で|の|を|が|は|と|に|について)\s*$/u, "").trim()}。`;
  }

  if (body.length < 28) {
    body = `「${title}」についての記事です。`;
  }

  return body;
}

function sanitizeSnippet(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\.{2,}|…+/g, "。")
    .replace(/\s+/g, " ")
    .trim();
}

export function enrichArticle(
  article: ParsedAlertArticle,
  alertQuery: string,
): {
  summary: string;
  score: number;
  tags: string[];
} {
  const blob = `${article.title} ${article.snippet} ${alertQuery}`;
  return {
    summary: buildSummary(article, alertQuery),
    score: scoreArticle(article, alertQuery),
    tags: detectTags(blob),
  };
}
