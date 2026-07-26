import { NextResponse } from "next/server";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { getDigestArticles, markSlackDigestSent, usingRedis } from "@/lib/store";
import { isSlackConfigured, sendDigestToSlack } from "@/lib/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const articles = await getDigestArticles(5);
  if (articles.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "No articles to send" });
  }

  const dateLabel = format(new Date(), "M月d日", { locale: ja });
  await sendDigestToSlack(articles, dateLabel);
  await markSlackDigestSent();

  return NextResponse.json({
    ok: true,
    sent: true,
    count: articles.length,
    ids: articles.map((a) => a.id),
  });
}
