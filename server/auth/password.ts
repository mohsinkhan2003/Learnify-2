import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;
// Hash of a random value, compared against when the account does not exist so that
// "unknown email" and "wrong password" take the same time (no user enumeration by timing).
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("learnify-timing-equaliser", SALT_ROUNDS));

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, getDummyHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}
