import { describe, expect, it } from "vitest";
import { currentWindow, isUpstreamAccountError } from "../src/services/adminAlerts";

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);

describe("upstream pool: current period", () => {
  it("is off until a start date is set", () => {
    expect(currentWindow({ periodStart: "", periodDays: 30 })).toBeNull();
    expect(currentWindow({ periodStart: "not-a-date", periodDays: 30 })).toBeNull();
  });

  it("starts on the given day while inside the first period", () => {
    const w = currentWindow({ periodStart: "2026-11-01", periodDays: 30 }, at("2026-11-22T12:00:00Z"))!;
    expect(w.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("rolls forward by whole periods, like the upstream plan renewing", () => {
    const w = currentWindow({ periodStart: "2026-11-01", periodDays: 30 }, at("2027-01-15T00:00:00Z"))!;
    expect(w.start.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(30 * DAY);
  });

  it("starts exactly at a boundary", () => {
    const w = currentWindow({ periodStart: "2026-11-01", periodDays: 30 }, at("2026-12-01T00:00:00Z"))!;
    expect(w.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("treats a future start date as the first period", () => {
    const w = currentWindow({ periodStart: "2026-12-10", periodDays: 30 }, at("2026-11-22T00:00:00Z"))!;
    expect(w.start.toISOString()).toBe("2026-12-10T00:00:00.000Z");
  });
});

describe("upstream errors that need the admin", () => {
  it("flags a rejected key and an empty account", () => {
    expect(isUpstreamAccountError(401, "Invalid API key")).toBe(true);
    expect(isUpstreamAccountError(403, "forbidden")).toBe(true);
    expect(isUpstreamAccountError(402, "available tokens exhausted")).toBe(true);
  });

  it("flags a 429 only when it's about quota or credit", () => {
    expect(isUpstreamAccountError(429, '{"error":{"code":"insufficient_quota"}}')).toBe(true);
    expect(isUpstreamAccountError(429, "Monthly token quota exceeded")).toBe(true);
    expect(isUpstreamAccountError(429, "Rate limit reached, slow down")).toBe(false);
  });

  it("ignores ordinary failures", () => {
    for (const s of [0, 404, 500, 502, 503]) expect(isUpstreamAccountError(s, "upstream error")).toBe(false);
  });
});
