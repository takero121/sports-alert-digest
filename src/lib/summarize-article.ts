import type { Article } from "./types";
import { fetchArticleContent, stripMediaSuffix } from "./fetch-article";

const CONCURRENCY = 4;
const TARGET_CHARS = 300;
const MIN_CHARS = 160;
const MAX_CHARS = 320;

/** 元記事を読んで要約文を作る（OpenAIがあれば利用、なければ本文から抽出要約） */
export async function summarizeFromSource(article: Article): Promise<{
  summary: string;
  fromArticle: boolean;
  title: string;
}> {
  const baseTitle = stripMediaSuffix(plain(article.title));

  // OpenAI 未設定時のみ、既存の元記事要約を再利用する
  if (
    !process.env.OPENAI_API_KEY &&
    article.summarizedFromArticle &&
    article.summary &&
    !isWeakSummary(article.summary)
  ) {
    return {
      summary: article.summary,
      fromArticle: true,
      title: baseTitle,
    };
  }

  const fetched = await fetchArticleContent(article.url, baseTitle);
  const text = fetched.text;
  const title = resolveFullTitle(baseTitle, fetched.pageTitle);
  const hasBody = Boolean(text && text.length >= 120);
  // アラート元抜粋を優先。無いときだけ既存 summary を使う（弱い文言は除外）
  const snippet = cleanSnippet(
    article.snippet ||
      (isWeakSummary(article.summary || "") ? "" : article.summary),
  );

  if (process.env.OPENAI_API_KEY) {
    try {
      const sourceText = hasBody
        ? text!
        : [title, snippet].filter(Boolean).join("\n");
      const richSource = hasBody || [...sourceText].length >= 160;
      const summary = await summarizeWithOpenAI(title, sourceText, richSource);
      const summaryLen = summary ? [...summary].length : 0;
      if (
        summary &&
        !isWeakSummary(summary) &&
        summaryMatchesTitle(summary, title) &&
        summaryLen >= (richSource ? 140 : 70)
      ) {
        return { summary, fromArticle: true, title };
      }
    } catch {
      // fall through
    }
  }

  if (!text || text.length < 120) {
    const fromSnippet = summaryFromSnippet({ ...article, title }, snippet);
    if (
      !isWeakSummary(fromSnippet) &&
      summaryMatchesTitle(fromSnippet, title)
    ) {
      return { summary: fromSnippet, fromArticle: true, title };
    }
    // ゴミ要約は Slack に出さない（タイトル整文のみ・fromArticle=false）
    return { summary: fallbackFromTitle({ title, tags: [] }), fromArticle: false, title };
  }

  let summary = summarizeExtractive(title, text);
  if (process.env.OPENAI_API_KEY && summary && !isWeakSummary(summary)) {
    const polished = await summarizeWithOpenAI(title, text, true);
    if (
      polished &&
      !isWeakSummary(polished) &&
      summaryMatchesTitle(polished, title)
    ) {
      summary = polished;
    }
  }
  if (
    !isWeakSummary(summary) &&
    summaryMatchesTitle(summary, title) &&
    [...summary].length >= 80
  ) {
    return { summary, fromArticle: true, title };
  }
  return {
    summary: fallbackFromTitle({ title, tags: [] }),
    fromArticle: false,
    title,
  };
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
      const { summary, fromArticle, title } = await summarizeFromSource(article);
      results[current] = {
        ...article,
        title,
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
  hasBody: boolean,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const minChars = hasBody ? MIN_CHARS : 100;
  const system = buildSummarySystemPrompt(hasBody);

  let summary = await callOpenAI(key, system, title, text, hasBody);
  if (!summary) return null;
  summary = sanitizeSummary(summary);

  const tooShort = [...summary].length < minChars;
  const tooLong = [...summary].length > MAX_CHARS + 40;
  if (tooShort || tooLong || looksHardToRead(summary)) {
    const rewritten = await callOpenAI(
      key,
      `${system} いまの下書きは${tooLong ? "長すぎます" : tooShort ? "短すぎます" : "読みにくいです"}。同じ事実のまま、読み手が一度で理解できる自然な文章に書き直してください。文を途中で切らないこと。目安${hasBody ? TARGET_CHARS : 160}文字。`,
      title,
      text,
      hasBody,
    );
    if (rewritten) {
      const cleaned = sanitizeSummary(rewritten);
      if (
        !isWeakSummary(cleaned) &&
        ([...cleaned].length >= Math.min([...summary].length, minChars) ||
          !looksHardToRead(cleaned))
      ) {
        summary = cleaned;
      }
    }
  }

  return clipAtSentence(summary, MAX_CHARS);
}

function buildSummarySystemPrompt(hasBody: boolean): string {
  return [
    "あなたは日本語ニュースの編集者です。忙しい読者がスマホでさっと読める要約を書きます。",
    "最優先: 読みやすさ。最初の1文で「誰が何をしたか」が分かること。",
    "文体: です・ます調。2〜4文。一文はだいたい70字以内。広報文を一般向けニュースに言い換える。",
    "良い例: 「ゲシピは英語学習のプログリットと資本業務提携を結びました。ゲシピはeスポーツを使ったメタバース教育を手がけ、英会話コンテンツなどを提供しています。」",
    "構成: ①結論 ②金額・時期・相手などの具体 ③背景や狙い ④今後（本文にある場合のみ）。",
    hasBody
      ? `分量は${MIN_CHARS}〜${MAX_CHARS}文字（目安${TARGET_CHARS}文字）。文の途中で切らない。`
      : "分量は100〜200文字。抜粋の事実だけで書く。文の途中で切らない。",
    "言い換え: 実施いたします→行いました / 推進して参ります→進めています / 考えられます→（書かないか事実に置き換える）。",
    "ファクトチェック: 与えた文章にない固有名・金額・日付は書かない。タイトルと無関係な箇所は無視。",
    "禁止: 媒体名・サイト名・新聞名・通信社名・出典表記（〜によると、〜が報じた、PR TIMES、Yahoo!ニュース等）。",
    "禁止: 注目/観点から/報じられています/詳細は元記事/期待されます/位置付け/見込みです/（以下、「」）/本社：/代表取締役。",
    "禁止: 箇条書き、見出し、ハッシュタグ、公式URL、採用情報、画像キャプション、■、前置き、末尾の…。",
  ].join("");
}

function looksHardToRead(summary: string): boolean {
  if (
    /■|公式サイト|リクルート|募集職種|以下、|以下「|当社は|今すぐ登録|出典：|プレスリリース：|画像は|実施いたします|参ります|所存です|まいる|本社：|代表取締役|考えられます|PR TIMES|Yahoo!?ニュース|(?:新聞|通信|ロイター|Bloomberg).{0,6}によると/.test(
      summary,
    )
  ) {
    return true;
  }
  const sentences = summary.split(/(?<=[。！？])/).filter((s) => s.trim());
  if (sentences.length === 0) return true;
  if (sentences.some((s) => [...s].length > 100)) return true;
  if ((summary.match(/[（(]/g) || []).length >= 2) return true;
  if (/…|\.{2,}$/.test(summary)) return true;
  return false;
}

async function callOpenAI(
  key: string,
  system: string,
  title: string,
  text: string,
  hasBody: boolean,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
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
            { role: "system", content: system },
            {
              role: "user",
              content: [
                `タイトル: ${title}`,
                "",
                hasBody
                  ? "記事本文（これ以外の知識は使うな）:"
                  : "抜粋（これ以外の知識は使うな）:",
                text.slice(0, 7000),
              ].join("\n"),
            },
          ],
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return null;
      return content.replace(/\s+/g, " ").trim();
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

/** 本文からタイトル関連の文だけを抜き、読みやすい要約に再構成する */
function summarizeExtractive(title: string, text: string): string {
  const titleTokens = tokenize(title);
  const sentences = splitSentences(text)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 220)
    .filter((s) => !isBadSentence(s));

  const scored = sentences
    .map((sentence, i) => {
      const overlap = titleTokens.filter((t) => sentence.includes(t)).length;
      let score = overlap * 5;
      if (overlap === 0) score -= 20;
      if (i < 8) score += 1;
      if (/発表|明らか|導入|調達|提携|開設|開始|決定|出資|契約/.test(sentence)) {
        score += 2;
      }
      return { sentence, score, overlap };
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return fallbackFromTitle({ title, tags: [] });
  }

  const picked: string[] = [];
  let total = 0;
  for (const item of scored) {
    if (picked.includes(item.sentence)) continue;
    const next = total + [...item.sentence].length;
    if (picked.length > 0 && next > MAX_CHARS) continue;
    picked.push(item.sentence);
    total = next;
    if (total >= MIN_CHARS) break;
  }

  return sanitizeSummary(picked.map(ensurePeriod).join(""));
}

function summaryFromSnippet(
  article: Pick<Article, "title" | "tags" | "alertQuery">,
  snippet: string,
): string {
  if (snippet.length >= 60 && !isWeakSummary(snippet)) {
    // 途中切断の … は付けず、文単位で収める
    return sanitizeSummary(clipAtSentence(ensurePeriod(snippet), MAX_CHARS));
  }

  return fallbackFromTitle(article);
}

function fallbackFromTitle(
  article: Pick<Article, "title" | "tags"> & { alertQuery?: string },
): string {
  // 本文が取れないときの最低限: タイトルをニュース文として整える（評価締めは付けない）
  const lead = stripMediaSuffix(article.title)
    .replace(/\s*\.{2,}\s*$/, "")
    .replace(/\s*…\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[のをがにへとで]\s*$/u, "")
    .trim();
  return ensurePeriod(lead);
}

/** アラート見出しが途切れているとき、ページ見出しで補完する */
function resolveFullTitle(alertTitle: string, pageTitle: string | null): string {
  const alert = stripMediaSuffix(plain(alertTitle));
  const page = pageTitle ? stripMediaSuffix(plain(pageTitle)) : "";

  if (!page) return alert;
  if (page === alert) return alert;

  if (looksTruncated(alert) && page.length >= alert.replace(/[….]+$/, "").length) {
    if (titleOverlap(alert, page) >= 0.3) return page;
  }

  // ページ見出しの方が長く、主題が一致していれば採用
  if (page.length > alert.length + 8 && titleOverlap(alert, page) >= 0.4) {
    return page;
  }

  return alert;
}

function looksTruncated(title: string): boolean {
  const t = title.trim();
  if (/\.{2,}$|…$|･･･$/.test(t)) return true;
  if (/[\s、のとをがにへはも]$/u.test(t)) return true;
  return false;
}

function titleOverlap(a: string, b: string): number {
  const tokens = tokenize(a).filter((t) => t.length >= 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter((t) => b.includes(t)).length;
  return hits / tokens.length;
}

function sanitizeSummary(summary: string): string {
  let s = summary.replace(/\s+/g, " ").trim();
  s = s
    .replace(/https?:\/\/\S+/g, "")
    .replace(/■[^。！？]*：?\s*/g, "")
    .replace(/出典：[^。！？]*。?/g, "")
    .replace(/画像は[^。！？]*。?/g, "")
    .replace(/プレスリリース：\s*/g, "")
    .replace(/今すぐ登録\s*/g, "")
    .replace(/#[\w一-龥ぁ-んァ-ン]+/g, "")
    .replace(/（以下[^）]*）/g, "")
    .replace(/\(以下[^)]*\)/g, "")
    .replace(/（本社：[^）]*）/g, "")
    .replace(/（代表取締役[^）]*）/g, "")
    .replace(/（(?:PR[\s-]?TIMES|Yahoo!?ニュース|時事通信|共同通信|ロイター)）/gi, "")
    .replace(
      /(?:PR[\s-]?TIMES|Yahoo!?ニュース|excite(?:ニュース)?|時事通信|共同通信|ロイター|日経(?:新聞)?|朝日新聞|毎日新聞|読売新聞|産経新聞|日刊スポーツ|スポーツ報知)(?:によると|が報じた|の報道によると|の報道では)/gi,
      "",
    )
    .replace(/実施いたします/g, "行いました")
    .replace(/推進して参ります/g, "進めています")
    .replace(/して参ります/g, "していきます")
    .replace(/所存です。?/g, "")
    .replace(/ことが考えられます。?/g, "状況です。")
    .replace(/[^。！？]*(?:の観点から|観点から|観点でも)注目され(?:る|ます|ています)。?/g, "")
    .replace(/[^。！？]*注目され(?:る|ます|ています)。?/g, "")
    .replace(/[^。！？]*期待され(?:る|ます|ています)。?/g, "")
    .replace(/[^。！？]*位置付けられてい(?:る|ます)。?/g, "")
    .replace(/[^。！？]*見込みです。?/g, "")
    .replace(/詳細は元記事を[^。！？]*。?/g, "")
    .replace(/について報じられています。?/g, "")
    .replace(/…+/g, "")
    .replace(/\.{2,}/g, "")
    .replace(/。{2,}/g, "。")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** 文字数上限を超える場合は文末で切る（途中切断しない） */
function clipAtSentence(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if ([...cleaned].length <= maxChars) return cleaned;

  const sentences = splitSentences(cleaned);
  let out = "";
  for (const sentence of sentences) {
    const next = out + sentence;
    if ([...next].length > maxChars) break;
    out = next;
  }
  if (out) return sanitizeSummary(out);
  // 1文が極端に長いときだけ句点付近まで
  const chars = [...cleaned];
  const slice = chars.slice(0, maxChars).join("");
  const end = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("！"), slice.lastIndexOf("？"));
  if (end >= MIN_CHARS) return slice.slice(0, end + 1);
  return ensurePeriod(slice.replace(/[、,\s]+$/u, ""));
}

function cleanSnippet(summary: string | undefined): string {
  return sanitizeSummary(
    String(summary || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/（注目点:[^）]*）/g, " ")
      .replace(/\(注目点:[^)]*\)/g, " ")
      .replace(/注目点:\s*[^\n。]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800),
  );
}

function isWeakSummary(summary: string): boolean {
  const s = summary.trim();
  if (s.length < 40) return true;
  if (
    /詳細は元記事を|について報じられています|についての記事です|注目|の観点から|重要なステップ|位置付けられて|アクセスランキング|■|公式サイト|リクルートページ|募集職種/.test(
      s,
    )
  ) {
    return true;
  }
  if (/<[a-z]|table|td|注目点:/i.test(s)) return true;
  return false;
}

/** 要約がタイトルの主題から外れていないか（ファクトの最低ライン） */
function summaryMatchesTitle(summary: string, title: string): boolean {
  const tokens = tokenize(title).filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  const hits = tokens.filter((t) => summary.includes(t)).length;
  return hits >= Math.min(2, tokens.length) || hits / tokens.length >= 0.25;
}

function tokenize(title: string): string[] {
  const spaced = title
    .replace(/[｜|【】\[\]（）()\-－、。・\/]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !/^(お知らせ|について|まとめ|株式会社)$/.test(t));
  const latin = title.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) || [];
  const amounts =
    title.match(
      /\d+(?:[,.]\d+)?(?:億|万)?(?:円|ドル|米ドル|億円|万ドル)?/g,
    ) || [];
  return [...new Set([...spaced, ...latin, ...amounts])];
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isBadSentence(s: string): boolean {
  return /cookie|プライバシー|利用規約|copyright|関連記事|おすすめ|ログイン|会員|フォロー|シェアする|続きを読む|購入前確認|表紙|テレコン|ご利用いただき|免責事項|サービスを終了|注目|観点から|アクセスランキング|公式サイト：|今すぐ登録|ニュースまとめ|PR TIMES|Yahoo!?ニュース/i.test(
    s,
  );
}

function ensurePeriod(text: string): string {
  const t = text.trim();
  return /[。！？]$/.test(t) ? t : `${t}。`;
}

function plain(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
