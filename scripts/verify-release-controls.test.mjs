import assert from 'node:assert/strict';
import test from 'node:test';
import {releaseControlFingerprint, verifyReleaseControls} from './verify-release-controls.mjs';

const file = (path, sha256 = 'a'.repeat(64)) => ({path, sha256});

test('keeps approved runtime files separate from deployment controls', () => {
  const controls = [file('api/package-lock.json'), file('api/scripts/guard-secrets.mjs'), file('firebase.json')];
  const content = [file('api/worker.js'), file('api/migrations/0045_additive.sql'), file('dist/assets/application.js')];
  assert.equal(releaseControlFingerprint([...content, ...controls], 'dev'), releaseControlFingerprint(controls.reverse(), 'dev'));
  assert.notEqual(releaseControlFingerprint(controls.slice(1), 'dev'), releaseControlFingerprint(controls, 'dev'));
});

test('rejects hidden executables, changed controls and production-only content in DEV', () => {
  for (const path of ['api/.npmrc', 'api/node_modules/wrangler/x.js', 'shared/private.mjs', 'firebase.site.prod.json', 'dist-site/index.html']) {
    assert.throws(() => releaseControlFingerprint([file(path)], 'dev'), /Unexpected file/);
  }
  for (const target of ['dev', 'prod']) {
    assert.throws(() => verifyReleaseControls([file('firebase.json', 'b'.repeat(64))], target), /independent review/);
  }
});
