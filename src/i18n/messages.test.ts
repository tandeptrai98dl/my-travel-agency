import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import vi from "../../messages/vi.json";

function keys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("messages", () => {
  it("vi.json and en.json have exactly the same keys (CLAUDE.md rule 11)", () => {
    expect(keys(en).sort()).toEqual(keys(vi).sort());
  });

  it("has no empty strings", () => {
    const empty = (messages: unknown) =>
      keys(messages).filter((path) => {
        const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
        return value === "";
      });
    expect(empty(vi)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});
