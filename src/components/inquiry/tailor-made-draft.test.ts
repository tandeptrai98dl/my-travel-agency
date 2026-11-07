import { afterEach, describe, expect, it, vi } from "vitest";

import { clearDraft, readDraft } from "./tailor-made-draft";

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
  it("drops React's action fields, consent, tokens and malformed entries", () => {
    stubStorage({
      [KEY]: JSON.stringify([
        ["$ACTION_REF_1", ""],
        ["$ACTION_1:0", '{"id":"abc"}'],
        ["$ACTION_KEY", "k1"],
        ["consent", "on"],
        ["cf-turnstile-response", "token"],
        ["website", "x"],
        ["dest", "vietnam"],
        ["adults", "3"],
        ["broken"],
        ["n", 4],
      ]),
    });
    expect(readDraft()).toEqual([
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
});
