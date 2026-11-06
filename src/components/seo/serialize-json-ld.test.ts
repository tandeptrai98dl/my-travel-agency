import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "./serialize-json-ld";

describe("serializeJsonLd", () => {
  it("escapes characters that could end the script element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script> & <!--" });
    expect(out).not.toMatch(/[<>&]/);
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script> & <!--" });
  });

  it("keeps Vietnamese text readable", () => {
    expect(serializeJsonLd({ name: "Vịnh Hạ Long" })).toBe('{"name":"Vịnh Hạ Long"}');
  });
});
