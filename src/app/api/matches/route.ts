import { NextResponse } from "next/server";
import type { Match } from "@/types/intent";

const gg = globalThis as any;
gg.__MATCHES__ = gg.__MATCHES__ || [];
const matchesHistory: Match[] = gg.__MATCHES__;

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(matchesHistory.slice().reverse());
}
