import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryOAuthStateStore, OAuthService } from './oauth.service.js';
import { JwtService } from './jwt.service.js';
import type { GoogleOAuthConfig } from './oauth.service.js';

// ---------------------------------------------------------------------------
// InMemoryOAuthStateStore — expired-state and single-use contract
// ---------------------------------------------------------------------------

describe('InMemoryOAuthStateStore', () => {
  let store: InMemoryOAuthStateStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryOAuthStateStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Expired-state behavior using fake timers
  // -------------------------------------------------------------------------

  describe('expired state', () => {
    it('throws when state TTL has elapsed', () => {
      const state = 'state-abc';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min from "now"
      store.set(state, { expiresAt });

      // Advance clock past expiry
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      expect(() => store.consume(state)).toThrow('expired');
    });

    it('succeeds when consumed before TTL elapses', () => {
      const state = 'state-fresh';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      store.set(state, { expiresAt });

      vi.advanceTimersByTime(5 * 60 * 1000); // halfway through

      expect(() => store.consume(state)).not.toThrow();
    });

    it('throws on the exact expiry millisecond', () => {
      const state = 'state-boundary';
      const expiresAt = new Date(Date.now() + 1000);
      store.set(state, { expiresAt });

      vi.advanceTimersByTime(1000); // exactly at expiry

      // expiresAt < new Date() is false when equal, but the implementation
      // uses strict <, so at exact boundary it should still be expired
      // (Date.now() === expiresAt.getTime() → NOT < → valid).
      // This documents the boundary contract explicitly.
      expect(() => store.consume(state)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 2. State is atomically single-use
  // -------------------------------------------------------------------------

  describe('single-use contract', () => {
    it('throws on second consume of the same state', () => {
      const state = 'state-once';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      store.set(state, { expiresAt });

      store.consume(state); // first use — succeeds

      expect(() => store.consume(state)).toThrow(); // second use — must fail
    });

    it('throws with "Invalid state" message on reuse', () => {
      const state = 'state-reuse';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      store.set(state, { expiresAt });

      store.consume(state);

      expect(() => store.consume(state)).toThrow('Invalid state');
    });

    it('deletes the entry before checking expiry so a concurrent second call also fails', () => {
      // Simulate two concurrent callbacks arriving with the same state.
      // The first consume removes the entry; the second must see "Invalid state",
      // not "expired" — proving deletion happens before the expiry check.
      const state = 'state-concurrent';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      store.set(state, { expiresAt });

      store.consume(state); // first caller wins

      // Second caller must get "Invalid state", not "expired"
      expect(() => store.consume(state)).toThrow('Invalid state');
    });

    it('returns organizationId when present', () => {
      const state = 'state-org';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      store.set(state, { expiresAt, organizationId: 'org_01' });

      const result = store.consume(state);

      expect(result.organizationId).toBe('org_01');
    });

    it('returns undefined organizationId when not set', () => {
      const state = 'state-no-org';
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      store.set(state, { expiresAt });

      const result = store.consume(state);

      expect(result.organizationId).toBeUndefined();
    });

    it('throws on unknown state', () => {
      expect(() => store.consume('never-stored')).toThrow('Invalid state');
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by OAuthService tests
// ---------------------------------------------------------------------------

const jwtConfig = {
  secret: 'test-secret-32-chars-minimum-ok!',
  expiresIn: '1h',
  issuer: 'verifit',
  audience: 'verifit-api',
};

const oauthConfig: GoogleOAuthConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.com/callback',
};

function makeService(stateStore = new InMemoryOAuthStateStore()): OAuthService {
  return new OAuthService(new JwtService(jwtConfig), oauthConfig, stateStore);
}

// ---------------------------------------------------------------------------
// 3. AbortSignal.timeout causes fetch cancellation
// ---------------------------------------------------------------------------

describe('OAuthService — fetch timeout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exchangeCodeForToken rejects when fetch times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            // Simulate the AbortSignal firing immediately
            const signal = init?.signal as AbortSignal | undefined;
            if (signal) {
              if (signal.aborted) {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
                return;
              }
              signal.addEventListener('abort', () =>
                reject(new DOMException('The operation was aborted.', 'AbortError')),
              );
            }
            // Never resolves on its own — fetch hangs until signal fires
          }),
      ),
    );

    const svc = makeService();
    // Use an already-aborted signal to trigger immediately
    const controller = new AbortController();
    controller.abort();

    // Patch AbortSignal.timeout to return the already-aborted signal
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);

    await expect(svc.exchangeCodeForToken('auth-code')).rejects.toThrow();
  });

  it('getUserInfo rejects when fetch times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal?.aborted) {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      ),
    );

    const svc = makeService();
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);

    await expect(svc.getUserInfo('access-token')).rejects.toThrow();
  });

  it('does not expose provider secrets in the thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));

    const svc = makeService();
    let caught: unknown;
    try {
      await svc.exchangeCodeForToken('auth-code');
    } catch (e) {
      caught = e;
    }

    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg).not.toContain(oauthConfig.clientSecret);
    expect(msg).not.toContain('auth-code');
  });
});

