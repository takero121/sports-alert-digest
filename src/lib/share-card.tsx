import type { Article } from "./types";
import { SERVICE_NAME } from "./keywords";

export function ArticleShareCard({ article }: { article: Article }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(150deg, #101912 0%, #1c3326 50%, #0d1c14 100%)",
        color: "#f4f7f2",
        padding: "56px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 2, color: "#b8f34a" }}>
          {SERVICE_NAME}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#9db5a6" }}>{article.source}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 22, color: "#b8f34a" }}>今日の注目</div>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 700, lineHeight: 1.2 }}>
          {article.title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#c5d4cb",
            lineHeight: 1.4,
            maxWidth: 1000,
          }}
        >
          {article.summary.length > 90 ? `${article.summary.slice(0, 87)}…` : article.summary}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {article.tags.slice(0, 3).map((tag) => (
          <div
            key={tag}
            style={{
              display: "flex",
              fontSize: 20,
              padding: "8px 16px",
              border: "1px solid #3d5c4a",
              color: "#d7e6db",
            }}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DigestShareCard({ articles }: { articles: Article[] }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(145deg, #0b1f17 0%, #163528 45%, #0e2a1c 100%)",
        color: "#f4f7f2",
        padding: "56px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 2, color: "#b8f34a" }}>
          {SERVICE_NAME}
        </div>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 700, lineHeight: 1.15 }}>
          今日のスポーツニュース
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {articles.map((a, i) => (
          <div key={a.id} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ display: "flex", fontSize: 28, color: "#b8f34a", width: 36 }}>
              {i + 1}
            </div>
            <div style={{ display: "flex", fontSize: 28, lineHeight: 1.3, maxWidth: 980 }}>
              {a.title}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#9db5a6" }}>
        毎朝の{SERVICE_NAME}
      </div>
    </div>
  );
}
