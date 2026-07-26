import type { Metadata } from "next";
import { Bebas_Neue, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "SIDELINE | スポーツイノベーション速報",
  description:
    "スポーツイノベーションのニュースを毎日取得し、Slack通知とX（@Takeroishi）へのワンクリック投稿までつなぐダイジェスト。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