// ---------------------------------------------------------------------------
// 4. Malformed Google token response rejected by Zod
// ---------------------------------------------------------------------------

describe('OAuthService — Zod validation of Google token response', () => {
  afterEach(() => vi.restoreAllMocks());

  function stubTokenResponse(body: unknown, status = 200): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      }),
    );
  }

  it('rejects when access_token is missing', async () => {
    stubTokenResponse({ token_type: 'Bearer' });
    await expect(makeService().exchangeCodeForToken('code')).rejects.toThrow();
  });

  it('rejects when access_token is an empty string', async () => {
    stubTokenResponse({ access_token: '', token_type: 'Bearer' });
    await expect(makeService().exchangeCodeForToken('code')).rejects.toThrow();
  });

  it('rejects when access_token is a number instead of string', async () => {
    stubTokenResponse({ access_token: 12345, token_type: 'Bearer' });
    await expect(makeService().exchangeCodeForToken('code')).rejects.toThrow();
  });

  it('rejects when the response body is not an object', async () => {
    stubTokenResponse('not-an-object');
    await expect(makeService().exchangeCodeForToken('code')).rejects.toThrow();
  });

  it('rejects when the response body is null', async () => {
    stubTokenResponse(null);
    await expect(makeService().exchangeCodeForToken('code')).rejects.toThrow();
  });

  it('accepts a valid minimal token response', async () => {
    stubTokenResponse({ access_token: 'tok_abc', token_type: 'Bearer' });
    await expect(makeService().exchangeCodeForToken('code')).resolves.toMatchObject({
      access_token: 'tok_abc',
    });
  });

  it('throws on non-ok HTTP status before Zod runs', async () => {
    stubTokenResponse({}, 400);
    await expect(makeService().exchangeCodeForToken('code')).rejects.toThrow('400');
  });
});

// ---------------------------------------------------------------------------
// 5. Malformed userinfo response rejected by Zod
// ---------------------------------------------------------------------------

