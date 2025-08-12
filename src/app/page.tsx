'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react';
import { buildSignPayload, toMessage } from '@/lib/signing';
import { getPublicClient, getWalletClient, getChainId } from '@/lib/viem';
import {
  ERC20_ABI,
  ESCROW_ABI,
  UNIV2_PAIR_ABI,
  ERC20_PERMIT_ABI,
} from '@/lib/abi';
import { parseUnits } from 'viem';

type Asset = { chain: string; symbol: string };

type Intent = {
  id: string;
  createdAt: string;
  maker: string;
  give: { asset: Asset; amountMax: number };
  get: { asset: Asset; amountMin: number };
  constraints?: { deadline?: string; priceLimit?: number };
  signature?: string | null;
};

type Match = {
  intentA: Intent;
  intentB: Intent;
  clearingPrice?: number;
  createdAt: string;
};

// Minimal EIP-1193 provider typing (avoid `any`)
type EthRequestArgs = { method: string; params?: unknown[] };
type Eip1193Provider = { request(args: EthRequestArgs): Promise<unknown> };
type WithEthereum = Window & { ethereum?: Eip1193Provider };

export default function Page() {
  // ---------- INTENT FORM ----------
  const [account, setAccount] = useState<string | null>(null);
  const [giveSymbol, setGiveSymbol] = useState('USDC');
  const [giveChain, setGiveChain] = useState('Ethereum');
  const [giveAmount, setGiveAmount] = useState<number | string>(2000);
  const [getSymbol, setGetSymbol] = useState('ETH');
  const [getChain, setGetChain] = useState('Ethereum');
  const [getAmount, setGetAmount] = useState<number | string>(1);
  const [priceLimit, setPriceLimit] = useState<number | ''>('');
  const [deadline, setDeadline] = useState<string>('');

  const [intents, setIntents] = useState<Intent[]>([]);
  const [lastMatch, setLastMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);

  // ---------- SETTLEMENT FORM ----------
  const initialEscrow = useMemo(
    () => (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? ''),
    []
  );
  const [escrowAddress, setEscrowAddress] = useState<string>(initialEscrow);
  const [tokenA, setTokenA] = useState<string>(''); // ERC-20 address
  const [tokenB, setTokenB] = useState<string>(''); // ERC-20 address
  const [amountAUi, setAmountAUi] = useState<string>(''); // human format
  const [amountBUi, setAmountBUi] = useState<string>(''); // human format

  // Price oracle & readiness
  const [pairAddress, setPairAddress] = useState<string>(''); // Uniswap V2 pair
  const [refPrice, setRefPrice] = useState<string>(''); // tokenA/tokenB
  const [priceOk, setPriceOk] = useState<boolean | null>(null);
  const [allowAok, setAllowAok] = useState<boolean | null>(null);
  const [allowBok, setAllowBok] = useState<boolean | null>(null);

  // Permit settings
  const [permitDeadlineMin, setPermitDeadlineMin] = useState<number>(20);

  // History
  const [matches, setMatches] = useState<Match[]>([]);

  // ---------- WALLET ----------
  async function connect() {
    const eth = (window as WithEthereum).ethereum;
    if (!eth) {
      alert('No wallet found');
      return;
    }
    const accs = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    setAccount(accs[0] ?? null);
  }

  // ---------- API ----------
  async function loadIntents() {
    const res = await fetch('/api/intents');
    setIntents(await res.json());
  }
  async function fetchMatches() {
    const res = await fetch('/api/matches');
    setMatches(await res.json());
  }
  useEffect(() => {
    loadIntents();
  }, []);
  useEffect(() => {
    fetchMatches();
  }, []);

  // ---------- UI HELPERS ----------
  const input = (props: InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 10,
        background: '#0f1733',
        border: '1px solid #1b2850',
        color: 'white',
      }}
    />
  );
  const label = (t: string) => (
    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t}</div>
  );

  // ---------- INTENT POST (SIGNED) ----------
  async function postIntent() {
    setBusy(true);
    try {
      const eth = (window as WithEthereum).ethereum;
      if (!eth) throw new Error('No wallet');
      const from =
        account ??
        ((await eth.request({ method: 'eth_requestAccounts' })) as string[])[0];

      const draft = {
        maker: from as string,
        give: {
          asset: { chain: giveChain, symbol: giveSymbol },
          amountMax: Number(giveAmount),
        },
        get: {
          asset: { chain: getChain, symbol: getSymbol },
          amountMin: Number(getAmount),
        },
        constraints: {
          priceLimit: priceLimit === '' ? undefined : Number(priceLimit),
          deadline: deadline || undefined,
        },
      } as const;

      const nonce = new Date().toISOString();
      const payload = buildSignPayload({ ...draft, nonce });
      const message = toMessage(payload);

      const signature = await eth.request({
        method: 'personal_sign',
        params: [message, from],
      });

      const res = await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, signature, payload }),
      });
      if (!res.ok) throw new Error('failed');
      await loadIntents();
    } finally {
      setBusy(false);
    }
  }

  // ---------- SOLVER ----------
  async function solve() {
    setBusy(true);
    try {
      const res = await fetch('/api/solve', { method: 'POST' });
      const data = (await res.json()) as Match | { status: string };
      const isMatch = (data as Match).intentA !== undefined;
      setLastMatch(isMatch ? (data as Match) : null);
      await loadIntents();
      await fetchMatches();

      if (isMatch) {
        const m = data as Match;
        setAmountAUi(String(m.intentA.give.amountMax));
        setAmountBUi(String(m.intentB.give.amountMax));
      }
    } finally {
      setBusy(false);
    }
  }

  // ---------- SETTLEMENT HELPERS ----------
  async function erc20Decimals(token: string) {
    const pc = await getPublicClient();
    const dec = (await pc.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })) as number;
    return dec;
  }

  async function approveToken(
    token: string,
    spender: string,
    humanAmount: string
  ) {
    if (!token || !spender) throw new Error('Token or spender missing');
    const wc = await getWalletClient();
    const pc = await getPublicClient();
    const eth = (window as WithEthereum).ethereum!;
    const from = ((await eth.request({
      method: 'eth_requestAccounts',
    })) as string[])[0] as `0x${string}`;

    const dec = await erc20Decimals(token);
    const value = parseUnits(humanAmount, dec);

    const hash = await wc.writeContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender as `0x${string}`, value],
      account: from,
    });
    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function settleAtomicCall(params: {
    tokenA: string;
    tokenB: string;
    makerA: string;
    makerB: string;
    amountAUi: string;
    amountBUi: string;
  }) {
    if (!escrowAddress) throw new Error('Set escrow address');
    const wc = await getWalletClient();
    const pc = await getPublicClient();

    const decA = await erc20Decimals(params.tokenA);
    const decB = await erc20Decimals(params.tokenB);
    const amountA = parseUnits(params.amountAUi, decA);
    const amountB = parseUnits(params.amountBUi, decB);

    const eth = (window as WithEthereum).ethereum!;
    const from = ((await eth.request({
      method: 'eth_requestAccounts',
    })) as string[])[0] as `0x${string}`;

    const hash = await wc.writeContract({
      address: escrowAddress as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'settleAtomic',
      args: [
        params.tokenA as `0x${string}`,
        params.tokenB as `0x${string}`,
        params.makerA as `0x${string}`,
        params.makerB as `0x${string}`,
        amountA,
        amountB,
      ],
      account: from,
    });
    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ---------- ORACLE & ALLOWANCE ----------
  type Reserves = readonly [bigint, bigint, number];

  async function detectBaseIsToken0(pair: string, baseTokenAddr: string) {
    const pc = await getPublicClient();
    const t0 = (await pc.readContract({
      address: pair as `0x${string}`,
      abi: UNIV2_PAIR_ABI,
      functionName: 'token0',
    })) as `0x${string}`;
    return t0.toLowerCase() === baseTokenAddr.toLowerCase();
  }

  async function readU2Price(pair: string, baseIsToken0: boolean) {
    const pc = await getPublicClient();
    const [r0, r1] = (await pc.readContract({
      address: pair as `0x${string}`,
      abi: UNIV2_PAIR_ABI,
      functionName: 'getReserves',
    })) as Reserves;
    const price = baseIsToken0 ? Number(r1) / Number(r0) : Number(r0) / Number(r1);
    return price;
  }

  async function checkAllowance(
    token: string,
    owner: string,
    spender: string,
    humanAmount: string
  ) {
    if (!token || !spender || !owner || !humanAmount) return false;
    const pc = await getPublicClient();
    const dec = await erc20Decimals(token);
    const need = parseUnits(humanAmount, dec);
    const allowance = (await pc.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner as `0x${string}`, spender as `0x${string}`],
    })) as bigint;
    return allowance >= need;
  }

  async function checkReadiness() {
    // 1) Price check (optional)
    let pOk: boolean | null = null;
    if (pairAddress && tokenA && tokenB && lastMatch) {
      const baseIs0 = await detectBaseIsToken0(pairAddress, tokenA);
      const p = await readU2Price(pairAddress, baseIs0);
      setRefPrice(p.toString());
      const cp = Number(lastMatch.clearingPrice ?? 0);
      if (cp > 0) pOk = Math.abs((cp - p) / p) <= 0.05; // ±5%
    }
    setPriceOk(pOk);

    // 2) Allowances (for each maker)
    const aOk = await checkAllowance(
      tokenA,
      lastMatch?.intentA.maker ?? '',
      escrowAddress,
      amountAUi
    );
    const bOk = await checkAllowance(
      tokenB,
      lastMatch?.intentB.maker ?? '',
      escrowAddress,
      amountBUi
    );
    setAllowAok(aOk);
    setAllowBok(bOk);
  }

  // ---------- EIP-2612 PERMIT ----------
  async function getPermitTypedData(
    token: string,
    owner: string,
    spender: string,
    humanAmount: string,
    deadlineTs: number
  ) {
    const pc = await getPublicClient();
    const [nonce, name] = await Promise.all([
      pc.readContract({
        address: token as `0x${string}`,
        abi: ERC20_PERMIT_ABI,
        functionName: 'nonces',
        args: [owner as `0x${string}`],
      }) as Promise<bigint>,
      pc.readContract({
        address: token as `0x${string}`,
        abi: ERC20_PERMIT_ABI,
        functionName: 'name',
      }) as Promise<string>,
    ]);
    const chainId = await getChainId();
    const dec = await erc20Decimals(token);
    const value = parseUnits(humanAmount, dec);

    const domain = {
      name,
      version: '1',
      chainId,
      verifyingContract: token as `0x${string}`,
    } as const;

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    } as const;

    const message = {
      owner: owner as `0x${string}`,
      spender: spender as `0x${string}`,
      value,
      nonce,
      deadline: BigInt(deadlineTs),
    } as const;

    return { domain, types, message };
  }

  async function submitPermit(
    token: string,
    owner: string,
    spender: string,
    humanAmount: string,
    deadlineMinutes = 20
  ) {
    if (!token || !owner || !spender) throw new Error('Missing permit params');
    const wc = await getWalletClient();
    const pc = await getPublicClient();

    const deadlineTs = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;
    const { domain, types, message } = await getPermitTypedData(
      token,
      owner,
      spender,
      humanAmount,
      deadlineTs
    );

    const signature = await wc.signTypedData({
      domain,
      types,
      primaryType: 'Permit',
      message,
      account: owner as `0x${string}`,
    });

    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(signature.slice(130, 132), 16);

    const hash = await wc.writeContract({
      address: token as `0x${string}`,
      abi: ERC20_PERMIT_ABI,
      functionName: 'permit',
      args: [
        owner as `0x${string}`,
        spender as `0x${string}`,
        message.value,
        message.deadline,
        v,
        r,
        s,
      ],
      account: owner as `0x${string}`,
    });

    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ---------- UI ----------
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* LEFT: New Intent */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>New Intent</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={connect}
              disabled={!!account || busy}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #6b6b1f',
                background: '#2d2d10',
                color: '#fff7c2',
              }}
            >
              {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect'}
            </button>
          </div>

          {label('Give Symbol')}
          {input({
            value: giveSymbol,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setGiveSymbol(e.target.value),
          })}
          <div style={{ height: 8 }} />
          {label('Give Chain')}
          {input({
            value: giveChain,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setGiveChain(e.target.value),
          })}
          <div style={{ height: 8 }} />
          {label('Amount Max')}
          {input({
            type: 'number',
            value: giveAmount,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setGiveAmount(e.target.value),
          })}

          <div style={{ height: 12 }} />

          {label('Get Symbol')}
          {input({
            value: getSymbol,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setGetSymbol(e.target.value),
          })}
          <div style={{ height: 8 }} />
          {label('Get Chain')}
          {input({
            value: getChain,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setGetChain(e.target.value),
          })}
          <div style={{ height: 8 }} />
          {label('Amount Min')}
          {input({
            type: 'number',
            value: getAmount,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setGetAmount(e.target.value),
          })}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginTop: 12,
            }}
          >
            <div>
              {label('Price Limit (optional)')}
              {input({
                type: 'number',
                value: priceLimit,
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setPriceLimit(
                    e.target.value === '' ? '' : Number(e.target.value)
                  ),
              })}
            </div>
            <div>
              {label('Deadline ISO (optional)')}
              {input({
                placeholder: '2025-12-31T23:59:00Z',
                value: deadline,
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setDeadline(e.target.value),
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={postIntent}
              disabled={busy}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #263366',
                background: '#172044',
                color: 'white',
              }}
            >
              Post Intent
            </button>
            <button
              onClick={solve}
              disabled={busy}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #2a6a3d',
                background: '#163521',
                color: '#c9ffd6',
              }}
            >
              Solve
            </button>
          </div>
        </div>

        {/* RIGHT: Pool & Last Match + Settlement */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Intent Pool</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {intents.length === 0 && (
              <div style={{ opacity: 0.7 }}>No intents yet.</div>
            )}
            {intents.map((it) => (
              <div
                key={it.id}
                style={{
                  border: '1px solid #1b2850',
                  borderRadius: 12,
                  padding: 12,
                  background: '#0e1630',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {it.maker.slice(0, 6)}…{it.maker.slice(-4)}
                </div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                  Give {it.give.amountMax} {it.give.asset.symbol} on{' '}
                  {it.give.asset.chain} → Get {it.get.amountMin}{' '}
                  {it.get.asset.symbol} on {it.get.asset.chain}
                </div>
                {it.constraints?.priceLimit && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    PriceLimit: {it.constraints.priceLimit}
                  </div>
                )}
                {it.constraints?.deadline && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Deadline: {it.constraints.deadline}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 600, marginTop: 16 }}>Last Match</div>
          {!lastMatch && (
            <div style={{ opacity: 0.7 }}>No match yet. Click Solve.</div>
          )}
          {lastMatch && (
            <div
              style={{
                border: '1px solid #1b2850',
                borderRadius: 12,
                padding: 12,
                background: '#0e1630',
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                {lastMatch.intentA.maker.slice(0, 6)}…
                {lastMatch.intentA.maker.slice(-4)} ↔{' '}
                {lastMatch.intentB.maker.slice(0, 6)}…
                {lastMatch.intentB.maker.slice(-4)}
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                Clearing Price: {lastMatch.clearingPrice?.toFixed(6)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                @ {new Date(lastMatch.createdAt).toLocaleString()}
              </div>
            </div>
          )}

          {/* ---------- ON-CHAIN SETTLEMENT UI ---------- */}
          <div
            style={{
              border: '1px solid #1b2850',
              borderRadius: 12,
              padding: 12,
              background: '#0e1630',
              marginTop: 16,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              On-chain Settlement (Escrow)
            </div>

            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
            >
              <div>
                {label('Escrow Address')}
                {input({
                  placeholder: '0x...',
                  value: escrowAddress,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setEscrowAddress(e.target.value),
                })}
              </div>
              <div />
              <div>
                {label('Uniswap V2 Pair (optional)')}
                {input({
                  placeholder: '0x... (e.g., USDC-ETH pair)',
                  value: pairAddress,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setPairAddress(e.target.value),
                })}
              </div>
              <div />
              <div>
                {label('Token A (ERC-20 address)')}
                {input({
                  placeholder: '0x... (token provided by maker A)',
                  value: tokenA,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setTokenA(e.target.value),
                })}
              </div>
              <div>
                {label('Token B (ERC-20 address)')}
                {input({
                  placeholder: '0x... (token provided by maker B)',
                  value: tokenB,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setTokenB(e.target.value),
                })}
              </div>
              <div>
                {label('Amount A (human)')}
                {input({
                  placeholder: 'e.g., 2000',
                  value: amountAUi,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setAmountAUi(e.target.value),
                })}
              </div>
              <div>
                {label('Amount B (human)')}
                {input({
                  placeholder: 'e.g., 1',
                  value: amountBUi,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setAmountBUi(e.target.value),
                })}
              </div>
            </div>

            <div
              style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
            >
              <button
                onClick={checkReadiness}
                disabled={
                  !escrowAddress || !tokenA || !tokenB || !amountAUi || !amountBUi || busy
                }
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #344',
                  background: '#0b2239',
                  color: '#cde',
                }}
              >
                Check Readiness (Price & Allowance)
              </button>
              {priceOk !== null && (
                <div style={{ alignSelf: 'center', fontSize: 12, opacity: 0.85 }}>
                  Price check: {priceOk ? 'OK' : '⚠️ Mismatch'}{' '}
                  {refPrice && `(ref: ${refPrice})`}
                </div>
              )}
              {allowAok !== null && allowBok !== null && (
                <div style={{ alignSelf: 'center', fontSize: 12, opacity: 0.85 }}>
                  Allowance A: {allowAok ? 'OK' : 'Approve/Permit needed'} | Allowance
                  B: {allowBok ? 'OK' : 'Approve/Permit needed'}
                </div>
              )}
            </div>

            {/* Permit settings */}
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}
            >
              <div>
                {label('Permit Deadline (minutes)')}
                {input({
                  type: 'number',
                  value: permitDeadlineMin,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    setPermitDeadlineMin(Number(e.target.value || 0)),
                })}
              </div>
              <div />
            </div>

            {/* Approve / Permit / Settle Buttons */}
            <div
              style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
            >
              <button
                disabled={!tokenA || !escrowAddress || busy}
                onClick={() => approveToken(tokenA, escrowAddress, amountAUi)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #6b4b26',
                  background: '#2a1b0e',
                  color: '#ffd9b3',
                }}
              >
                Approve Token A
              </button>
              <button
                disabled={!tokenB || !escrowAddress || busy}
                onClick={() => approveToken(tokenB, escrowAddress, amountBUi)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #6b4b26',
                  background: '#2a1b0e',
                  color: '#ffd9b3',
                }}
              >
                Approve Token B
              </button>

              <button
                disabled={!account || !tokenA || !escrowAddress || busy}
                onClick={() =>
                  submitPermit(tokenA, account!, escrowAddress, amountAUi, permitDeadlineMin)
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #36507a',
                  background: '#0f1e33',
                  color: '#cfe2ff',
                }}
              >
                Permit Token A (EIP-2612)
              </button>
              <button
                disabled={!account || !tokenB || !escrowAddress || busy}
                onClick={() =>
                  submitPermit(tokenB, account!, escrowAddress, amountBUi, permitDeadlineMin)
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #36507a',
                  background: '#0f1e33',
                  color: '#cfe2ff',
                }}
              >
                Permit Token B (EIP-2612)
              </button>

              <button
                disabled={!lastMatch || !tokenA || !tokenB || !escrowAddress || busy}
                onClick={() =>
                  settleAtomicCall({
                    tokenA,
                    tokenB,
                    makerA: lastMatch!.intentA.maker,
                    makerB: lastMatch!.intentB.maker,
                    amountAUi,
                    amountBUi,
                  })
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #2a6a3d',
                  background: '#163521',
                  color: '#c9ffd6',
                }}
              >
                Settle Atomic
              </button>

              <button
                disabled={
                  !lastMatch ||
                  !tokenA ||
                  !tokenB ||
                  !escrowAddress ||
                  busy ||
                  allowAok !== true ||
                  allowBok !== true ||
                  priceOk === false
                }
                onClick={() =>
                  settleAtomicCall({
                    tokenA,
                    tokenB,
                    makerA: lastMatch!.intentA.maker,
                    makerB: lastMatch!.intentB.maker,
                    amountAUi,
                    amountBUi,
                  })
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #2a6a3d',
                  background: '#0f3a22',
                  color: '#c9ffd6',
                }}
              >
                Auto-Settle (all checks passed)
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
              Note: Permit (EIP-2612) allows setting allowances via signature + single tx.
              If a token does not support it, use <i>Approve</i>. For tokens with fewer
              decimals (e.g., USDC with 6), enter human-readable amounts; the app converts.
            </div>
          </div>

          {/* Match History */}
          <div style={{ fontWeight: 600, marginTop: 16 }}>Match History</div>
          {matches.length === 0 && <div style={{ opacity: 0.7 }}>No past matches.</div>}
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {matches.map((m, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #1b2850',
                  borderRadius: 12,
                  padding: 12,
                  background: '#0e1630',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {new Date(m.createdAt).toLocaleString()}
                </div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                  {m.intentA.maker.slice(0, 6)}…{m.intentA.maker.slice(-4)} ↔{' '}
                  {m.intentB.maker.slice(0, 6)}…{m.intentB.maker.slice(-4)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Clearing: {m.clearingPrice?.toFixed(6)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
