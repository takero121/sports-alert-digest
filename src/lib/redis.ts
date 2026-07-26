import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

/** Vercel 向け永続化。未設定なら null（ローカルはファイル保存） */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    client = null;
    return client;
  }

  client = new Redis({ url, token });
  return client;
}

export const STORE_KEY = "sideline:store";
