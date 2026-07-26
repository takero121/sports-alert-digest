# SIDELINE

**スポーツイノベーション**のニュースを毎日集め、Slackへ通知し、ワンクリックで **X (@Takeroishi)** に要約＋サムネ画像を投稿するサービスです。

```text
Googleアラート → Gmail (Apps Script) → Vercel (/api/ingest)
                                         ↓
                              スコアリング・要約保存 (Redis)
                                         ↓
                              毎日 9:00 JST Cron → Slack通知
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

次のキーワードでアラートを作成し、Gmailに届くようにしてください。

1. `スポーツ イノベーション`
2. `スポーツ テクノロジー`
3. `スポーツ 新規事業`
4. `スポーツ AI`
5. `スポーツビジネス`
6. `スポーツ Web3`

作成: [Google アラート](https://www.google.com/alerts)

## Vercel デプロイ

1. このリポジトリを Vercel に Import
2. Upstash Redis（または Vercel KV）を作成し、環境変数を設定
3. Slack / X の環境変数を設定（下記）
4. デプロイ後、Cron `0 0 * * *`（毎日 9:00 JST）が `/api/cron/digest` を叩きます

### 環境変数

`.env.example` を参照。最低限:

| 変数 | 用途 |
|------|------|
| `INGEST_SECRET` | Apps Script → `/api/ingest` 認証 |
| `CRON_SECRET` | Vercel Cron 認証 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 記事の永続化（本番必須） |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | インタラクション署名検証 |
| `SLACK_CHANNEL_ID` | 通知先チャンネル |
| `X_API_KEY` / `X_API_SECRET` | X アプリの API Key |
| `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | **@Takeroishi** のユーザートークン |

## Slack アプリ設定

1. [api.slack.com/apps](https://api.slack.com/apps) で新規アプリ作成
2. **OAuth & Permissions** で Bot Token Scopes に `chat:write` を追加
3. ワークスペースへ Install → `xoxb-...` を `SLACK_BOT_TOKEN` に
4. 通知したいチャンネルに Bot を `/invite`
5. チャンネル ID を `SLACK_CHANNEL_ID` に
6. **Basic Information** の Signing Secret を `SLACK_SIGNING_SECRET` に
7. **Interactivity & Shortcuts** を On  
   Request URL: `https://<your-vercel-domain>/api/slack/interactions`

手動で今すぐ通知を試す:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/digest
```

## X (@Takeroishi) API 設定

1. [X Developer Portal](https://developer.x.com/) でプロジェクト／アプリ作成
2. App permissions を **Read and Write** に
3. Keys and tokens で API Key / Secret を発行 → `X_API_KEY` / `X_API_SECRET`
4. 同じ画面で **Access Token and Secret** を @Takeroishi 用に発行（Read and Write）  
   → `X_ACCESS_TOKEN` / `X_ACCESS_SECRET`
5. メディアアップロードのため、従来の v1.1 メディア API が使える権限になっていることを確認

Slack の「X (@Takeroishi) に投稿」を押すと、要約文＋1200×675 サムネで投稿されます。

## Gmail 連携（取込）

Apps Script が Gmail の Google アラートを読み、Vercel の `/api/ingest` に送ります。

1. [Apps Script で新規プロジェクト](https://script.google.com/home/projects/create)
2. `gmail-bridge/Code.gs` を貼る
3. `syncGoogleAlerts` を実行 → 権限を許可
4. `createFiveMinuteTrigger` を実行
5. スクリプトプロパティ:
   - `INGEST_URL` = `https://<your-vercel-domain>/api/ingest`
   - `INGEST_SECRET` = Vercel と同じ値

詳細は `gmail-bridge/README.md`。

## API

| エンドポイント | 内容 |
|----------------|------|
| `POST /api/ingest` | アラート取込 |
| `GET /api/articles` | 一覧 |
| `GET /api/share-image?id=` | 記事サムネ |
| `GET /api/cron/digest` | 日次 Slack 通知（Cron） |
| `POST /api/slack/interactions` | Slack ボタン（X投稿） |
| `POST /api/post-x` | Web UI からの X 投稿 |

## ローカルと本番のデータの違い

- **ローカル**: `data/store.json`
- **Vercel**: Upstash Redis / Vercel KV（ファイルは永続化されません）

## 注意

- 要約はキーワードベースの簡易版です（AI / Web3 / 新規事業などを優先）
- 外部公開時は必ず `INGEST_SECRET` と `CRON_SECRET` を設定してください
- X の投稿制限・アプリ審査状況によっては投稿 API が使えない場合があります
