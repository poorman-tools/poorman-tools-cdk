import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export class Password {
  static hashPassword(password: string) {
    const salt = randomBytes(16);
    const buf = scryptSync(password, salt, 64) as Buffer;
    return `${salt.toString("hex")}\$${buf.toString("hex")}`;
  }

  static comparePassword(
    storedPassword: string,
    suppliedPassword: string
  ): boolean {
    // split() returns array
    const [salt, hashedPassword] = storedPassword.split("$");

    // we need to pass buffer values to timingSafeEqual
    const saltBytes = Buffer.from(salt, "hex");
    const hashedBytes = Buffer.from(hashedPassword, "hex");

    // we hash the new sign-in password
    const suppliedPasswordBuf = scryptSync(
      suppliedPassword,
      saltBytes,
      64
    ) as Buffer;

    // compare the new supplied password with the stored hashed password
    return timingSafeEqual(hashedBytes, suppliedPasswordBuf);
  }
}
