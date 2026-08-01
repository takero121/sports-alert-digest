import { NextResponse } from "next/server";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  getDigestArticles,
  markSlackDigestSent,
  saveArticleSummaries,
  usingRedis,
} from "@/lib/store";
import { isSlackConfigured, sendDigestToSlack } from "@/lib/slack";
import { enrichArticlesWithSourceSummaries } from "@/lib/summarize-article";
import { buildShareText } from "@/lib/share-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function assertCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) return unauthorized();

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: "Slack is not configured (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID)" },
      { status: 500 },
    );
  }

  if (process.env.VERCEL && !usingRedis()) {
    return NextResponse.json(
      {
        error:
          "Redis/KV is required on Vercel. Set KV_REST_API_URL and KV_REST_API_TOKEN (or Upstash equivalents).",
      },
      { status: 500 },
    );
  }

  const baseArticles = await getDigestArticles();
  if (baseArticles.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "No articles to send" });
  }

  // 元記事を取得して要約してから Slack へ投稿
  const articles = await enrichArticlesWithSourceSummaries(baseArticles);
  for (const article of articles) {
    article.shareText = buildShareText(article);
  }

  await saveArticleSummaries(
    articles.map((a) => ({
      id: a.id,
      summary: a.summary,
      summarizedFromArticle: a.summarizedFromArticle,
    })),
  );

  const dateLabel = format(new Date(), "M月d日", { locale: ja });
  await sendDigestToSlack(articles, dateLabel);
  await markSlackDigestSent();

  const fromArticle = articles.filter((a) => a.summarizedFromArticle).length;

  return NextResponse.json({
    ok: true,
    sent: true,
    count: articles.length,
    summarizedFromArticle: fromArticle,
    ids: articles.map((a) => a.id),
  });
}
