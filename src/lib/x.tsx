import { TwitterApi } from "twitter-api-v2";
import { ImageResponse } from "next/og";
import type { Article } from "./types";
import { ArticleShareCard } from "./share-card";
import { X_HANDLE } from "./keywords";

function getXClient() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      "X API credentials missing. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.",
    );
  }

  return new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
}

export async function renderArticleSharePng(article: Article): Promise<Buffer> {
  const image = new ImageResponse(<ArticleShareCard article={article} />, {
    width: 1200,
    height: 675,
  });
  const ab = await image.arrayBuffer();
  return Buffer.from(ab);
}

/** @Takeroishi へ要約文＋サムネ画像を投稿 */
export async function postArticleToX(article: Article): Promise<{
  tweetId: string;
  url: string;
}> {
  const client = getXClient();
  const png = await renderArticleSharePng(article);
  const mediaId = await client.v1.uploadMedia(png, { mimeType: "image/png" });

  const text = trimTweetText(article.shareText);
  const tweet = await client.v2.tweet({
    text,
    media: { media_ids: [mediaId] as [string] },
  });

  const tweetId = tweet.data.id;
  return {
    tweetId,
    url: `https://x.com/${X_HANDLE}/status/${tweetId}`,
  };
}

export function isXConfigured(): boolean {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET,
  );
}

/** 無料枠でも落ちにくい長さに整える（URLは23文字換算を想定） */
function trimTweetText(text: string): string {
  const lines = text.split("\n");
  const urlLine = lines.find((l) => /^https?:\/\//.test(l)) || "";
  const withoutUrl = lines.filter((l) => l !== urlLine).join("\n").trim();
  const maxBody = 160;
  const body =
    [...withoutUrl].length > maxBody
      ? `${[...withoutUrl].slice(0, maxBody - 1).join("")}…`
      : withoutUrl;
  return urlLine ? `${body}\n\n${urlLine}` : body;
}
