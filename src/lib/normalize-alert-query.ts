import { ALERT_KEYWORDS, ALERT_QUERY_NOISE, ALERT_THEMES } from "./keywords";

/**
 * Googleアラート由来のキーワードを正規化する。
 * - 希望ワードに一致すればそれを使う
 * - 「今日のダイジェスト」等のゴミ値は本文から推定
 */
export function normalizeAlertQuery(
  raw: string | undefined,
  title = "",
  snippet = "",
): string {
  const cleaned = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();

  const matched = matchKnownKeyword(cleaned);
  if (matched) return matched;

  if (!cleaned || isNoiseQuery(cleaned)) {
    return inferFromContent(`${title} ${snippet}`) || "スポーツ";
  }

  // 未知だが意味のあるクエリはそのまま残す
  return cleaned;
}

function matchKnownKeyword(query: string): string | null {
  if (!query) return null;
  const lower = query.toLowerCase();

  for (const kw of ALERT_KEYWORDS) {
    if (kw.toLowerCase() === lower) return kw;
  }

  // 「Google アラート - スポーツ AI」の後半だけ来た場合の部分一致
  // 長いキーワードを優先
  const ranked = [...ALERT_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of ranked) {
    if (lower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(lower)) {
      // 短すぎる部分一致（例: 「AI」だけ）はテーマ語と区別できないので除外
      if (query.length < 4 && kw.length > query.length + 2) continue;
      if (lower === kw.toLowerCase()) return kw;
      if (lower.includes(kw.toLowerCase())) return kw;
    }
  }

  return null;
}

function isNoiseQuery(query: string): boolean {
  return ALERT_QUERY_NOISE.some(
    (n) => query === n || query.startsWith(`${n} `) || query.endsWith(` ${n}`),
  );
}

function inferFromContent(text: string): string | null {
  const blob = text.replace(/\s+/g, " ");
  if (!blob.trim()) return null;

  // スポーツ × テーマを優先
  const sportThemes: Array<{ theme: string; keyword: string }> = [
    { theme: "Web3", keyword: "スポーツ Web3" },
    { theme: "ブロックチェーン", keyword: "スポーツ ブロックチェーン" },
    { theme: "イノベーション", keyword: "スポーツ イノベーション" },
    { theme: "スタートアップ", keyword: "スポーツ スタートアップ" },
    { theme: "テクノロジー", keyword: "スポーツ テクノロジー" },
    { theme: "マーケティング", keyword: "スポーツ マーケティング" },
    { theme: "新規事業", keyword: "スポーツ 新規事業" },
    { theme: "AI", keyword: "スポーツ AI" },
  ];

  const hasSports = /スポーツ|sport/i.test(blob);
  if (hasSports) {
    for (const { theme, keyword } of sportThemes) {
      if (blob.includes(theme) || (theme === "AI" && /\bAI\b|人工知能/.test(blob))) {
        return keyword;
      }
    }
    if (/ビジネス|事業|収益/.test(blob)) return "スポーツビジネス";
  }

  if (/AI/.test(blob) && /エンターテイ|エンタメ|entertainment/i.test(blob)) {
    return "AI エンターテインメント";
  }
  if (/ベンチャーキャピタル|\bVC\b|ベンチャー投資/.test(blob)) {
    return "ベンチャーキャピタル";
  }
  if (/資金調達|シリーズ[A-Z]|出資|調達額/.test(blob)) return "資金調達";
  if (/新規事業/.test(blob)) return "新規事業";

  for (const theme of ALERT_THEMES) {
    if (blob.includes(theme)) {
      const sportMatch = sportThemes.find((s) => s.theme === theme);
      if (sportMatch && hasSports) return sportMatch.keyword;
    }
  }

  return hasSports ? "スポーツビジネス" : null;
}
