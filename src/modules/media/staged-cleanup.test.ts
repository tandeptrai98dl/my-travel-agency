import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listStaged: vi.fn(), removeStagedMany: vi.fn() }));
vi.mock("./media.repository", () => ({ listStaged: mocks.listStaged, removeStagedMany: mocks.removeStagedMany }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { listAllPages, STAGED_PAGE, stagedFolders, staleStagedPaths } from "./staged-cleanup";
import { cleanupStagedUploads } from "./staged-cleanup.service";

const NOW = new Date("2026-11-10T02:29:00Z");
const USER = "6f1c2a4e-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const FILE = (n: number) => `${String(n).padStart(8, "0")}-1111-4222-8333-444455556666`;
const file = (name: string, hoursAgo: number | null) => ({
  name,
  id: `id-${name}`,
  created_at: hoursAgo === null ? null : new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
});
const folder = (name: string) => ({ name, id: null, created_at: null });

describe("staleStagedPaths", () => {
  it("keeps files under 24 hours old and removes older ones", () => {
    const entries = [file(`${FILE(1)}.jpg`, 25), file(`${FILE(2)}.png`, 23.9), file(`${FILE(3)}.webp`, 24.01), file(`${FILE(4)}.avif`, 72)];
    expect(staleStagedPaths(USER, entries, NOW)).toEqual([`pending/${USER}/${FILE(1)}.jpg`, `pending/${USER}/${FILE(3)}.webp`, `pending/${USER}/${FILE(4)}.avif`]);
  });

  it("removes only names the server makes: never folders, other names, other types or files without a time", () => {
    const entries = [
      folder(FILE(5)),
      file("notes.txt", 100),
      file(`${FILE(6)}.svg`, 100),
      file(`${FILE(7)}.JPG`, 100),
      file(`${FILE(8)}.jpg`, null),
      { name: `${FILE(9)}.jpg`, id: "x", created_at: "not a date" },
    ];
    expect(staleStagedPaths(USER, entries, NOW)).toEqual([]);
    expect(staleStagedPaths("not-a-user", [file(`${FILE(1)}.jpg`, 100)], NOW)).toEqual([]);
  });

  it("finds user folders under pending/ only", () => {
    expect(stagedFolders([folder(USER), folder("tmp"), file(`${FILE(1)}.jpg`, 100), folder(OTHER)])).toEqual([USER, OTHER]);
  });
});

describe("listAllPages", () => {
  it("pages until a short page and stops on errors", async () => {
    const all = Array.from({ length: 250 }, (_, i) => file(`${FILE(i)}.jpg`, 30));
    const fetchPage = vi.fn(async (offset: number, limit: number) => ({ data: all.slice(offset, offset + limit), error: null }));
    expect(await listAllPages(fetchPage)).toHaveLength(250);
    expect(fetchPage.mock.calls).toEqual([[0, STAGED_PAGE], [100, STAGED_PAGE], [200, STAGED_PAGE]]);

    const exact = vi.fn(async (offset: number, limit: number) => ({ data: all.slice(0, 200).slice(offset, offset + limit), error: null }));
    expect(await listAllPages(exact)).toHaveLength(200);
    expect(exact).toHaveBeenCalledTimes(3);

    await expect(listAllPages(async () => ({ data: null, error: { message: "denied" } }))).rejects.toThrow("storage list failed: denied");
  });
});

describe("cleanupStagedUploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.removeStagedMany.mockImplementation(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
  });

  it("lists pending/ and each user folder page by page, then removes only stale staged files in batches", async () => {
    const userFiles = Array.from({ length: 230 }, (_, i) => file(`${FILE(i)}.jpg`, i < 150 ? 30 : 2));
    const listings: Record<string, ReturnType<typeof file>[] | ReturnType<typeof folder>[]> = {
      pending: [folder(USER), folder(OTHER)],
      [`pending/${USER}`]: userFiles,
      [`pending/${OTHER}`]: [file(`${FILE(900)}.png`, 48), file(`${FILE(901)}.png`, 1)],
    };
    mocks.listStaged.mockImplementation(async (prefix: string, offset: number, limit: number) => ({
      data: (listings[prefix] ?? []).slice(offset, offset + limit),
      error: null,
    }));
    const result = await cleanupStagedUploads(NOW);
    expect(result).toEqual({ folders: 2, removed: 151, failed: 0 });
    // The user folder took three pages (100 + 100 + 30).
    expect(mocks.listStaged.mock.calls.filter(([prefix]) => prefix === `pending/${USER}`).map(([, offset]) => offset)).toEqual([0, 100, 200]);
    const removed = mocks.removeStagedMany.mock.calls.flatMap(([paths]) => paths as string[]);
    expect(mocks.removeStagedMany.mock.calls.map(([paths]) => (paths as string[]).length)).toEqual([100, 51]);
    expect(removed).toContain(`pending/${OTHER}/${FILE(900)}.png`);
    expect(removed).not.toContain(`pending/${OTHER}/${FILE(901)}.png`);
    expect(removed).not.toContain(`pending/${USER}/${FILE(150)}.jpg`);
  });

  it("counts a failed batch and goes on", async () => {
    mocks.listStaged.mockImplementation(async (prefix: string) => ({
      data: prefix === "pending" ? [folder(USER)] : [file(`${FILE(1)}.jpg`, 30)],
      error: null,
    }));
    mocks.removeStagedMany.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await cleanupStagedUploads(NOW)).toEqual({ folders: 1, removed: 0, failed: 1 });
  });
});
