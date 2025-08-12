// lib/viem.ts
import { createPublicClient, createWalletClient, custom, defineChain } from 'viem';

async function detectChain() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('No wallet');
  const idHex: string = await eth.request({ method: 'eth_chainId' });
  const id = parseInt(idHex, 16);
  return defineChain({
    id,
    name: `chain-${id}`,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
}

export async function getWalletClient() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('No wallet');
  const chain = await detectChain();
  return createWalletClient({ chain, transport: custom(eth) });
}

export async function getPublicClient() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('No wallet');
  const chain = await detectChain();
  return createPublicClient({ chain, transport: custom(eth) });
}

export async function getChainId(): Promise<number> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('No wallet');
  const idHex: string = await eth.request({ method: 'eth_chainId' });
  return parseInt(idHex, 16);
}
