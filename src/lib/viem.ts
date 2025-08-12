import { createPublicClient, createWalletClient, custom, defineChain } from 'viem';

// Minimal EIP-1193 provider typing (avoid `any`)
type EthRequestArgs = { method: string; params?: unknown[] };
type Eip1193Provider = { request(args: EthRequestArgs): Promise<unknown> };

function getProvider(): Eip1193Provider {
  const g = globalThis as unknown as { ethereum?: Eip1193Provider };
  const eth = g.ethereum;
  if (!eth) throw new Error('No wallet');
  return eth;
}

async function detectChain(eth: Eip1193Provider) {
  const idHex = (await eth.request({ method: 'eth_chainId' })) as string;
  const id = parseInt(idHex, 16);
  return defineChain({
    id,
    name: `chain-${id}`,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
}

export async function getWalletClient() {
  const eth = getProvider();
  const chain = await detectChain(eth);
  // cast via `unknown` to keep strict typing without `any`
  const transport = custom(eth as unknown as { request(a: EthRequestArgs): Promise<unknown> });
  return createWalletClient({ chain, transport });
}

export async function getPublicClient() {
  const eth = getProvider();
  const chain = await detectChain(eth);
  const transport = custom(eth as unknown as { request(a: EthRequestArgs): Promise<unknown> });
  return createPublicClient({ chain, transport });
}

export async function getChainId(): Promise<number> {
  const eth = getProvider();
  const idHex = (await eth.request({ method: 'eth_chainId' })) as string;
  return parseInt(idHex, 16);
}
