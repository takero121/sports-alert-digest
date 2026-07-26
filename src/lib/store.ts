import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { Article, DigestStore, IngestPayload } from "./types";
import { parseGoogleAlertEmail } from "./parse-google-alert";
import { enrichArticle } from "./rank";
import { buildShareText } from "./share-text";
import { getRedis, STORE_KEY } from "./redis";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function createSeedStore(): DigestStore {
  const now = new Date().toISOString();
  const seedArticles: Omit<Article, "id" | "shareText">[] = [
    {
      title: "スポーツテックスタートアップがシリーズAで15億円調達　AIフォーム解析を拡大",
      summary:
        "アスリート向けAI解析を手がける企業が大型調達。チーム・クラブ向け展開を加速する見通し。（注目点: AI / 資金調達 / テクノロジー）",
      url: "https://example.com/sports-ai-series-a",
      source: "sportstech-wire.example",
      alertQuery: "スポーツ AI",
      receivedAt: now,
      score: 94,
      tags: ["AI", "資金調達", "テクノロジー"],
    },
    {
      title: "JクラブがWeb3ファンクラブを正式ローンチ　NFT会員証で観戦体験を拡張",
      summary:
        "デジタル会員証と特典連動でファンエンゲージメントを強化。国内クラブの先進事例として注目。（注目点: Web3 / ビジネス）",
      url: "https://example.com/jclub-web3",
      source: "sportsbiz.example",
      alertQuery: "スポーツ Web3",
      receivedAt: now,
      score: 88,
      tags: ["Web3", "ビジネス", "スポーツ"],
    },
    {
      title: "大手メーカーがスポーツ新規事業室を新設　ウェアラブル×ヘルスケアに注力",
      summary:
        "既存スポーツ事業に加え、計測デバイスとヘルスケア連携の新規事業を本格化。（注目点: 新規事業 / テクノロジー）",
      url: "https://example.com/new-business-unit",
      source: "innovation-daily.example",
      alertQuery: "スポーツ 新規事業",
      receivedAt: now,
      score: 82,
      tags: ["新規事業", "テクノロジー"],
    },
  ];

  const articles = seedArticles.map((a) => {
    const article: Article = {
      ...a,
      id: nanoid(10),
      shareText: "",
    };
    article.shareText = buildShareText(article);
    return article;
  });

  return {
    updatedAt: now,
    lastIngestAt: null,
    lastSlackDigestAt: null,
    articles,
  };
}

async function ensureFileStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    const seed = createSeedStore();
    await fs.writeFile(STORE_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

export async function readStore(): Promise<DigestStore> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<DigestStore>(STORE_KEY);
    if (data && Array.isArray(data.articles)) return data;
    const seed = createSeedStore();
    await redis.set(STORE_KEY, seed);
    return seed;
  }

  await ensureFileStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as DigestStore;
}

async function writeStore(store: DigestStore): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(STORE_KEY, store);
    return;
  }

  await ensureFileStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

export async function ingestPayload(payload: IngestPayload): Promise<{
  added: number;
  total: number;
  alertQuery: string;
}> {
  const store = await readStore();
  const receivedAt = payload.emailDate
    ? new Date(payload.emailDate).toISOString()
    : new Date().toISOString();

  let alertQuery = payload.alertQuery || "スポーツ イノベーション";
  let incoming = payload.articles || [];

  if (!incoming.length && (payload.html || payload.text)) {
    const parsed = parseGoogleAlertEmail({
      html: payload.html,
      text: payload.text,
      emailSubject: payload.emailSubject,
    });
    alertQuery = payload.alertQuery || parsed.alertQuery;
    incoming = parsed.articles.map((a) => ({
      title: a.title,
      url: a.url,
      snippet: a.snippet,
      source: a.source,
    }));
  }

  const existingUrls = new Set(store.articles.map((a) => normalizeUrl(a.url)));
  let added = 0;

  for (const item of incoming) {
    const url = normalizeUrl(item.url);
    if (!item.title || !url || existingUrls.has(url)) continue;

    const enriched = enrichArticle(
      {
        title: item.title,
        url,
        snippet: item.snippet || item.title,
        source: item.source || "unknown",
      },
      alertQuery,
    );

    const article: Article = {
      id: nanoid(10),
      title: item.title,
      summary: enriched.summary,
      url,
      source: item.source || "unknown",
      alertQuery,
      receivedAt,
      score: enriched.score,
      tags: enriched.tags,
      shareText: "",
      postedToXAt: null,
    };
    article.shareText = buildShareText(article);

    store.articles.unshift(article);
    existingUrls.add(url);
    added += 1;
  }

  store.articles = store.articles
    .sort((a, b) => b.score - a.score || +new Date(b.receivedAt) - +new Date(a.receivedAt))
    .slice(0, 100);

  store.updatedAt = new Date().toISOString();
  store.lastIngestAt = new Date().toISOString();
  await writeStore(store);

  return { added, total: store.articles.length, alertQuery };
}

export async function listArticles(limit = 40): Promise<DigestStore & { articles: Article[] }> {
  const store = await readStore();
  return {
    ...store,
    articles: store.articles.slice(0, limit),
  };
}

export async function getArticle(id: string): Promise<Article | null> {
  const store = await readStore();
  return store.articles.find((a) => a.id === id) ?? null;
}

export async function markPostedToX(id: string): Promise<Article | null> {
  const store = await readStore();
  const article = store.articles.find((a) => a.id === id);
  if (!article) return null;
  article.postedToXAt = new Date().toISOString();
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return article;
}

export async function markSlackDigestSent(): Promise<void> {
  const store = await readStore();
  store.lastSlackDigestAt = new Date().toISOString();
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
}

/** 直近24時間の記事をスコア順。なければ全体トップを返す */
export async function getDigestArticles(limit = 5): Promise<Article[]> {
  const store = await readStore();
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recent = store.articles.filter((a) => +new Date(a.receivedAt) >= since);
  const pool = recent.length > 0 ? recent : store.articles;
  return [...pool]
    .sort((a, b) => b.score - a.score || +new Date(b.receivedAt) - +new Date(a.receivedAt))
    .slice(0, limit);
}

export async function resetToSeed(): Promise<DigestStore> {
  const seed = createSeedStore();
  await writeStore(seed);
  return seed;
}

export function usingRedis(): boolean {
  return getRedis() !== null;
}
