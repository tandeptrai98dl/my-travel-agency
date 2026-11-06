import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadMessages, mergeMessages, MESSAGE_FILES } from "./messages";

function keys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const vi = await loadMessages("vi");
const en = await loadMessages("en");

describe("messages", () => {
  it("vi and en have exactly the same keys (CLAUDE.md rule 11)", () => {
    expect(keys(en).sort()).toEqual(keys(vi).sort());
  });

  it("has no empty strings", () => {
    const empty = (messages: unknown) =>
      keys(messages).filter((key) => {
        const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
        return value === "";
      });
    expect(empty(vi)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });

  it.each(["vi", "en"])("every file in messages/%s is listed in MESSAGE_FILES", (locale) => {
    const files = readdirSync(path.join(process.cwd(), "messages", locale)).map((file) => file.replace(/\.json$/, ""));
    expect(files.sort()).toEqual([...MESSAGE_FILES].sort());
  });

  it("refuses a key defined in two files", () => {
    expect(mergeMessages([{ Admin: { Tours: { title: "A" } } }, { Admin: { Media: { title: "B" } } }])).toEqual({
      Admin: { Tours: { title: "A" }, Media: { title: "B" } },
    });
    expect(() => mergeMessages([{ Admin: { title: "A" } }, { Admin: { title: "B" } }])).toThrow(/Admin\.title/);
  });
});
