import { NextResponse } from "next/server";
import { ingestPayload } from "@/lib/store";
import type { IngestPayload } from "@/lib/types";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const header = request.headers.get("x-ingest-secret");
    if (header !== secret) return unauthorized();
  }

  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.html && !payload.text && !payload.articles?.length) {
    return NextResponse.json(
      { error: "html, text, or articles is required" },
      { status: 400 },
    );
  }

  const result = await ingestPayload(payload);
  return NextResponse.json({
    ok: true,
    ...result,
    message:
      result.added > 0
        ? `${result.added}件のニュースを取り込みました`
        : "新規ニュースはありませんでした（重複の可能性）",
  });
}
