import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifySource } from './verify-source.mjs';

const sha = '3b8439d02baf8b8d1b946b2336776043f61a1700';
const owner = { id: 33728924 };
const repository = { id: 1422595328 };
const workflowId = 428216408;
const workflow = '.github/workflows/qa-production-gates.yml';
const blob = 'e251344637b6edecac7469244d745272a9a68dd9';
const jobNames = [
  '01 - Quality, security & production build',
  '02 - E2E Access, billing & tenant isolation',
  '03 - E2E Projects, finance, Drive & approvals',
];
const pullRequest = {
  number: 222,
  merged: true,
  merged_by: owner,
  merge_commit_sha: sha,
  base: { ref: 'master', repo: repository },
  head: { repo: repository },
};

function fixture({ privateSource = true, jobConclusion = 'success', event = 'push',
  sourceBlob = blob, names = jobNames, merger = owner, branchSha = sha, finalSha = branchSha } = {}) {
  let reads = 0;
  return async path => {
    if (!path) return { ...repository, full_name: 'EwertonMendes/roteiva-web',
      owner, default_branch: 'master', private: privateSource };
    if (path === '/branches/master') return { commit: { sha: reads++ === 0 ? branchSha : finalSha } };
    if (path.startsWith('/commits/')) return [pullRequest];
    if (path === '/pulls/222') return { ...pullRequest, merged_by: merger };
    if (path === '/actions/workflows/' + workflowId) return { id: workflowId, path: workflow, state: 'active' };
    if (path.startsWith('/contents/')) return { sha: sourceBlob };
    if (path.includes('/runs?')) return { workflow_runs: [{ id: 45278221929, head_sha: sha,
      event, head_branch: 'master', conclusion: 'success', status: 'completed', workflow_id: workflowId,
      repository, head_repository: repository }] };
    if (path.includes('/jobs?')) return { jobs: names.map(name => ({
      name, status: 'completed', conclusion: jobConclusion,
    })) };
    throw new Error('Unexpected API request: ' + path);
  };
}

test('accepts only the checked, merged source master SHA', async () => {
  const receipt = await verifySource({ api: fixture(), requestedSha: sha, publicProbe: false });
  assert.deepEqual(receipt, { sha, pullRequest: 222, gateRun: 45278221929, privateSource: true });
});

test('rejects a changed SHA, including when master moves during validation', async () => {
  const stale = 'a'.repeat(40);
  await assert.rejects(verifySource({ api: fixture({ branchSha: stale }), requestedSha: sha }), /current master/);
  await assert.rejects(verifySource({ api: fixture({ finalSha: stale }), requestedSha: sha }), /changed during/);
});

test('rejects unreviewed workflow changes and other merge identities', async () => {
  await assert.rejects(verifySource({ api: fixture({ sourceBlob: 'b'.repeat(40) }), requestedSha: sha }), /controller review/);
  await assert.rejects(verifySource({ api: fixture({ merger: { id: 1 } }), requestedSha: sha }), /merge policy/);
});

test('rejects PR-only runs, skipped jobs and anonymous private rehearsals', async () => {
  await assert.rejects(verifySource({ api: fixture({ event: 'pull_request' }), requestedSha: sha }), /master-push checks/);
  await assert.rejects(verifySource({ api: fixture({ jobConclusion: 'skipped' }), requestedSha: sha }), /required release job/);
  await assert.rejects(verifySource({ api: fixture(), requestedSha: sha, publicProbe: true }), /public source/);
});

const fastBlob='b2caf15c235f9d993528373210f87021c21f2824';
const fastNames=["01 - Frontend | unit, types and build","02 - API | unit, types, D1 and security","03 - Firestore | tenant and access rules","04 - E2E | access, payments and tenant isolation","05 - E2E | impacted product and media smoke"];
test('requires every job from the reviewed fast gate, not just legacy job names',async()=>{
 await verifySource({api:fixture({sourceBlob:fastBlob,names:fastNames}),requestedSha:sha});
 await assert.rejects(verifySource({api:fixture({sourceBlob:fastBlob,names:fastNames.slice(0,-1)}),requestedSha:sha}),/required release job/);
 await assert.rejects(verifySource({api:fixture({sourceBlob:fastBlob}),requestedSha:sha}),/required release job/);
});
