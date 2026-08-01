export type Article = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  alertQuery: string;
  receivedAt: string;
  score: number;
  tags: string[];
  shareText: string;
  postedToXAt?: string | null;
  /** 元記事本文を読んで作った要約なら true */
  summarizedFromArticle?: boolean;
};

export type DigestStore = {
  updatedAt: string | null;
  lastIngestAt: string | null;
  lastSlackDigestAt?: string | null;
  articles: Article[];
};

export type IngestPayload = {
  emailSubject?: string;
  emailDate?: string;
  alertQuery?: string;
  html?: string;
  text?: string;
  articles?: Array<{
    title: string;
    url: string;
    snippet?: string;
    source?: string;
  }>;
};
