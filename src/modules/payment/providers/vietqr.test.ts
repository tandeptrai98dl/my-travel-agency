import { describe, expect, it } from "vitest";

import { crc16, transferMemo, vietQrPayload, vietQrProvider, vietQrSvg } from "./vietqr";

const account = { bankBin: "970436", accountNumber: "0011001234567", accountHolder: "CONG TY DU LICH MAU" };

describe("VietQR", () => {
  it("uses CRC-16/CCITT-FALSE (check value 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("builds the NAPAS 247 payload with the amount and the reference as the memo", () => {
    // Expected string built independently (Python, same EMVCo TLV rules).
    expect(vietQrPayload(account, 3_870_000, "PTA2611004201")).toBe(
      "00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA5303704540738700005802VN62170813PTA26110042016304C840",
    );
  });

  it("refuses bad accounts and amounts", () => {
    expect(() => vietQrPayload({ ...account, bankBin: "97043" }, 1000, "X")).toThrow();
    expect(() => vietQrPayload(account, 10.5, "X")).toThrow();
    expect(() => vietQrPayload(account, 0, "X")).toThrow();
  });

  it("keeps the memo to letters and digits", () => {
    expect(transferMemo("pta-2611 0042_01")).toBe("PTA2611004201");
  });

  it("gives transfer instructions and an SVG", async () => {
    const instructions = vietQrProvider(account).createPayment({
      reference: "PTA2611004201",
      amount: 3_870_000,
      expiresAt: new Date(),
      bookingCode: "PTA-2611-0042",
      locale: "vi",
      ipAddress: "",
    });
    expect(instructions).toMatchObject({ kind: "transfer", memo: "PTA2611004201", amount: 3_870_000, accountNumber: "0011001234567" });
    const svg = await vietQrSvg(instructions.kind === "transfer" ? instructions.payload : "");
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
