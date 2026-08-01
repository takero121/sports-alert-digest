import { DigestClient } from "@/components/DigestClient";
import { listArticles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = await listArticles(40);

  return (
    <main>
      <DigestClient
        initialArticles={store.articles}
        initialUpdatedAt={store.updatedAt}
        initialLastIngestAt={store.lastIngestAt}
      />
      <footer className="site-footer">
        スポーツニュースダイジェスト — 毎日のSlack通知とX投稿に対応。セットアップは README を参照。
      </footer>
    </main>
  );
}
