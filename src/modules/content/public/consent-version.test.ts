import { describe, expect, it } from "vitest";


import { privacyConsentVersion } from "./consent-version";

describe("privacyConsentVersion", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu của bạn" }] }] };

  it("names the language and a stable hash of the text", () => {
    const version = privacyConsentVersion("vi", "Chính sách bảo mật", doc);
    expect(version).toMatch(/^privacy-vi-[0-9a-f]{16}$/);
    expect(privacyConsentVersion("vi", "Chính sách bảo mật", structuredClone(doc))).toBe(version);
  });

  it("changes when the title, the content or the language changes", () => {
    const base = privacyConsentVersion("vi", "Chính sách bảo mật", doc);
    expect(privacyConsentVersion("vi", "Chính sách bảo mật mới", doc)).not.toBe(base);
    const edited = structuredClone(doc);
    edited.content[0].content[0].text = "Dữ liệu của bạn được bảo vệ";
    expect(privacyConsentVersion("vi", "Chính sách bảo mật", edited)).not.toBe(base);
    expect(privacyConsentVersion("en", "Chính sách bảo mật", doc).slice(11)).toBe(base.slice(11));
    expect(privacyConsentVersion("en", "Chính sách bảo mật", doc)).not.toBe(base);
  });
});
