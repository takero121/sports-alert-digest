import { NextResponse } from "next/server";
import { listArticles } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "40");
  const store = await listArticles(Number.isFinite(limit) ? limit : 40);

  return NextResponse.json({
    updatedAt: store.updatedAt,
    lastIngestAt: store.lastIngestAt,
    count: store.articles.length,
    articles: store.articles,
  });
}
