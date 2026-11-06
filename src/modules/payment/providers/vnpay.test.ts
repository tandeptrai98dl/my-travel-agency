import { describe, expect, it } from "vitest";

import { checkIpn, isSuccess, paymentParams, paymentUrl, sign, signData, verifySignature, vnpayTime } from "./vnpay";

const config = {
  tmnCode: "CITEST01",
  hashSecret: "ci-only-vnpay-secret-0123456789",
  paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: "https://example.test/api/payments/vnpay/return",
};
const ipn = {
  vnp_Amount: "1290000000",
  vnp_TxnRef: "PTA2611004201",
  vnp_OrderInfo: "Thanh toan PTA-2611-0042",
  vnp_TmnCode: "CITEST01",
  vnp_ResponseCode: "00",
  vnp_TransactionStatus: "00",
  vnp_TransactionNo: "14012345",
  vnp_ReturnUrl: "https://example.test/api/payments/vnpay/return",
};

describe("VNPay signatures", () => {
  it("matches an independently computed HMAC-SHA512 (Python urllib + hmac)", () => {
    expect(signData(ipn)).toBe(
      "vnp_Amount=1290000000&vnp_OrderInfo=Thanh+toan+PTA-2611-0042&vnp_ResponseCode=00&vnp_ReturnUrl=https%3A%2F%2Fexample.test%2Fapi%2Fpayments%2Fvnpay%2Freturn&vnp_TmnCode=CITEST01&vnp_TransactionNo=14012345&vnp_TransactionStatus=00&vnp_TxnRef=PTA2611004201",
    );
    expect(sign(ipn, config.hashSecret)).toBe(
      "04ec8cebbf73c60cdee6df39d2b0ae3ab3805793886fe5cdd6c15038053b579f046abd594b8000c5758d480091ef810f36444a7885282aaf66f86cc920470c93",
    );
  });

  it("verifies its own signature and refuses any change", () => {
    const signed = { ...ipn, vnp_SecureHashType: "HmacSHA512", vnp_SecureHash: sign(ipn, config.hashSecret).toUpperCase() };
    expect(verifySignature(signed, config.hashSecret)).toBe(true);
    expect(verifySignature({ ...signed, vnp_Amount: "1290000100" }, config.hashSecret)).toBe(false);
    expect(verifySignature(signed, "another-secret-of-some-length")).toBe(false);
    expect(verifySignature({ ...ipn, vnp_SecureHash: "" }, config.hashSecret)).toBe(false);
  });
});

describe("payment URL", () => {
  it("sends the amount × 100 and expires with the hold, in Vietnam time", () => {
    const params = paymentParams(
      config,
      {
        reference: "PTA2611004201",
        amount: 12_900_000,
        expiresAt: new Date("2026-11-07T03:30:00Z"),
        bookingCode: "PTA-2611-0042",
        locale: "en",
        ipAddress: "203.0.113.5",
      },
      new Date("2026-11-07T03:00:00Z"),
    );
    expect(params).toMatchObject({
      vnp_Amount: "1290000000",
      vnp_CreateDate: "20261107100000",
      vnp_ExpireDate: "20261107103000",
      vnp_Locale: "en",
      vnp_TxnRef: "PTA2611004201",
    });
    const url = new URL(
      paymentUrl(config, { reference: "PTA2611004201", amount: 12_900_000, expiresAt: new Date(), bookingCode: "PTA-2611-0042", locale: "vi", ipAddress: "" }),
    );
    expect(url.origin + url.pathname).toBe(config.paymentUrl);
    expect(verifySignature(Object.fromEntries(url.searchParams), config.hashSecret)).toBe(true);
    expect(vnpayTime(new Date("2026-12-31T17:30:05Z"))).toBe("20270101003005");
  });
});

describe("IPN checks", () => {
  const signed = (patch: Record<string, string> = {}) => {
    const params = { ...ipn, ...patch };
    return { ...params, vnp_SecureHash: sign(params, config.hashSecret) };
  };

  it("needs both result codes for a success", () => {
    expect(isSuccess(ipn)).toBe(true);
    expect(isSuccess({ ...ipn, vnp_TransactionStatus: "02" })).toBe(false);
    expect(isSuccess({ ...ipn, vnp_ResponseCode: "24" })).toBe(false);
  });

  it("answers 97 for a bad signature or another merchant", () => {
    expect(checkIpn(config, { ...ipn, vnp_SecureHash: "00" })).toEqual({ ok: false, rspCode: "97", message: "Invalid Checksum" });
    expect(checkIpn(config, signed({ vnp_TmnCode: "OTHER001" }))).toMatchObject({ ok: false, rspCode: "97" });
  });

  it("turns a valid IPN into an event keyed on the gateway transaction", () => {
    const check = checkIpn(config, signed());
    expect(check).toMatchObject({
      ok: true,
      reportedAmount: 12_900_000,
      event: { eventKey: "PTA2611004201:14012345", reference: "PTA2611004201", amount: 12_900_000, providerTxnId: "14012345", succeeded: true },
    });
    if (check.ok) expect(check.event.payload).not.toHaveProperty("vnp_SecureHash");
    const odd = checkIpn(config, signed({ vnp_Amount: "12345" }));
    expect(odd.ok && odd.reportedAmount).toBe(0);
  });
});
