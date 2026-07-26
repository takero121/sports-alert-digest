import { NextResponse } from "next/server";
import { getArticle, markPostedToX } from "@/lib/store";
import { isXConfigured, postArticleToX } from "@/lib/x";
import { X_HANDLE } from "@/lib/keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const header = request.headers.get("x-ingest-secret");
    if (header !== secret) return unauthorized();
  }

  if (!isXConfigured()) {
    return NextResponse.json({ error: "X API is not configured" }, { status: 500 });
  }

  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const article = await getArticle(body.id);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (article.postedToXAt) {
    return NextResponse.json({
      ok: true,
      alreadyPosted: true,
      message: "Already posted",
      articleId: article.id,
    });
  }

  const result = await postArticleToX(article);
  await markPostedToX(article.id);

  return NextResponse.json({
    ok: true,
    tweetId: result.tweetId,
    url: result.url,
    handle: X_HANDLE,
    articleId: article.id,
  });
}
