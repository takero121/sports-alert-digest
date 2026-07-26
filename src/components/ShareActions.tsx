"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";

type Props = {
  article: Article;
};

export function ShareActions({ article }: Props) {
  const [copied, setCopied] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  const shareImageUrl = `/api/share-image?id=${article.id}`;
  const alreadyPosted = Boolean(article.postedToXAt);

  async function copyText() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(article.shareText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = article.shareText;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("次の文をコピーしてください", article.shareText);
    }
  }

  async function downloadImage() {
    const res = await fetch(shareImageUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sideline-${article.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setImageReady(true);
    window.setTimeout(() => setImageReady(false), 1800);
  }

  function openX() {
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(article.shareText)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="share-actions">
      <button type="button" className="btn btn-primary" onClick={copyText}>
        {copied ? "コピーした" : "要約文をコピー"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={downloadImage}>
        {imageReady ? "画像を保存した" : "共有画像を保存"}
      </button>
      <button type="button" className="btn btn-accent" onClick={openX}>
        X投稿画面を開く
      </button>
      <a className="preview-link" href={shareImageUrl} target="_blank" rel="noreferrer">
        画像プレビュー
      </a>
      {alreadyPosted ? <span className="preview-link">X投稿済み</span> : null}
    </div>
  );
}
