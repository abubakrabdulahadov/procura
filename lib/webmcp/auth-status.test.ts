import { describe, expect, it } from "vitest";
import { webMCPUser } from "./auth-status";

describe("webMCPUser", () => {
  it("maps the persisted session fields to useful WebMCP identity fields", () => {
    expect(
      webMCPUser({
        id: "user-1",
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
      }),
    ).toEqual({ name: "Ada Lovelace", username: "ada" });
  });
});