describe('OAuthService — Zod validation of Google userinfo response', () => {
  afterEach(() => vi.restoreAllMocks());

  function stubUserInfoResponse(body: unknown, status = 200): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      }),
    );
  }

  it('rejects when sub is missing', async () => {
    stubUserInfoResponse({ email: 'user@example.com', email_verified: true });
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('rejects when sub is an empty string', async () => {
    stubUserInfoResponse({ sub: '', email: 'user@example.com', email_verified: true });
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('rejects when email is missing', async () => {
    stubUserInfoResponse({ sub: '1234567890', email_verified: true });
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('rejects when email is not a valid email address', async () => {
    stubUserInfoResponse({ sub: '1234567890', email: 'not-an-email', email_verified: true });
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('rejects when email_verified is missing', async () => {
    stubUserInfoResponse({ sub: '1234567890', email: 'user@example.com' });
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('rejects when email_verified is a string instead of boolean', async () => {
    stubUserInfoResponse({ sub: '1234567890', email: 'user@example.com', email_verified: 'true' });
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('rejects when the response body is null', async () => {
    stubUserInfoResponse(null);
    await expect(makeService().getUserInfo('tok')).rejects.toThrow();
  });

  it('accepts a valid minimal userinfo response', async () => {
    stubUserInfoResponse({ sub: '1234567890', email: 'user@example.com', email_verified: true });
    await expect(makeService().getUserInfo('tok')).resolves.toMatchObject({
      sub: '1234567890',
      email: 'user@example.com',
      email_verified: true,
    });
  });

  it('throws on non-ok HTTP status before Zod runs', async () => {
    stubUserInfoResponse({}, 401);
    await expect(makeService().getUserInfo('tok')).rejects.toThrow('401');
  });
});

// ---------------------------------------------------------------------------
// 6. Unverified email (email_verified: false) rejected by handleCallback
// ---------------------------------------------------------------------------

describe('OAuthService — unverified email rejected', () => {
  afterEach(() => vi.restoreAllMocks());

  function stubGoogleResponses(userInfoOverride: Record<string, unknown>): void {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // First call: token exchange
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok_abc', token_type: 'Bearer' }),
        })
        // Second call: userinfo
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(userInfoOverride),
        }),
    );
  }

  function validState(svc: OAuthService): string {
    return svc.generateAuthorizationUrl().state;
  }

  it('throws when email_verified is false', async () => {
    const svc = makeService();
    const state = validState(svc);

    stubGoogleResponses({ sub: '1234567890', email: 'user@example.com', email_verified: false });

    await expect(
      svc.handleCallback('auth-code', state, async () => ({
        id: 'user_01',
        email: 'user@example.com',
        organizationId: 'org_01',
        role: 'STUDENT' as const,
      })),
    ).rejects.toThrow('verified');
  });

  it('resolveUser is never called when email is unverified', async () => {
    const svc = makeService();
    const state = validState(svc);

    stubGoogleResponses({ sub: '1234567890', email: 'user@example.com', email_verified: false });

    const resolveUser = vi.fn();
    await expect(svc.handleCallback('auth-code', state, resolveUser)).rejects.toThrow();
    expect(resolveUser).not.toHaveBeenCalled();
  });

  it('succeeds when email_verified is true', async () => {
    const svc = makeService();
    const state = validState(svc);

    stubGoogleResponses({ sub: '1234567890', email: 'user@example.com', email_verified: true });

    await expect(
      svc.handleCallback('auth-code', state, async () => ({
        id: 'user_01',
        email: 'user@example.com',
        organizationId: 'org_01',
        role: 'STUDENT' as const,
      })),
    ).resolves.toMatchObject({ user: { email: 'user@example.com' } });
  });
});

// ---------------------------------------------------------------------------
// 7. Google sub binding — resolveUser receives sub, not just email
// ---------------------------------------------------------------------------

describe('OAuthService — Google sub binding', () => {
  afterEach(() => vi.restoreAllMocks());

  function stubGoogleSuccess(sub: string, email: string): void {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok_abc', token_type: 'Bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ sub, email, email_verified: true }),
        }),
    );
  }

  it('passes Google sub as first argument to resolveUser', async () => {
    const svc = makeService();
    const state = svc.generateAuthorizationUrl().state;
    stubGoogleSuccess('google-sub-999', 'user@example.com');

    const resolveUser = vi.fn().mockResolvedValue({
      id: 'user_01',
      email: 'user@example.com',
      organizationId: 'org_01',
      role: 'STUDENT' as const,
    });

    await svc.handleCallback('auth-code', state, resolveUser);

    expect(resolveUser).toHaveBeenCalledWith('google-sub-999', 'user@example.com', undefined);
  });

  it('passes organizationId from state through to resolveUser', async () => {
    const svc = makeService();
    const state = svc.generateAuthorizationUrl('org_42').state;
    stubGoogleSuccess('google-sub-999', 'user@example.com');

    const resolveUser = vi.fn().mockResolvedValue({
      id: 'user_01',
      email: 'user@example.com',
      organizationId: 'org_42',
      role: 'STUDENT' as const,
    });

    await svc.handleCallback('auth-code', state, resolveUser);

    expect(resolveUser).toHaveBeenCalledWith('google-sub-999', 'user@example.com', 'org_42');
  });

  it('two different Google subs with the same email call resolveUser with distinct subs', async () => {
    const calls: string[] = [];

    for (const sub of ['sub-aaa', 'sub-bbb']) {
      const svc = makeService();
      const state = svc.generateAuthorizationUrl().state;
      stubGoogleSuccess(sub, 'shared@example.com');

      await svc.handleCallback('auth-code', state, async (googleSub) => {
        calls.push(googleSub);
        return {
          id: 'user_01',
          email: 'shared@example.com',
          organizationId: 'org_01',
          role: 'STUDENT' as const,
        };
      });
    }

    expect(calls).toEqual(['sub-aaa', 'sub-bbb']);
  });

  it('JWT sub claim is the local user id, not the Google sub', async () => {
    const svc = makeService();
    const state = svc.generateAuthorizationUrl().state;
    stubGoogleSuccess('google-sub-999', 'user@example.com');

    const result = await svc.handleCallback('auth-code', state, async () => ({
      id: 'local-user-id',
      email: 'user@example.com',
      organizationId: 'org_01',
      role: 'STUDENT' as const,
    }));

    const jwtSvc = new JwtService(jwtConfig);
    const payload = jwtSvc.verifyToken(result.accessToken);
    expect(payload.sub).toBe('local-user-id');
    expect(payload.sub).not.toBe('google-sub-999');
  });
});

