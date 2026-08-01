import type { Article } from "./types";
import { fetchArticlePlainText } from "./fetch-article";

const CONCURRENCY = 5;

/** 元記事を読んで要約文を作る（OpenAIがあれば利用、なければ本文から抽出要約） */
export async function summarizeFromSource(article: Article): Promise<{
  summary: string;
  fromArticle: boolean;
}> {
  if (article.summarizedFromArticle && article.summary) {
    return { summary: article.summary, fromArticle: true };
  }

  const text = await fetchArticlePlainText(article.url);
  if (!text || text.length < 80) {
    return {
      summary: fallbackFromTitle(article),
      fromArticle: false,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const summary = await summarizeWithOpenAI(article.title, text, article.tags);
      if (summary) return { summary, fromArticle: true };
    } catch {
      // fall through to extractive
    }
  }

  const summary = summarizeExtractive(article.title, text, article.tags);
  return { summary, fromArticle: summary !== fallbackFromTitle(article) };
}

export async function enrichArticlesWithSourceSummaries(
  articles: Article[],
): Promise<Article[]> {
  const results: Article[] = new Array(articles.length);
  let index = 0;

  async function worker() {
    while (index < articles.length) {
      const current = index;
      index += 1;
      const article = articles[current];
      const { summary, fromArticle } = await summarizeFromSource(article);
      results[current] = {
        ...article,
        summary,
        summarizedFromArticle: fromArticle,
      };
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, Math.max(articles.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function summarizeWithOpenAI(
  title: string,
  text: string,
  tags: string[],
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "あなたは日本語のニュース編集者です。元記事の内容だけをもとに、です・ます調で180〜280文字の要約を1つ書いてください。前置き・見出し・箇条書きは不要。推測で書かず、本文にある事実だけをまとめてください。",
        },
        {
          role: "user",
          content: [
            `タイトル: ${title}`,
            tags.length ? `テーマ: ${tags.join(" / ")}` : "",
            "",
            "本文:",
            text.slice(0, 7000),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  return content.replace(/\s+/g, " ").trim();
}

/** 本文からタイトル関連の文だけを抜き、読みやすい要約に再構成する */
function summarizeExtractive(title: string, text: string, tags: string[]): string {
  const titleTokens = tokenize(title);
  const sentences = splitSentences(text)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 200)
    .filter((s) => !isBadSentence(s));

  const scored = sentences
    .map((sentence, i) => {
      const overlap = titleTokens.filter((t) => sentence.includes(t)).length;
      let score = overlap * 5;
      if (overlap === 0) score -= 20;
      for (const tag of tags) {
        if (sentence.includes(tag)) score += 2;
      }
      if (i < 8) score += 1;
      if (/発表|明らか|導入|調達|提携|開設|開始|決定|出資|契約/.test(sentence)) score += 2;
      return { sentence, score, overlap };
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return fallbackFromTitle({ title, tags, alertQuery: "" });
  }

  const picked: string[] = [];
  let total = 0;
  for (const item of scored) {
    if (picked.includes(item.sentence)) continue;
    if (total + [...item.sentence].length > 240) continue;
    picked.push(item.sentence);
    total += [...item.sentence].length;
    if (picked.length >= 2 || total >= 150) break;
  }

  let body = picked.map(ensurePeriod).join("");
  if (tags.length > 0 && !/注目|テーマ/.test(body)) {
    body += `${tags.slice(0, 3).join("・")}の観点でも注目されます。`;
  }
  return body;
}

function fallbackFromTitle(
  article: Pick<Article, "title" | "tags"> & { alertQuery?: string },
): string {
  const themes =
    article.tags.slice(0, 3).join("・") ||
    String(article.alertQuery || "").replace(/^スポーツ\s*/, "") ||
    "スポーツ";
  return `「${article.title}」について報じられています。詳細は元記事をご確認ください。${themes}の観点から注目される動きです。`;
}

function tokenize(title: string): string[] {
  return title
    .replace(/[｜|【】\[\]（）()\-－、。・\/]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !/^(お知らせ|について|まとめ|株式会社)$/.test(t));
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isBadSentence(s: string): boolean {
  return /cookie|プライバシー|利用規約|copyright|関連記事|おすすめ|ログイン|会員|フォロー|シェアする|続きを読む|購入前確認|表紙|テレコン|ご利用いただき/i.test(
    s,
  );
}

function ensurePeriod(text: string): string {
  const t = text.trim();
  return /[。！？]$/.test(t) ? t : `${t}。`;
}
