import crypto from "crypto";
import type { Article } from "./types";
import { X_HANDLE } from "./keywords";

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
  const tags = article.tags.length ? article.tags.join(" · ") : "スポーツイノベーション";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${index + 1}. <${article.url}|${article.title}>*\n${article.summary}\n_${tags}_ · 優先度 ${article.score}`,
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

export function buildDigestBlocks(articles: Article[], dateLabel: string) {
  const header = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `SIDELINE ${dateLabel} スポーツイノベーション`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `今日の注目ニュース *${articles.length}* 件。ボタン1つで *@${X_HANDLE}* に要約＋サムネを投稿できます。`,
      },
    },
    { type: "divider" },
  ];

  const body = articles.flatMap((article, i) => articleBlocks(article, i));

  return [
    ...header,
    ...body,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "投稿には X API 連携が必要です · SIDELINE",
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

  const blocks = buildDigestBlocks(articles, dateLabel);
  const text = `SIDELINE ${dateLabel}: スポーツイノベーション ${articles.length}件`;

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
