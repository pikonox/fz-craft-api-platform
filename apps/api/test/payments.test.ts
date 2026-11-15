import { describe, expect, it } from "vitest";
import { evaluateReceipt, rawToMicros, sumTransfersTo, TRANSFER_TOPIC } from "../src/services/payments/bep20";
import { matchBinancePay } from "../src/services/payments/binancePay";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const OURS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const topic = (a: string) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
const amount = (usd: number) => "0x" + (BigInt(Math.round(usd * 1e6)) * 10n ** 12n).toString(16);

const transfer = (to: string, usd: number, token = USDT) => ({ address: token, topics: [TRANSFER_TOPIC, topic(OTHER), topic(to)], data: amount(usd) });
const receipt = (logs: any[], status = "0x1") => ({ status, blockNumber: "0x64", logs });
const base = { token: USDT, to: OURS, latestBlock: 110, blockTime: 2_000, notBefore: 1_000, minConfirmations: 5 };

describe("BEP-20 receipt evaluation", () => {
  it("confirms a USDT transfer to our wallet", () => {
    const r = evaluateReceipt({ ...base, receipt: receipt([transfer(OURS, 10.37)]) });
    expect(r).toMatchObject({ status: "confirmed", receivedMicros: 10_370_000, confirmations: 11 });
  });

  it("sums multiple transfers to us and ignores other recipients", () => {
    const r = sumTransfersTo(receipt([transfer(OURS, 5), transfer(OTHER, 100), transfer(OURS, 2.5)]), USDT, OURS);
    expect(rawToMicros(r)).toBe(7_500_000);
  });

  it("rejects the wrong token", () => {
    const r = evaluateReceipt({ ...base, receipt: receipt([transfer(OURS, 10, "0x9999999999999999999999999999999999999999")]) });
    expect(r.status).toBe("failed");
  });

  it("rejects transfers to someone else", () => {
    expect(evaluateReceipt({ ...base, receipt: receipt([transfer(OTHER, 10)]) }).status).toBe("failed");
  });

  it("rejects failed transactions", () => {
    expect(evaluateReceipt({ ...base, receipt: receipt([transfer(OURS, 10)], "0x0") }).status).toBe("failed");
  });

  it("rejects transfers made before the order", () => {
    expect(evaluateReceipt({ ...base, blockTime: 500, receipt: receipt([transfer(OURS, 10)]) }).status).toBe("failed");
  });

  it("waits for confirmations", () => {
    const r = evaluateReceipt({ ...base, latestBlock: 101, receipt: receipt([transfer(OURS, 10)]) });
    expect(r.status).toBe("pending");
  });

  it("treats a missing receipt as pending", () => {
    expect(evaluateReceipt({ ...base, receipt: null }).status).toBe("pending");
  });
});

describe("Binance Pay matching", () => {
  const txs = [
    { transactionId: "111222333", transactionTime: 5_000, amount: "10.00", currency: "USDT", payerInfo: { name: "Ali" } },
    { transactionId: "444555666", transactionTime: 5_000, amount: "-3.00", currency: "USDT" },
    { transactionId: "777888999", transactionTime: 500, amount: "10.00", currency: "USDT" },
  ];

  it("confirms an incoming payment by order id", () => {
    expect(matchBinancePay(txs, { orderId: "111222333", expectedMicros: 10_000_000, notBefore: 1_000 })).toMatchObject({ status: "confirmed", receivedMicros: 10_000_000, payer: "Ali" });
  });

  it("flags an underpayment for review", () => {
    expect(matchBinancePay(txs, { orderId: "111222333", expectedMicros: 12_000_000, notBefore: 1_000 }).status).toBe("mismatch");
  });

  it("rejects outgoing payments", () => {
    expect(matchBinancePay(txs, { orderId: "444555666", expectedMicros: 3_000_000, notBefore: 1_000 }).status).toBe("failed");
  });

  it("rejects payments made before the order", () => {
    expect(matchBinancePay(txs, { orderId: "777888999", expectedMicros: 10_000_000, notBefore: 1_000 }).status).toBe("failed");
  });

  it("keeps unknown ids pending (history can lag)", () => {
    expect(matchBinancePay(txs, { orderId: "000", expectedMicros: 1, notBefore: 0 }).status).toBe("pending");
  });
});
