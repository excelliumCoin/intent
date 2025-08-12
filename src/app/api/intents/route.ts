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

type BodyGiveGet = Intent["give"] | Intent["get"];
type Payload = ReturnType<typeof buildSignPayload>;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;

  // basic shape checks (no `any`)
  if (
    typeof body.signature !== "string" ||
    typeof body.payload !== "object" ||
    body.payload === null ||
    typeof body.give !== "object" ||
    body.give === null ||
    typeof body.get !== "object" ||
    body.get === null
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const payloadObj = body.payload as Record<string, unknown>;

  const rebuilt = buildSignPayload({
    maker: String(payloadObj.maker ?? ""),
    give: body.give as BodyGiveGet as Intent["give"],
    get: body.get as BodyGiveGet as Intent["get"],
    constraints: payloadObj.constraints as Intent["constraints"] | undefined,
    nonce: String(payloadObj.nonce ?? ""),
  });
  const message = toMessage(rebuilt);

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({
      message,
      signature: body.signature as `0x${string}`,
    });
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const makerFromPayload = String(payloadObj.maker ?? "");
  if (recovered.toLowerCase() !== makerFromPayload.toLowerCase()) {
    return NextResponse.json({ error: "Signer mismatch" }, { status: 400 });
  }

  const intent: Intent = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    maker: recovered,
    give: rebuilt.give,
    get: rebuilt.get,
    constraints: rebuilt.constraints,
    signature: body.signature as string,
  };

  pool.push(intent);
  return NextResponse.json(intent, { status: 201 });
}
