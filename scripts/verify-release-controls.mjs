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
    // Source PR #250: DEV project deletion Queue and DLQ bindings only.
    '1e0ca9b9c6e271105ae79fbea2f708f89b722456b56d25ee1610f788e9ced1ad',
    // Adds isolated PROD Queue bindings and pins the additive deletion checkpoint/budget migration.
    '5aa99e06691964172ac4a4b5603de56196d30923a83077f57ba80274f9c3a1a9',
    // Source PR #257: invocation logs at 100%, query-string redaction and traces sampled at 1%.
    'a5d1d5b44756cbddc17b6f646575eef0577529da9a500e5e3ef55f40737bed40',
    // Source PR #261 DEV only: exact additive migration guard for 0049_client_deletion.sql.
    'c88d52b547f651d9901d74b0a149e8c999430aa4dfb5e25dae58a529378392ed',
    // Source PR #262 DEV only: exact additive migration guard for 0050.
    '4000ef5fd3b376c0d70d91d51aab637e85c1375f89afe6ce143b668067e11120',
  ],
  prod: [
    '688c83854902ac52c30503d4e8dabf880dbbf87ac84950b3882ba5c99450d150',
    // Same reviewed additive migration as DEV, with the production configuration.
    'de808f12894c50f8d32d432446ada76be888e6ff7d215c60b2cf4eeecbc97445',
    // Exact additive nullable review-comment avatar migration, already validated in DEV.
    '93a747c76eab7892ffac709d6a741386387f76ce5ada49a93364c2923310f962',
    // Same exact Hosting rewrite changes in PROD; no auth, Firestore, Worker or deployment executable changes.
    '4b4813da4760e128e9b4b032634960177d7e58a4784d928a7935bbce72ee5ef7',
    // Source PR #250 adds DEV-only queue bindings to the shared Wrangler file.
    '6eb01d59689c3294235c4cc255232a4eeae79768b192b9b9b6e9bccf39d1eb88',
    // Same exact controls as DEV with the reviewed production Hosting configuration.
    '5eca70bc33658d05662984a1102ce26e3bfbc5ad39f72f06b2d7501b9b564fd7',
    // Source PR #257: same telemetry controls as DEV, with reviewed production Hosting config.
    'f423c05f178cb3cf64263e6ecf49408ac6a6652cc237f55d8e6bb743bfb8bbda',
    // Source PR #261: exact independently reviewed 0049 additive migration guard, production package.
    '5ecfc89583fc226d5ab312b70c830b7ec917f70ae89c83d7b72b0c66959f7568',
    // Source PR #262: exact reviewed 0050 additive migration guard, production package.
    '91da2268789961837d72c3b5746bc7a414f9a1e7b6408924f22e63a8d20ff4e9',
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
