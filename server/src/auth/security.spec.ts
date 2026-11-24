import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { requireJwtSecret } from './jwt-secret';
import { generateTemporaryPassword } from './passwords';
import { JwtAuthGuard, PASSWORD_CHANGE_REQUIRED } from './guards/jwt-auth.guard';

describe('requireJwtSecret', () => {
  it('rejects a missing secret instead of falling back', () => {
    expect(() => requireJwtSecret(undefined)).toThrow(/not set/);
    expect(() => requireJwtSecret('')).toThrow(/not set/);
  });

  it('rejects placeholders that appeared in the source', () => {
    expect(() => requireJwtSecret('crm-super-secret-jwt-key-change-in-production')).toThrow(/placeholder/);
    expect(() => requireJwtSecret('fallback-secret')).toThrow(/placeholder/);
  });

  it('rejects short secrets and accepts long random ones', () => {
    expect(() => requireJwtSecret('a'.repeat(31))).toThrow(/too short/);
    const good = 'f'.repeat(96);
    expect(requireJwtSecret(good)).toBe(good);
  });
});

describe('generateTemporaryPassword', () => {
  it('produces four groups of four unambiguous characters', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){3}$/);
  });

  it('is different every time', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(200);
  });
});

describe('JwtAuthGuard pending password check', () => {
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  const guardWith = (allowed: boolean | undefined) => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(allowed);
    return new JwtAuthGuard(reflector);
  };

  it('lets a normal user through', () => {
    const user = { id: 'u1', mustChangePassword: false };
    expect(guardWith(undefined).handleRequest(null, user, null, context)).toBe(user);
  });

  it('blocks a user who must change their password', () => {
    expect.assertions(2);
    try {
      guardWith(undefined).handleRequest(null, { id: 'u1', mustChangePassword: true }, null, context);
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({ code: PASSWORD_CHANGE_REQUIRED });
    }
  });

  it('allows routes marked as usable before the change', () => {
    const user = { id: 'u1', mustChangePassword: true };
    expect(guardWith(true).handleRequest(null, user, null, context)).toBe(user);
  });

  it('rejects requests with no user', () => {
    expect(() => guardWith(undefined).handleRequest(null, false, null, context)).toThrow(UnauthorizedException);
  });
});
