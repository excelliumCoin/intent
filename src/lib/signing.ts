import type { Intent } from "@/types/intent";

// Draft shape (client-side before id/createdAt/signature exist)
export type IntentDraft = Pick<Intent, "maker" | "give" | "get" | "constraints">;

export function buildSignPayload(draft: IntentDraft & { nonce: string }) {
  return {
    v: 1,
    maker: draft.maker.toLowerCase(),
    give: draft.give,
    get: draft.get,
    constraints: draft.constraints ?? {},
    nonce: draft.nonce,
  } as const;
}

export function toMessage(payload: ReturnType<typeof buildSignPayload>) {
  return [
    `Intent v${payload.v}`,
    `maker:${payload.maker}`,
    `give:${payload.give.amountMax} ${payload.give.asset.symbol} @ ${payload.give.asset.chain}`,
    `get:${payload.get.amountMin} ${payload.get.asset.symbol} @ ${payload.get.asset.chain}`,
    `priceLimit:${payload.constraints?.priceLimit ?? "-"}`,
    `deadline:${payload.constraints?.deadline ?? "-"}`,
    `nonce:${payload.nonce}`,
  ].join("\n");

}