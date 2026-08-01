# Gmail ブリッジ（スポーツニュースダイジェスト）

毎朝9時に Google アラートを取り込み、Vercel へ転送して Slack 全件通知します。

## Google アラートキーワード

「スポーツ」× 次のテーマ:

- `スポーツ イノベーション`
- `スポーツ AI`
- `スポーツ テクノロジー`
- `スポーツ 新規事業`
- `スポーツ ブロックチェーン`
- `スポーツ マーケティング`

## 初回セットアップ

1. [Apps Script 新規プロジェクト](https://script.google.com/home/projects/create)
2. `Code.gs` をすべて貼る
3. `setupScriptProperties` 内の `YOUR_INGEST_SECRET` / `YOUR_CRON_SECRET` を Vercel と同じ値に書き換えて実行
4. `syncGoogleAlerts` を実行（権限許可）
5. `createMorningTrigger` を実行

## 今すぐ試す

`morningDigest` を実行 → 取込＋Slack全件通知
