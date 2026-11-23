const projects = {
  development: 'roteiva-web-dev',
  production: 'roteiva-web-prod',
};

const required = [
  'firebasehosting.sites.update',
  'datastore.indexes.list',
  'datastore.indexes.create',
  'datastore.indexes.update',
  'datastore.indexes.delete',
  'firebaserules.releases.create',
  'firebaserules.releases.update',
  'firebaserules.rulesets.create',
];

async function granted(project, token) {
  const response = await fetch(
    'https://cloudresourcemanager.googleapis.com/v1/projects/' + project + ':testIamPermissions',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: required }),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error('Firebase IAM permission check returned HTTP ' + response.status + '.');
  return new Set((await response.json()).permissions);
}

async function main() {
  const { ACCESS_TOKEN, FIREBASE_PROJECT_ID, TARGET } = process.env;
  if (!Object.hasOwn(projects, TARGET) || projects[TARGET] !== FIREBASE_PROJECT_ID || !ACCESS_TOKEN) {
    throw new Error('The requested Firebase target or credential is invalid.');
  }
  const otherProject = Object.values(projects).find(project => project !== FIREBASE_PROJECT_ID);
  const [current, other] = await Promise.all([
    granted(FIREBASE_PROJECT_ID, ACCESS_TOKEN),
    granted(otherProject, ACCESS_TOKEN),
  ]);
  const missing = required.filter(permission => !current.has(permission));
  if (missing.length) throw new Error('Missing Firebase permissions: ' + missing.join(', '));
  if (other.size) throw new Error('The Firebase identity has deployment permissions in the other environment.');
  console.log('Verified Firebase deployment permissions and isolation for ' + FIREBASE_PROJECT_ID + '.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
