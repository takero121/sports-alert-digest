"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import type { Article } from "@/lib/types";
import { ShareActions } from "./ShareActions";
import { buildDigestShareText } from "@/lib/share-text";

type Props = {
  initialArticles: Article[];
  initialUpdatedAt: string | null;
  initialLastIngestAt: string | null;
};

export function DigestClient({
  initialArticles,
  initialUpdatedAt,
  initialLastIngestAt,
}: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [lastIngestAt, setLastIngestAt] = useState(initialLastIngestAt);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [digestCopied, setDigestCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/articles?limit=40", { cache: "no-store" });
    const data = await res.json();
    setArticles(data.articles);
    setUpdatedAt(data.updatedAt);
    setLastIngestAt(data.lastIngestAt);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const dateLabel = useMemo(
    () => format(new Date(), "M月d日", { locale: ja }),
    [],
  );

  async function runDemoIngest() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/demo-ingest", { method: "POST" });
      const data = await res.json();
      setNotice(data.message || `${data.added}件を取り込みました`);
      await refresh();
    } catch {
      setNotice("取り込みに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function copyDigest() {
    const text = buildDigestShareText(articles, dateLabel);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setDigestCopied(true);
      window.setTimeout(() => setDigestCopied(false), 1800);
    } catch {
      window.prompt("次の文をコピーしてください", text);
    }
  }

  function openDigestX() {
    const text = buildDigestShareText(articles, dateLabel);
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="digest">
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <p className="eyebrow">スポーツイノベーション · Google アラート連動</p>
        <h1 className="brand">SIDELINE</h1>
        <p className="lede">
          スポーツ×テクノロジーのニュースを毎日集め、Slack通知とX投稿までつなぎます。
        </p>
        <div className="hero-meta">
          <span>
            最終更新:{" "}
            {updatedAt
              ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: ja })
              : "まだありません"}
          </span>
          <span>
            最終取込:{" "}
            {lastIngestAt
              ? formatDistanceToNow(new Date(lastIngestAt), { addSuffix: true, locale: ja })
              : "メール待ち"}
          </span>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
            最新を取得
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void runDemoIngest()}
          >
            {busy ? "取込中…" : "デモ取込を試す"}
          </button>
          <button type="button" className="btn btn-accent" onClick={() => void copyDigest()}>
            {digestCopied ? "一覧文をコピーした" : "一覧をコピー"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={openDigestX}>
            一覧をXで共有
          </button>
          <a className="btn btn-ghost" href="/api/share-image?mode=digest" target="_blank" rel="noreferrer">
            一覧画像
          </a>
        </div>
        {notice ? <p className="notice">{notice}</p> : null}
      </section>

      <section className="list-section">
        <div className="section-head">
          <h2>今見るべきイノベーション</h2>
          <p>スコアが高い順。Slackのボタンから @Takeroishi へワンクリック投稿できます。</p>
        </div>

        {articles.length === 0 ? (
          <div className="empty">
            まだニュースがありません。Gmail連携を設定するか、デモ取込を試してください。
          </div>
        ) : (
          <ol className="news-list">
            {articles.map((article, index) => (
              <li
                key={article.id}
                className="news-item"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <div className="rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="news-body">
                  <div className="news-top">
                    <div className="tags">
                      {article.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                      <span className="score">優先度 {article.score}</span>
                    </div>
                    <time dateTime={article.receivedAt}>
                      {format(new Date(article.receivedAt), "M/d HH:mm", { locale: ja })}
                    </time>
                  </div>
                  <h3>
                    <a href={article.url} target="_blank" rel="noreferrer">
                      {article.title}
                    </a>
                  </h3>
                  <p className="summary">{article.summary}</p>
                  <div className="meta-row">
                    <span>{article.source}</span>
                    <span>アラート: {article.alertQuery}</span>
                  </div>
                  <pre className="share-preview">{article.shareText}</pre>
                  <ShareActions article={article} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
