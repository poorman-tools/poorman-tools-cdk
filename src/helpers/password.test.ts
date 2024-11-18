import { Password } from "./password";

test("Password Hash", () => {
  const hash = Password.hashPassword("password");
  expect(Password.comparePassword(hash, "password")).toBe(true);
  expect(Password.comparePassword(hash, "other")).toBe(false);
});
