import { NextResponse } from "next/server";
import { ingestPayload } from "@/lib/store";

/** ローカル確認用: スポーツ×各テーマのアラート風 HTML を取り込む */
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
        <a href="https://www.google.com/url?url=https://example.com/sports-marketing">
          スポーツマーケティング最前線　データ活用でファン体験を設計
        </a>
        <div>観戦データとSNS分析を組み合わせ、クラブの新規事業にもつながる取り組み。</div>
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
