import { NextResponse } from "next/server";
import { ingestPayload } from "@/lib/store";

/** ローカル確認用: スポーツイノベーション系のアラート風 HTML を取り込む */
export async function POST() {
  const html = `
    <html><body>
      <h3>スポーツ テクノロジー</h3>
      <div>
        <a href="https://www.google.com/url?url=https://example.com/ai-coaching">
          AIコーチングアプリがプロチーム導入を拡大　映像解析を自動化
        </a>
        <div>トレーニング映像からフォーム改善点を即時提示。スポーツテックの実装事例として注目。</div>
        <span>sportstech-lab.example</span>
      </div>
      <div>
        <a href="https://www.google.com/url?url=https://example.com/web3-ticketing">
          スポーツビジネス×Web3　電子チケットにNFT特典を標準搭載へ
        </a>
        <div>新規事業としてファンクラブ連携を強化。二次流通と特典設計が焦点。</div>
        <span>biz-innovation.example</span>
      </div>
    </body></html>
  `;

  const result = await ingestPayload({
    emailSubject: "Google アラート - スポーツ テクノロジー",
    emailDate: new Date().toISOString(),
    html,
  });

  return NextResponse.json({ ok: true, ...result });
}
