import { afterEach, describe, expect, it, vi } from "vitest";

import { campaignTags, clearDraft, readDraft } from "./tailor-made-draft";

const KEY = "pta:tailor-made:draft:v1";

function stubStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("tailor-made draft", () => {
  it("drops contact details, React's action fields, consent, tokens and malformed entries", () => {
    stubStorage({
      [KEY]: JSON.stringify([
        ["$ACTION_REF_1", ""],
        ["$ACTION_1:0", '{"id":"abc"}'],
        ["$ACTION_KEY", "k1"],
        ["consent", "on"],
        ["cf-turnstile-response", "token"],
        ["website", "x"],
        ["name", "Nguyễn Văn Ân"],
        ["email", "an@example.com"],
        ["phone", "0900000000"],
        ["message", "Kỷ niệm ngày cưới"],
        ["preferredContact", "zalo"],
        ["dest", "vietnam"],
        ["adults", "3"],
        ["broken"],
        ["n", 4],
      ]),
    });
    expect(readDraft()).toEqual([
      ["preferredContact", "zalo"],
      ["dest", "vietnam"],
      ["adults", "3"],
    ]);
  });

  it("survives broken JSON and blocked storage", () => {
    stubStorage({ [KEY]: "{not json" });
    expect(readDraft()).toBeNull();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readDraft()).toBeNull();
    expect(() => clearDraft()).not.toThrow();
  });

  it("clears the draft", () => {
    const store = stubStorage({ [KEY]: "[]" });
    clearDraft();
    expect(store.has(KEY)).toBe(false);
  });

  it("reads campaign tags from the URL, known keys only, shortened", () => {
    expect(campaignTags(`?utm_source=news&utm_medium=&utm_evil=x&utm_campaign=${"a".repeat(150)}`)).toEqual([
      ["utm_source", "news"],
      ["utm_campaign", "a".repeat(100)],
    ]);
  });
});
