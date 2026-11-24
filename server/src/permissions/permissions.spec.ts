import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALL_PERMISSIONS,
  catalog,
  coversAll,
  effectivePermissions,
  normalizePermissions,
  parseStoredPermissions,
} from './permissions';
import { PermissionsGuard } from './permissions.guard';
import { hideUnviewable } from './visibility';

describe('permission helpers', () => {
  it('drops unknown keys and duplicates, and adds implied view permissions', () => {
    expect(normalizePermissions(['tasks.delete', 'tasks.delete', 'bogus', 42, 'datamodel.edit'])).toEqual([
      'tasks.view',
      'tasks.delete',
      'datamodel.view',
      'datamodel.edit',
    ]);
    expect(normalizePermissions('not a list')).toEqual([]);
  });

  it('treats unreadable stored permissions as none', () => {
    expect(parseStoredPermissions('{broken')).toEqual([]);
    expect(parseStoredPermissions(null)).toEqual([]);
  });

  it('gives Administrator every permission, whatever is stored', () => {
    expect(effectivePermissions({ id: 'administrator', permissions: '[]' })).toEqual(ALL_PERMISSIONS);
    expect(effectivePermissions({ id: 'other', permissions: '["people.view"]' })).toEqual(['people.view']);
    expect(effectivePermissions(null)).toEqual([]);
  });

  it('checks whether one set covers another', () => {
    expect(coversAll(['a', 'b'], ['a'])).toBe(true);
    expect(coversAll(['a'], ['a', 'b'])).toBe(false);
  });

  it('describes every permission in the catalog', () => {
    const c = catalog();
    const keys = [...c.areas.flatMap((a) => a.permissions.map((p) => p.key)), ...c.admin.map((p) => p.key)];
    expect(keys.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('empties linked lists the user cannot view', () => {
    const record = { id: '1', deals: [{ id: 'd' }], people: [{ id: 'c' }] };
    expect(hideUnviewable(record, ['people.view'], { deals: 'deals.view', people: 'people.view' })).toEqual({
      id: '1',
      deals: [],
      people: [{ id: 'c' }],
    });
  });
});

describe('PermissionsGuard', () => {
  const contextFor = (permissions: string[]) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
    }) as unknown as ExecutionContext;

  const guardWith = (requirement: unknown) => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requirement);
    return new PermissionsGuard(reflector);
  };

  it('allows routes with no requirement', () => {
    expect(guardWith(undefined).canActivate(contextFor([]))).toBe(true);
  });

  it('requires every permission in allOf', () => {
    const guard = guardWith({ allOf: ['data.export', 'people.view'] });
    expect(guard.canActivate(contextFor(['data.export', 'people.view']))).toBe(true);
    expect(() => guard.canActivate(contextFor(['data.export']))).toThrow(ForbiddenException);
  });

  it('requires at least one permission in anyOf', () => {
    const guard = guardWith({ anyOf: ['users.manage', 'profiles.manage'] });
    expect(guard.canActivate(contextFor(['profiles.manage']))).toBe(true);
    expect(() => guard.canActivate(contextFor(['people.view']))).toThrow(ForbiddenException);
  });
});
