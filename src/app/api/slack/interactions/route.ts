import { after, NextResponse } from "next/server";
import { getArticle, markPostedToX } from "@/lib/store";
import { replyViaResponseUrl, verifySlackRequest } from "@/lib/slack";
import { isXConfigured, postArticleToX } from "@/lib/x";
import { X_HANDLE } from "@/lib/keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SlackPayload = {
  type?: string;
  response_url?: string;
  actions?: Array<{
    action_id?: string;
    value?: string;
  }>;
};

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "SLACK_SIGNING_SECRET missing" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!verifySlackRequest(signingSecret, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload JSON" }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (action?.action_id === "open_article") {
    return new NextResponse("", { status: 200 });
  }

  if (action?.action_id !== "post_to_x" || !action.value) {
    return new NextResponse("", { status: 200 });
  }

  const articleId = action.value;
  const responseUrl = payload.response_url;

  after(async () => {
    if (!responseUrl) return;

    try {
      if (!isXConfigured()) {
        await replyViaResponseUrl(responseUrl, {
          text: "X API の環境変数が未設定です。Vercel の X_API_* を確認してください。",
        });
        return;
      }

      const article = await getArticle(articleId);
      if (!article) {
        await replyViaResponseUrl(responseUrl, {
          text: "記事が見つかりませんでした（期限切れの可能性）。最新のダイジェストを送り直してください。",
        });
        return;
      }

      if (article.postedToXAt) {
        await replyViaResponseUrl(responseUrl, {
          text: `すでに投稿済みです: ${article.title}`,
        });
        return;
      }

      await replyViaResponseUrl(responseUrl, {
        text: `⏳ @${X_HANDLE} へ投稿中…「${article.title}」`,
      });

      const result = await postArticleToX(article);
      await markPostedToX(article.id);

      await replyViaResponseUrl(responseUrl, {
        text: `✅ @${X_HANDLE} に投稿しました\n${result.url}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      await replyViaResponseUrl(responseUrl, {
        text: `❌ 投稿に失敗しました: ${message}`,
      });
    }
  });

  return NextResponse.json({
    response_type: "ephemeral",
    text: `⏳ @${X_HANDLE} へ投稿を開始しました…`,
  });
}
