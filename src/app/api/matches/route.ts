import { NextResponse } from "next/server";
import type { Match } from "@/types/intent";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __MATCHES__: Match[] | undefined;
}

const matchesHistory: Match[] =
  globalThis.__MATCHES__ ?? (globalThis.__MATCHES__ = []);

export async function GET() {
  return NextResponse.json(matchesHistory.slice().reverse());
}
