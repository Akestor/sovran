import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { type TokenService } from '@sovran/domain';

interface JwtKey {
  kid: string;
  secret: Uint8Array;
}

interface TokenServiceConfig {
  activeKid: string;
  keys: Array<{ kid: string; secret: string }>;
  accessTokenTtl: string;
  issuer?: string;
}

export class JoseTokenService implements TokenService {
  private readonly keys: Map<string, JwtKey>;
  private readonly activeKey: JwtKey;
  private readonly accessTokenTtl: string;
  private readonly issuer: string;

  constructor(config: TokenServiceConfig) {
    this.keys = new Map();
    for (const key of config.keys) {
      this.keys.set(key.kid, {
        kid: key.kid,
        secret: new TextEncoder().encode(key.secret),
      });
    }

    const active = this.keys.get(config.activeKid);
    if (!active) {
      throw new Error(`Active JWT key '${config.activeKid}' not found in keys`);
    }
    this.activeKey = active;
    this.accessTokenTtl = config.accessTokenTtl;
    this.issuer = config.issuer ?? 'sovran';
  }

  async signAccessToken(userId: string): Promise<string> {
    return new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'HS256', kid: this.activeKey.kid })
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setExpirationTime(`${this.accessTokenTtl}s`)
      .sign(this.activeKey.secret);
  }

  async verifyAccessToken(token: string): Promise<{ userId: string }> {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        const kid = header.kid;
        if (kid) {
          const key = this.keys.get(kid);
          if (key) return key.secret;
        }
        for (const key of this.keys.values()) {
          return key.secret;
        }
        throw new Error('No valid JWT key found');
      },
      {
        issuer: this.issuer,
        algorithms: ['HS256'],
      },
    );

    const sub = (payload as JWTPayload).sub;
    if (!sub) {
      throw new Error('JWT missing sub claim');
    }

    return { userId: sub };
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
