// lib/abi.ts
export const ERC20_ABI = [
  { "type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"value","type":"uint256"}],"outputs":[{"type":"bool"}] },
  { "type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"type":"uint8"}] },
  { "type":"function","name":"symbol","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}] },
  { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"owner","type":"address"}],"outputs":[{"type":"uint256"}] }
] as const;

export const ESCROW_ABI = [
  {
    "type":"function","name":"settleAtomic","stateMutability":"nonpayable",
    "inputs":[
      {"name":"tokenA","type":"address"},
      {"name":"tokenB","type":"address"},
      {"name":"makerA","type":"address"},
      {"name":"makerB","type":"address"},
      {"name":"amountA","type":"uint256"},
      {"name":"amountB","type":"uint256"}
    ],
    "outputs":[]
  }
] as const;

export const UNIV2_PAIR_ABI = [
  { "type":"function","name":"getReserves","stateMutability":"view","inputs":[],"outputs":[
    {"name":"_reserve0","type":"uint112"},
    {"name":"_reserve1","type":"uint112"},
    {"name":"_blockTimestampLast","type":"uint32"}
  ]},
  { "type":"function","name":"token0","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
  { "type":"function","name":"token1","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]}
] as const;

// --- EIP-2612 Permit (ERC20Permit) ---
export const ERC20_PERMIT_ABI = [
  { "type":"function","name":"nonces","stateMutability":"view","inputs":[{"name":"owner","type":"address"}],"outputs":[{"type":"uint256"}]},
  { "type":"function","name":"DOMAIN_SEPARATOR","stateMutability":"view","inputs":[],"outputs":[{"type":"bytes32"}]},
  { "type":"function","name":"name","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]},
  { "type":"function","name":"permit","stateMutability":"nonpayable","inputs":[
      {"name":"owner","type":"address"},
      {"name":"spender","type":"address"},
      {"name":"value","type":"uint256"},
      {"name":"deadline","type":"uint256"},
      {"name":"v","type":"uint8"},
      {"name":"r","type":"bytes32"},
      {"name":"s","type":"bytes32"}
    ],"outputs":[]}
] as const;
