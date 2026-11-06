import QRCode from "qrcode";

import type { PaymentInstructions, PaymentProvider, PaymentToStart } from "../provider";

/**
 * VietQR bank transfer (NAPAS 247 "QR chuyển tiền", EMVCo merchant-presented format;
 * docs/specs/phase-4-booking-payments.md decision 6). The payload is built here from
 * settings.bank_account, with the payment reference as the transfer memo, and rendered as an SVG on
 * the server: no third-party image service sees the account, amount or memo.
 */

export type BankAccount = { bankBin: string; accountNumber: string; accountHolder: string };

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE over the payload including "6304" (EMVCo). */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(data, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** The memo banks pass through: letters and digits only, at most 25 characters. */
export function transferMemo(reference: string): string {
  return reference.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25);
}

export function vietQrPayload(account: BankAccount, amount: number, memo: string): string {
  if (!/^\d{6}$/.test(account.bankBin)) throw new Error("bank BIN must be 6 digits");
  if (!/^[0-9A-Za-z]{4,30}$/.test(account.accountNumber)) throw new Error("invalid account number");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("amount must be whole dong");
  const beneficiary = tlv("00", account.bankBin) + tlv("01", account.accountNumber);
  const merchantAccount = tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  const body =
    tlv("00", "01") +
    // 12: dynamic QR (one payment, fixed amount).
    tlv("01", "12") +
    tlv("38", merchantAccount) +
    tlv("53", "704") +
    tlv("54", String(amount)) +
    tlv("58", "VN") +
    tlv("62", tlv("08", memo)) +
    "6304";
  return body + crc16(body);
}

/** The QR as an SVG string (server-rendered; no client JavaScript). */
export async function vietQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
}

export function vietQrProvider(account: BankAccount): PaymentProvider {
  return {
    id: "bank_transfer",
    createPayment(payment: PaymentToStart): PaymentInstructions {
      const memo = transferMemo(payment.reference);
      return {
        kind: "transfer",
        payload: vietQrPayload(account, payment.amount, memo),
        bankBin: account.bankBin,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        amount: payment.amount,
        memo,
      };
    },
  };
}
