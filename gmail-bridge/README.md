# Gmail ブリッジ

Gmail の Google アラートを取り込み、Vercel の SIDELINE（`/api/ingest`）へ転送します。

## 推奨キーワード（Google アラート）

- `スポーツ イノベーション`
- `スポーツ テクノロジー`
- `スポーツ 新規事業`
- `スポーツ AI`
- `スポーツビジネス`
- `スポーツ Web3`

## セットアップ（約5分）

1. [Apps Script で新規プロジェクト](https://script.google.com/home/projects/create)
2. `Code.gs` の内容をすべて貼り付け
3. 関数 `syncGoogleAlerts` を実行 → 権限を許可
4. 関数 `createFiveMinuteTrigger` を実行
5. **プロジェクトの設定 → スクリプト プロパティ** に追加:
   - `INGEST_URL` = `https://<your-vercel-domain>/api/ingest`
   - `INGEST_SECRET` = Vercel の `INGEST_SECRET` と同じ値

## 動作

- 5分ごとに未読の Google アラートを取り込み
- 記事は Google ドライブの `sideline-digest-store.json` にも保存
- 新規記事だけを Vercel へ POST

## 任意: ウェブアプリ公開

Surge など静的ページから読む場合のみ:

1. **デプロイ → 新しいデプロイ → ウェブアプリ**
2. 実行ユーザー: 自分 / アクセス: 全員
3. `doGet` で一覧 JSON（JSONP対応）を返します
