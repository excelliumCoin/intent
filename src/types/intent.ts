export type Asset = { chain: string; symbol: string };

export type Intent = {
  id: string;                     // uuid
  createdAt: string;              // ISO
  maker: string;                  // address (after signature verify)
  give: { asset: Asset; amountMax: number };
  get:  { asset: Asset; amountMin: number };
  constraints?: {
    deadline?: string;            // ISO
    priceLimit?: number;          // e.g., USDC/ETH <= priceLimit
  };
  signature?: string | null;      // EIP-191 personal_sign
};

export type Match = {
  intentA: Intent;
  intentB: Intent;
  clearingPrice?: number;
  createdAt: string;
};