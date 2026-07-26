import { ImageResponse } from "next/og";
import { getArticle, listArticles } from "@/lib/store";
import { ArticleShareCard, DigestShareCard } from "@/lib/share-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const mode = searchParams.get("mode") || "article";

  if (mode === "digest") {
    const store = await listArticles(3);
    const top = store.articles.slice(0, 3);
    return new ImageResponse(<DigestShareCard articles={top} />, {
      width: 1200,
      height: 675,
    });
  }

  const article = id ? await getArticle(id) : null;
  if (!article) {
    return new Response("Not found", { status: 404 });
  }

  return new ImageResponse(<ArticleShareCard article={article} />, {
    width: 1200,
    height: 675,
  });
}
