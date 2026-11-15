import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as any[],
  queries: [] as any[],
  deletedIds: [] as unknown[],
  deletedKeys: [] as string[],
  failDelete: false,
}));

vi.mock("../src/services/storage", () => ({
  deleteFiles: vi.fn(async (keys: string[]) => {
    if (state.failDelete) throw new Error("cloudinary down");
    state.deletedKeys.push(...keys);
  }),
}));

vi.mock("../src/db/models", () => ({
  ImageGeneration: {
    find: vi.fn((q: any) => {
      state.queries.push(q);
      const cutoff: Date = q.createdAt.$lte;
      const due = state.rows.filter((r) => r.createdAt <= cutoff);
      return { sort: () => ({ limit: (n: number) => ({ lean: async () => due.slice(0, n) }) }) };
    }),
    deleteMany: vi.fn(async (q: any) => {
      const ids: unknown[] = q._id.$in;
      state.deletedIds.push(...ids);
      state.rows = state.rows.filter((r) => !ids.includes(r._id));
    }),
  },
}));

const { purgeExpiredImages, imageExpiresAt, generationFileKeys, IMAGE_RETENTION_MS } = await import("../src/services/imageRetention");

const HOUR = 3_600_000;
const now = new Date("2026-11-14T12:00:00Z");
const gen = (id: string, ageHours: number, keys: string[], ref?: string) => ({
  _id: id,
  createdAt: new Date(now.getTime() - ageHours * HOUR),
  images: keys.map((key) => ({ key })),
  refImage: ref ? { key: ref } : undefined,
});

beforeEach(() => {
  state.rows = [];
  state.queries = [];
  state.deletedIds = [];
  state.deletedKeys = [];
  state.failDelete = false;
});

describe("image retention", () => {
  it("defaults to 48 hours", () => {
    expect(IMAGE_RETENTION_MS).toBe(48 * HOUR);
    expect(imageExpiresAt(now).toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });

  it("collects result and reference image keys", () => {
    expect(generationFileKeys(gen("g", 1, ["a.png", "b.png"], "ref.png"))).toEqual(["a.png", "b.png", "ref.png"]);
    expect(generationFileKeys({ images: [{ key: "" }, {}], refImage: null })).toEqual([]);
  });

  it("deletes only generations older than the retention window, files first", async () => {
    state.rows = [gen("old", 49, ["old1.png", "old2.png"], "oldref.png"), gen("edge", 48, ["edge.png"]), gen("fresh", 47, ["fresh.png"])];
    const res = await purgeExpiredImages(now);
    expect(res).toEqual({ generations: 2, files: 4 });
    expect(state.deletedKeys.sort()).toEqual(["edge.png", "old1.png", "old2.png", "oldref.png"]);
    expect(state.deletedIds.sort()).toEqual(["edge", "old"]);
    expect(state.rows.map((r) => r._id)).toEqual(["fresh"]);
  });

  it("keeps records when storage deletion fails so the next run retries", async () => {
    state.rows = [gen("old", 72, ["x.png"])];
    state.failDelete = true;
    await expect(purgeExpiredImages(now)).rejects.toThrow("cloudinary down");
    expect(state.rows).toHaveLength(1);
    state.failDelete = false;
    await expect(purgeExpiredImages(now)).resolves.toEqual({ generations: 1, files: 1 });
    expect(state.rows).toHaveLength(0);
  });

  it("works through large backlogs in batches", async () => {
    state.rows = Array.from({ length: 5 }, (_, i) => gen(`g${i}`, 50 + i, [`k${i}.png`]));
    const res = await purgeExpiredImages(now, 2);
    expect(res).toEqual({ generations: 5, files: 5 });
    expect(state.queries).toHaveLength(3);
  });
});
