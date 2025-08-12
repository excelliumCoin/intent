import { NextResponse } from "next/server";
import { pool } from "@/lib/pool";
import type { Intent, Match } from "@/types/intent";

export const runtime = "nodejs";

// global history (memory)
const gg = globalThis as any;
gg.__MATCHES__ = gg.__MATCHES__ || [];
const matchesHistory: Match[] = gg.__MATCHES__;

function compatible(a: Intent, b: Intent) {
  const assetCross =
    a.give.asset.symbol === b.get.asset.symbol &&
    a.get.asset.symbol === b.give.asset.symbol &&
    a.give.asset.chain === b.get.asset.chain &&
    a.get.asset.chain === b.give.asset.chain;
  if (!assetCross) return false;

  const priceA = a.give.amountMax / a.get.amountMin;
  const priceB = b.give.amountMax / b.get.amountMin;
  const priceOk =
    (!a.constraints?.priceLimit || priceA <= a.constraints.priceLimit) &&
    (!b.constraints?.priceLimit || priceB <= b.constraints.priceLimit);

  const now = Date.now();
  const notExpired = [a, b].every(x =>
    !x.constraints?.deadline || Date.parse(x.constraints.deadline) > now
  );
  return priceOk && notExpired;
}

export async function POST() {
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i];
      const B = pool[j];
      if (compatible(A, B)) {
        const match: Match = {
          intentA: A,
          intentB: B,
          clearingPrice: (A.give.amountMax / A.get.amountMin + B.give.amountMax / B.get.amountMin) / 2,
          createdAt: new Date().toISOString(),
        };
        pool.splice(j, 1);
        pool.splice(i, 1);
        matchesHistory.push(match);
        return NextResponse.json(match);
      }
    }
  }
  return NextResponse.json({ status: "no-match" });
}
