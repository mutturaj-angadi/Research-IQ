import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCan, can, PERMISSIONS, type Permission } from '../../lib/auth/policy';

const ADMIN_ONLY: Permission[] = ['papers:upload', 'papers:process', 'categories:manage', 'users:read', 'analytics:system'];
const SHARED: Permission[] = ['papers:read', 'search:run', 'qa:ask', 'evidence:read', 'saved:manage', 'history:read-own', 'dashboard:own'];

describe('authorization matrix', () => {
  it('researchers can use research features but no admin feature', () => {
    for (const p of SHARED) assert.equal(can(['RESEARCHER'], p), true, p);
    for (const p of ADMIN_ONLY) assert.equal(can(['RESEARCHER'], p), false, p);
  });

  it('admins can use every feature', () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) assert.equal(can(['ADMIN'], p), true, p);
  });

  it('users without roles can do nothing', () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) assert.equal(can([], p), false, p);
  });

  it('assertCan throws FORBIDDEN', () => {
    assert.throws(() => assertCan(['RESEARCHER'], 'users:read'), { code: 'FORBIDDEN' });
  });
});
