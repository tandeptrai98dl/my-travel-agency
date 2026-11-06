import { describe, expect, it } from "vitest";

import { operationOf } from "./audit.schemas";

describe("operationOf", () => {
  it("reads the operation from trigger actions", () => {
    expect(operationOf("tours.update")).toBe("update");
    expect(operationOf("tour_translations.insert")).toBe("insert");
    expect(operationOf("settings.delete")).toBe("delete");
    expect(operationOf("subscribers.export")).toBeNull();
  });
});
