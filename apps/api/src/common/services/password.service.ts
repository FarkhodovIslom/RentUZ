import { Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';

/** Argon2id password hashing (§53). */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, { type: 2 }); // 2 = argon2id
  }

  verify(passwordHash: string, plain: string): Promise<boolean> {
    return verify(passwordHash, plain);
  }
}
