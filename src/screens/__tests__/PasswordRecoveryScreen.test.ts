import { isValidRecoveryPassword } from "../PasswordRecoveryScreen";

describe("password recovery validation", () => {
  test("requires a matching password of at least eight characters", () => {
    expect(isValidRecoveryPassword("new-pass", "new-pass")).toBe(true);
    expect(isValidRecoveryPassword("short", "short")).toBe(false);
    expect(isValidRecoveryPassword("new-pass", "different")).toBe(false);
  });
});
