import { env } from "../../config/env";
import { hmacHex } from "../../lib/crypto";

export type PayTx = {
  orderType?: string;
  transactionId?: string;
  orderId?: string;
  transactionTime?: number;
  amount?: string;
  currency?: string;
  fundsDetail?: { currency?: string; amount?: string }[];
  payerInfo?: { name?: string; binanceId?: string | number };
};

export type PayCheck =
  | { status: "confirmed"; receivedMicros: number; payer: string }
  | { status: "pending"; reason: string }
  | { status: "mismatch"; receivedMicros: number; reason: string }
  | { status: "failed"; reason: string };

const STABLES = ["USDT", "USDC", "FDUSD"];

export const binancePayConfigured = () => Boolean(env.BINANCE_API_KEY && env.BINANCE_API_SECRET);

function stableAmount(tx: PayTx): number {
  if (tx.currency && STABLES.includes(tx.currency.toUpperCase())) return Number(tx.amount ?? 0);
  const funds = (tx.fundsDetail ?? []).filter((f) => STABLES.includes((f.currency ?? "").toUpperCase()));
  return funds.reduce((n, f) => n + Number(f.amount ?? 0), 0) * (Number(tx.amount ?? 0) < 0 ? -1 : 1);
}

/** Pure matcher used by verifyBinancePay and the unit tests. */
export function matchBinancePay(txs: PayTx[], args: { orderId: string; expectedMicros: number; notBefore: number }): PayCheck {
  const id = args.orderId.trim();
  const tx = txs.find((t) => String(t.transactionId ?? "").trim() === id || String(t.orderId ?? "").trim() === id);
  if (!tx) return { status: "pending", reason: "We couldn't find this Order ID in our Binance Pay history yet. It can take a minute to appear." };
  const amount = stableAmount(tx);
  if (!(amount > 0)) return { status: "failed", reason: "That Order ID isn't an incoming payment to us." };
  if ((tx.transactionTime ?? 0) < args.notBefore) return { status: "failed", reason: "This payment was made before the order was created." };
  const receivedMicros = Math.round(amount * 1_000_000);
  if (receivedMicros + 10_000 < args.expectedMicros) {
    return { status: "mismatch", receivedMicros, reason: `Received ${amount} USDT but ${(args.expectedMicros / 1e6).toFixed(2)} USDT was expected.` };
  }
  return { status: "confirmed", receivedMicros, payer: String(tx.payerInfo?.name ?? tx.payerInfo?.binanceId ?? "") };
}

async function fetchPayHistory(since: number): Promise<PayTx[]> {
  const params = new URLSearchParams({
    startTime: String(since),
    endTime: String(Date.now()),
    limit: "100",
    timestamp: String(Date.now()),
    recvWindow: "10000",
  });
  const qs = params.toString();
  const signature = hmacHex(env.BINANCE_API_SECRET, qs);
  const r = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${qs}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": env.BINANCE_API_KEY },
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await r.json().catch(() => ({}));
  if (!r.ok || (json.code && json.code !== "000000")) throw new Error(json.msg ?? json.message ?? `Binance API ${r.status}`);
  return (json.data ?? []) as PayTx[];
}

export async function verifyBinancePay(args: { orderId: string; expectedMicros: number; notBefore: number }): Promise<PayCheck> {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(args.orderId.trim())) return { status: "failed", reason: "Enter the Order ID from your Binance Pay transaction details." };
  if (!binancePayConfigured()) return { status: "pending", reason: "Automatic Binance Pay checks are not configured; an admin will verify this payment." };
  try {
    const txs = await fetchPayHistory(args.notBefore - 60_000);
    return matchBinancePay(txs, args);
  } catch (err) {
    return { status: "pending", reason: `Couldn't reach Binance (${(err as Error).message}). We'll retry automatically.` };
  }
}
