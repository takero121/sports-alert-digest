import crypto from "crypto";
import type { Article } from "./types";
import { SERVICE_NAME, X_HANDLE } from "./keywords";
import { buildSlackArticleText } from "./share-text";

/** Slack Block Kit は1メッセージ最大50ブロック。記事ごとに約3ブロック使う */
const ARTICLES_PER_MESSAGE = 12;

export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
}

export function verifySlackRequest(
  signingSecret: string,
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
): boolean {
  if (!signature || !timestamp) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (Number.isNaN(age) || age > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `v0=${digest}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function articleBlocks(article: Article, index: number) {
  const postText = buildSlackArticleText(article);
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${index + 1}.*\n${postText}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "post_to_x",
          text: { type: "plain_text", text: `X (@${X_HANDLE}) に投稿`, emoji: true },
          style: "primary",
          value: article.id,
        },
        {
          type: "button",
          action_id: "open_article",
          text: { type: "plain_text", text: "記事を開く", emoji: true },
          url: article.url,
        },
      ],
    },
    { type: "divider" },
  ];
}

export function buildDigestBlocks(
  articles: Article[],
  dateLabel: string,
  options?: {
    part?: number;
    totalParts?: number;
    startIndex?: number;
    totalCount?: number;
  },
) {
  const part = options?.part ?? 1;
  const totalParts = options?.totalParts ?? 1;
  const startIndex = options?.startIndex ?? 0;
  const totalCount = options?.totalCount ?? articles.length;
  const partLabel = totalParts > 1 ? `（${part}/${totalParts}）` : "";

  const intro =
    totalParts > 1
      ? part === 1
        ? `取得ニュース全 *${totalCount}* 件を通知します（${part}/${totalParts}）。ボタン1つで *@${X_HANDLE}* に投稿できます。`
        : `続き（${part}/${totalParts}） / 全 ${totalCount} 件`
      : `取得ニュース *${totalCount}* 件を全件通知。ボタン1つで *@${X_HANDLE}* に要約＋サムネを投稿できます。`;

  const body = articles.flatMap((article, i) => articleBlocks(article, startIndex + i));

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${SERVICE_NAME} ${dateLabel}${partLabel}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: intro },
    },
    { type: "divider" },
    ...body,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `投稿には X API 連携が必要です · ${SERVICE_NAME}`,
        },
      ],
    },
  ];
}

export async function sendDigestToSlack(articles: Article[], dateLabel: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    throw new Error("SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are required");
  }

  const chunks: Article[][] = [];
  for (let i = 0; i < articles.length; i += ARTICLES_PER_MESSAGE) {
    chunks.push(articles.slice(i, i + ARTICLES_PER_MESSAGE));
  }

  const totalParts = Math.max(chunks.length, 1);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const startIndex = i * ARTICLES_PER_MESSAGE;
    const blocks = buildDigestBlocks(chunk, dateLabel, {
      part: i + 1,
      totalParts,
      startIndex,
      totalCount: articles.length,
    });
    const text = `${SERVICE_NAME} ${dateLabel}: ${articles.length}件（${i + 1}/${totalParts}）`;

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text, blocks }),
    });

    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack chat.postMessage failed: ${data.error || "unknown"}`);
    }
  }
}

export async function replyViaResponseUrl(
  responseUrl: string,
  message: { text: string; replaceOriginal?: boolean },
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      replace_original: message.replaceOriginal ?? false,
      response_type: "ephemeral",
      text: message.text,
    }),
  });
}
