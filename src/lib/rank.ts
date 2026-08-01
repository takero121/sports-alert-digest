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
  if (/ビジネス|事業|収益|マネタイズ/.test(text)) tags.add("ビジネス");
  if (/資金調達|出資|投資|シリーズ/.test(text)) tags.add("資金調達");
  if (/提携|買収|パートナー/.test(text)) tags.add("提携");

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
  if (/スポーツ/.test(alertQuery)) score += 8;
  for (const theme of ALERT_THEMES) {
    if (alertQuery.includes(theme) || text.includes(theme)) score += 6;
  }
  if (article.title.length >= 20 && article.title.length <= 70) score += 4;
  if (article.snippet.length >= 40) score += 3;

  return Math.min(score, 100);
}

export function buildSummary(article: ParsedAlertArticle, alertQuery: string): string {
  // Slack では全文を出すので、アラート本文は長めに保持する
  const base = (article.snippet || article.title).trim();
  const compact = base.length > 800 ? `${base.slice(0, 797)}…` : base;
  const tags = detectTags(`${article.title} ${article.snippet} ${alertQuery}`);
  const why =
    tags.length > 0 ? `注目点: ${tags.join(" / ")}` : "スポーツ関連の注目ニュース";
  return `${compact}（${why}）`;
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
