import { describe, it, expect } from "vitest";
import { isValidEmailType, getUnsubscribeUrl } from "./email-unsubscribe";

describe("isValidEmailType", () => {
  it("accepts valid email types", () => {
    expect(isValidEmailType("all")).toBe(true);
    expect(isValidEmailType("digest")).toBe(true);
    expect(isValidEmailType("nudge")).toBe(true);
    expect(isValidEmailType("marketing")).toBe(true);
    expect(isValidEmailType("weekly_summary")).toBe(true);
  });

  it("rejects invalid email types", () => {
    expect(isValidEmailType("invalid")).toBe(false);
    expect(isValidEmailType("")).toBe(false);
    expect(isValidEmailType("ALL")).toBe(false);
    expect(isValidEmailType("transactional")).toBe(false);
  });
});

describe("getUnsubscribeUrl", () => {
  it("generates correct URL with default type", () => {
    const url = getUnsubscribeUrl("test-token-123");
    expect(url).toContain("/unsubscribe?token=test-token-123&type=all");
  });

  it("generates correct URL with specific type", () => {
    const url = getUnsubscribeUrl("abc", "digest");
    expect(url).toContain("/unsubscribe?token=abc&type=digest");
  });

  it("includes the app URL", () => {
    const url = getUnsubscribeUrl("token");
    expect(url).toMatch(/^https?:\/\//);
  });
});
