# スポーツニュースダイジェスト

**スポーツ**を軸に、イノベーション / AI / テクノロジー / 新規事業 / ブロックチェーン / マーケティングのニュースを毎日集め、Slackへ全件通知し、ワンクリックで **X (@Takeroishi)** に要約＋サムネ画像を投稿するサービスです。

```text
Googleアラート → Gmail (Apps Script) → Vercel (/api/ingest)
                                         ↓
                              スコアリング・要約保存 (Redis)
                                         ↓
                              毎朝9時 → Slackへ全件通知
                                         ↓
                         [Xに投稿] ボタン → 画像付きで @Takeroishi 投稿
```

## すぐ試す（ローカル）

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開き、「デモ取込を試す」で流れを確認できます。

## Google アラート（キーワード）

「スポーツ」と次の語を掛け合わせたアラートを作成し、届先を Gmail にしてください。

1. `スポーツ イノベーション`
2. `スポーツ AI`
3. `スポーツ テクノロジー`
4. `スポーツ 新規事業`
5. `スポーツ ブロックチェーン`
6. `スポーツ マーケティング`

作成: [Google アラート](https://www.google.com/alerts)

## Vercel デプロイ

公開URL例: https://sports-alert-digest.vercel.app

環境変数は `.env.example` を参照。

| 変数 | 用途 |
|------|------|
| `INGEST_SECRET` | Apps Script → `/api/ingest` 認証 |
| `CRON_SECRET` | ダイジェスト通知 API 認証 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 記事の永続化（本番必須） |
| `SLACK_BOT_TOKEN` | Slack Bot Token |
| `SLACK_SIGNING_SECRET` | インタラクション署名検証 |
| `SLACK_CHANNEL_ID` | 通知先チャンネル |
| `X_API_KEY` / `X_API_SECRET` | X アプリの API Key |
| `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | **@Takeroishi** のユーザートークン |

## Slack

- 毎朝、取得ニュースを最大 **約30件** 通知（件数が多い場合は分割送信）
- 各記事は **見出し・要約全文・ハッシュタグ** を記載
- 「X (@Takeroishi) に投稿」でサムネ付き投稿（画像にもサービス名を表示）

Interactivity Request URL:

```text
https://<your-vercel-domain>/api/slack/interactions
```

## Gmail 連携

詳細は `gmail-bridge/README.md`。

スクリプトプロパティ:

- `INGEST_URL` = `https://<domain>/api/ingest`
- `INGEST_SECRET` = Vercel と同じ
- `DIGEST_URL` = `https://<domain>/api/cron/digest`
- `CRON_SECRET` = Vercel と同じ

## API

| エンドポイント | 内容 |
|----------------|------|
| `POST /api/ingest` | アラート取込 |
| `GET /api/articles` | 一覧 |
| `GET /api/share-image?id=` | 記事サムネ |
| `GET /api/cron/digest` | Slack 全件通知 |
| `POST /api/slack/interactions` | Slack ボタン（X投稿） |
| `POST /api/post-x` | X 投稿 |

## 注意

- 要約はキーワードベースの簡易版です
- 外部公開時は `INGEST_SECRET` / `CRON_SECRET` を設定してください
- 秘密鍵を Git にコミットしないでください
