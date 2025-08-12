import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { pool } from "@/lib/pool";
import type { Intent } from "@/types/intent";
import { recoverMessageAddress } from "viem";
import { buildSignPayload, toMessage } from "@/lib/signing";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(pool);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.give || !body?.get || !body?.signature || !body?.payload) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const rebuilt = buildSignPayload({
    maker: String(body.payload.maker),
    give: body.payload.give,
    get: body.payload.get,
    constraints: body.payload.constraints,
    nonce: String(body.payload.nonce),
  });
  const message = toMessage(rebuilt);

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({ message, signature: body.signature });
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (recovered.toLowerCase() !== String(body.payload.
