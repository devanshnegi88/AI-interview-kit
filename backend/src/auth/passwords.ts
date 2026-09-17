import bcrypt from "bcryptjs";
import { env } from "../common/env";

/** Dummy hash so a missing-user login still spends a compare (timing). */
const DUMMY_HASH = bcrypt.hashSync("timing-dummy-not-a-real-password", 4);

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.bcryptRounds);
}

/** Run a compare even when no user exists so login timing does not leak accounts. */
export async function verifyPasswordOrDummy(
  plaintext: string,
  passwordHash: string | undefined,
): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(plaintext, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plaintext, passwordHash);
}
