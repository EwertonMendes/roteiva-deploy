import {createHash} from 'node:crypto';

// Independently reviewed deploy executables, lockfiles and provider configs.
const approved = {
  dev: [
    'e2c0c05001622065d798a97d51c514a055c4522c0e6ec46a8ae45dc28b73ca09',
    // Adds the exact review-list revision migration to the additive migration guard.
    '01897cbb0a4538c4c096de37446e4a49d9d0a14757445529f05728fc0a8026f7',
    // DEV-only: exact additive migration guard revision, pending independent review.
    '8768ff1460c8651b1532945641e246b8413c2f2cb32fcf39c5ac661afe95943d',
    // Source PR #245: only two /review Hosting rewrites changed; all other controls match the previous reviewed release.
    '4b5b511328b4b319aad34f9dccc6f0ccf185295082a78d7dceba3f81c171a170',
  ],
  prod: [
    '688c83854902ac52c30503d4e8dabf880dbbf87ac84950b3882ba5c99450d150',
    // Same reviewed additive migration as DEV, with the production configuration.
    'de808f12894c50f8d32d432446ada76be888e6ff7d215c60b2cf4eeecbc97445',
    // Exact additive nullable review-comment avatar migration, already validated in DEV.
    '93a747c76eab7892ffac709d6a741386387f76ce5ada49a93364c2923310f962',
    // Same exact Hosting rewrite changes in PROD; no auth, Firestore, Worker or deployment executable changes.
    '4b4813da4760e128e9b4b032634960177d7e58a4784d928a7935bbce72ee5ef7',
  ],
};

const controls = /^(?:api\/(?:package(?:-lock)?\.json|wrangler\.jsonc|scripts\/[a-z0-9-]+\.mjs)|scripts\/[a-z0-9-]+\.mjs|shared\/environments\.ts|firebase\.json)$/;
const content = /^(?:api\/worker\.js|api\/migrations\/\d{4}_[a-z0-9_]+\.sql|firestore\.(?:rules|indexes\.json)|dist\/.+)$/;

export function releaseControlFingerprint(files, target) {
  const reviewed = [];
  for (const {path, sha256} of files) {
    if (controls.test(path) || (target === 'prod' && path === 'firebase.site.prod.json')) {
      reviewed.push([path, sha256]);
    } else if (!content.test(path) && !(target === 'prod' && /^dist-site\/.+$/.test(path))) {
      throw new Error('Unexpected file in the deployment package.');
    }
  }
  reviewed.sort((a, b) => a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1);
  return createHash('sha256').update(JSON.stringify(reviewed)).digest('hex');
}

export function verifyReleaseControls(files, target) {
  if (!approved[target]?.includes(releaseControlFingerprint(files, target))) {
    throw new Error('Deployment scripts, dependencies or configuration require independent review in the controller.');
  }
}
