import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SOURCE = 'EwertonMendes/roteiva-web';
const SOURCE_ID = 1_422_595_328;
const OWNER_ID = 33_728_924;
const BRANCH = 'master';
const WORKFLOW_ID = 428_216_408;
const WORKFLOW_PATH = '.github/workflows/qa-production-gates.yml';
const WORKFLOW_BLOBS = new Set([
  'e251344637b6edecac7469244d745272a9a68dd9',
  '9ca5ebbc1c6efbf2a3910efd65e853c4b4af4d1d',
  '02af8c7ee7e52db79c1c1ac88972f8e40f77e591',
  'd3cc0aa27f3a97d408912c270db5630a7539197c',
  '3df528eb74197bc8f9715d4069956c2761223bf5',
]);

export function isReviewedGateWorkflow(sha) {
  return WORKFLOW_BLOBS.has(sha);
}
const REQUIRED_JOBS = [
  '01 - Quality, security & production build',
  '02 - E2E Access, billing & tenant isolation',
  '03 - E2E Projects, finance, Drive & approvals',
];

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

export async function verifySource({ api, requestedSha, publicProbe }) {
  requireThat(/^[0-9a-f]{40}$/.test(requestedSha ?? ''), 'Supply the full lowercase release SHA.');
  const repository = await api('');
  requireThat(
    repository.id === SOURCE_ID && repository.full_name === SOURCE &&
      repository.owner?.id === OWNER_ID && repository.default_branch === BRANCH &&
      typeof repository.private === 'boolean',
    'Unexpected source repository or owner.',
  );
  requireThat(!publicProbe || !repository.private, 'The anonymous probe is restricted to a public source.');
  const branch = await api('/branches/master');
  requireThat(branch.commit?.sha === requestedSha, 'The requested SHA is not the current master.');

  const prs = await api('/commits/' + requestedSha + '/pulls?per_page=30');
  const related = prs.find(pr => pr.merge_commit_sha === requestedSha && pr.base?.ref === BRANCH &&
    pr.base?.repo?.id === SOURCE_ID && pr.head?.repo?.id === SOURCE_ID);
  requireThat(Number.isSafeInteger(related?.number), 'The SHA has no merged same-repository PR on master.');
  const pr = await api('/pulls/' + related.number);
  requireThat(
    pr.merged === true && pr.merge_commit_sha === requestedSha && pr.merged_by?.id === OWNER_ID &&
      pr.base?.ref === BRANCH && pr.base?.repo?.id === SOURCE_ID && pr.head?.repo?.id === SOURCE_ID,
    'The source PR does not match the approved merge policy.',
  );

  const workflow = await api('/actions/workflows/' + WORKFLOW_ID);
  requireThat(workflow.id === WORKFLOW_ID && workflow.path === WORKFLOW_PATH && workflow.state === 'active',
    'The approved release workflow is unavailable.');
  const revision = await api('/contents/' + WORKFLOW_PATH + '?ref=' + requestedSha);
  requireThat(isReviewedGateWorkflow(revision.sha), 'The release workflow implementation requires controller review.');

  const filters = new URLSearchParams({ branch: BRANCH, event: 'push', head_sha: requestedSha, per_page: '10' });
  const runs = await api('/actions/workflows/' + WORKFLOW_ID + '/runs?' + filters);
  const run = runs.workflow_runs?.find(candidate => candidate.head_sha === requestedSha &&
    candidate.event === 'push' && candidate.head_branch === BRANCH && candidate.workflow_id === WORKFLOW_ID &&
    candidate.head_repository?.id === SOURCE_ID && candidate.repository?.id === SOURCE_ID);
  requireThat(Number.isSafeInteger(run?.id) && run.status === 'completed' && run.conclusion === 'success',
    'The latest master-push checks for this SHA have not succeeded.');

  const result = await api('/actions/runs/' + run.id + '/jobs?filter=latest&per_page=100');
  requireThat(REQUIRED_JOBS.every(name => {
    const jobs = result.jobs?.filter(job => job.name === name);
    return jobs?.length === 1 && jobs[0].status === 'completed' && jobs[0].conclusion === 'success';
  }), 'A required release job did not finish successfully.');

  const current = await api('/branches/master');
  requireThat(current.commit?.sha === requestedSha, 'Master changed during validation.');
  return { sha: requestedSha, pullRequest: related.number, gateRun: run.id, privateSource: repository.private };
}

async function run() {
  const token = process.env.SOURCE_READ_TOKEN;
  const publicProbe = process.env.PUBLIC_PROBE === 'true';
  requireThat(Boolean(token) || publicProbe, 'SOURCE_READ_TOKEN is missing from the protected environment.');
  const api = async path => {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch('https://api.github.com/repos/' + SOURCE + path,
      { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('GitHub source verification failed (HTTP ' + response.status + ').');
    return response.json();
  };
  const receipt = await verifySource({ requestedSha: process.env.RELEASE_SHA, publicProbe, api });
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      'Verified source SHA `' + receipt.sha + '` with PR #' + receipt.pullRequest +
      ' and gate run #' + receipt.gateRun + '.\n');
  }
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
