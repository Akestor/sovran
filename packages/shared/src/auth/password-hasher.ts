import { hash, verify } from '@node-rs/argon2';
import { type PasswordHasher } from '@sovran/domain';

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    if (passwordHash === '!') return false;
    try {
      return await verify(passwordHash, password, ARGON2_OPTIONS);
    } catch {
      return false;
    }
  }
}
