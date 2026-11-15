import { env } from "../../config/env";

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const USDT_DECIMALS = 18;

export type Receipt = {
  status?: string;
  blockNumber?: string;
  logs?: { address?: string; topics?: string[]; data?: string }[];
};

export type Bep20Check =
  | { status: "confirmed"; receivedMicros: number; confirmations: number; blockTime: number }
  | { status: "pending"; reason: string; confirmations?: number }
  | { status: "failed"; reason: string };

export const isTxHash = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

const topicFor = (address: string) => "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/** Sum of token transfers to `to` inside a receipt (raw units). */
export function sumTransfersTo(receipt: Receipt, token: string, to: string): bigint {
  const t = token.toLowerCase();
  const toTopic = topicFor(to);
  let total = 0n;
  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== t) continue;
    const topics = (log.topics ?? []).map((x) => x.toLowerCase());
    if (topics[0] !== TRANSFER_TOPIC || topics[2] !== toTopic) continue;
    try {
      total += BigInt(log.data && log.data !== "0x" ? log.data : "0x0");
    } catch {
      /* malformed */
    }
  }
  return total;
}

export function rawToMicros(raw: bigint, decimals = USDT_DECIMALS): number {
  if (decimals >= 6) return Number(raw / 10n ** BigInt(decimals - 6));
  return Number(raw * 10n ** BigInt(6 - decimals));
}

/** Pure evaluation of a fetched receipt; used by verifyBep20 and the unit tests. */
export function evaluateReceipt(args: {
  receipt: Receipt | null;
  token: string;
  to: string;
  latestBlock: number;
  blockTime: number;
  notBefore: number;
  minConfirmations: number;
}): Bep20Check {
  const { receipt } = args;
  if (!receipt) return { status: "pending", reason: "Transaction not found on BSC yet. It may still be propagating." };
  if (receipt.status !== "0x1") return { status: "failed", reason: "This transaction failed on-chain." };
  const raw = sumTransfersTo(receipt, args.token, args.to);
  if (raw === 0n) return { status: "failed", reason: "No USDT (BEP-20) transfer to our wallet was found in this transaction." };
  if (args.blockTime && args.blockTime < args.notBefore) return { status: "failed", reason: "This transaction was sent before the payment was created." };
  const confirmations = args.latestBlock - parseInt(receipt.blockNumber ?? "0x0", 16) + 1;
  if (confirmations < args.minConfirmations) return { status: "pending", reason: `Waiting for confirmations (${Math.max(0, confirmations)}/${args.minConfirmations}).`, confirmations };
  return { status: "confirmed", receivedMicros: rawToMicros(raw), confirmations, blockTime: args.blockTime };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(env.BSC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`BSC RPC ${r.status}`);
  const json: any = await r.json();
  if (json.error) throw new Error(json.error.message ?? "BSC RPC error");
  return json.result as T;
}

export async function verifyBep20(args: { txHash: string; to: string; notBefore: number }): Promise<Bep20Check> {
  if (!isTxHash(args.txHash)) return { status: "failed", reason: "That doesn't look like a transaction hash (0x followed by 64 characters)." };
  if (!args.to) return { status: "pending", reason: "The receiving wallet isn't configured yet." };
  try {
    const receipt = await rpc<Receipt | null>("eth_getTransactionReceipt", [args.txHash]);
    if (!receipt) return evaluateReceipt({ receipt: null, token: env.USDT_BEP20_CONTRACT, to: args.to, latestBlock: 0, blockTime: 0, notBefore: args.notBefore, minConfirmations: env.BSC_MIN_CONFIRMATIONS });
    const [latestHex, block] = await Promise.all([
      rpc<string>("eth_blockNumber", []),
      rpc<{ timestamp: string } | null>("eth_getBlockByNumber", [receipt.blockNumber, false]),
    ]);
    return evaluateReceipt({
      receipt,
      token: env.USDT_BEP20_CONTRACT,
      to: args.to,
      latestBlock: parseInt(latestHex, 16),
      blockTime: block ? parseInt(block.timestamp, 16) * 1000 : 0,
      notBefore: args.notBefore,
      minConfirmations: env.BSC_MIN_CONFIRMATIONS,
    });
  } catch (err) {
    return { status: "pending", reason: `Couldn't reach the BSC network (${(err as Error).message}). We'll retry automatically.` };
  }
}