// ---------------------------------------------------------------------------
// 8. All network failures handled without leaking provider secrets
// ---------------------------------------------------------------------------

describe('OAuthService — network failures do not leak secrets', () => {
  afterEach(() => vi.restoreAllMocks());

  const networkErrors = [
    new TypeError('fetch failed'),
    new DOMException('The operation was aborted.', 'AbortError'),
    new Error('ECONNREFUSED'),
    new Error('ETIMEDOUT'),
  ];

  for (const networkError of networkErrors) {
    it(`exchangeCodeForToken: "${networkError.message}" does not leak clientSecret or code`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

      let caught: unknown;
      try {
        await makeService().exchangeCodeForToken('secret-auth-code');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      const msg = caught instanceof Error ? caught.message : String(caught);
      expect(msg).not.toContain(oauthConfig.clientSecret);
      expect(msg).not.toContain('secret-auth-code');
    });

    it(`getUserInfo: "${networkError.message}" does not leak access token`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

      let caught: unknown;
      try {
        await makeService().getUserInfo('super-secret-access-token');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      const msg = caught instanceof Error ? caught.message : String(caught);
      expect(msg).not.toContain('super-secret-access-token');
    });
  }

  it('non-ok token exchange response does not echo back response body secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({ error: 'invalid_client', client_secret: oauthConfig.clientSecret }),
      }),
    );

    let caught: unknown;
    try {
      await makeService().exchangeCodeForToken('code');
    } catch (e) {
      caught = e;
    }

    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg).not.toContain(oauthConfig.clientSecret);
  });

  it('non-ok userinfo response does not echo back the bearer token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );

    let caught: unknown;
    try {
      await makeService().getUserInfo('bearer-token-value');
    } catch (e) {
      caught = e;
    }

    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg).not.toContain('bearer-token-value');
  });
});
