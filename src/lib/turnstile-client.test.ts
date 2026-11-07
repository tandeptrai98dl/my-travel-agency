import { describe, expect, it } from "vitest";

import { TurnstileGate } from "./turnstile-client";

describe("TurnstileGate", () => {
  it("lets a submit through at once when a token is there", () => {
    const gate = new TurnstileGate();
    expect(gate.receive("token")).toBe(false);
    expect(gate.allowSubmit()).toBe(true);
  });

  it("holds an early submit and lets the re-submit through as soon as the token arrives", () => {
    const gate = new TurnstileGate();
    expect(gate.allowSubmit()).toBe(false);
    // The token callback and the re-submit happen in the same tick, before any re-render.
    expect(gate.receive("token")).toBe(true);
    expect(gate.allowSubmit()).toBe(true);
  });

  it("does not re-submit for a token nobody waited for", () => {
    const gate = new TurnstileGate();
    gate.allowSubmit();
    gate.receive("first");
    expect(gate.receive("second")).toBe(false);
  });

  it("waits again after the token was used or expired", () => {
    const gate = new TurnstileGate();
    gate.receive("token");
    gate.clear();
    expect(gate.allowSubmit()).toBe(false);
    expect(gate.receive("fresh")).toBe(true);
  });

  it("drops a waiting submit when the widget fails", () => {
    const gate = new TurnstileGate();
    gate.allowSubmit();
    gate.fail();
    expect(gate.receive("late")).toBe(false);
  });
});
