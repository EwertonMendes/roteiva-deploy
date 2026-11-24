import assert from 'node:assert/strict';
const SOURCE='EwertonMendes/roteiva-web',ID=1422595328,OWNER=33728924,GATE=428216408;
const GATE_BLOBS=new Set(['e251344637b6edecac7469244d745272a9a68dd9','9ca5ebbc1c6efbf2a3910efd65e853c4b4af4d1d','02af8c7ee7e52db79c1c1ac88972f8e40f77e591']);
const JOBS=['01 - Quality, security & production build','02 - E2E Access, billing & tenant isolation','03 - E2E Projects, finance, Drive & approvals'];
export async function verifyPrSource({api,requestedSha,prNumber}){
 assert.match(requestedSha||'',/^[a-f0-9]{40}$/);
 assert.match(String(prNumber||''),/^[1-9][0-9]{0,8}$/);
 const repo=await api('');
 assert.ok(repo.id===ID&&repo.full_name===SOURCE&&repo.owner?.id===OWNER&&repo.default_branch==='master','Unexpected source');
 const checkPr=async()=>{
  const pr=await api('/pulls/'+prNumber);
  assert.ok(pr.state==='open'&&pr.base?.ref==='master'&&pr.base?.repo?.id===ID&&
    pr.head?.repo?.id===ID&&pr.head?.sha===requestedSha&&pr.head?.ref!=='master','PR no longer authorizes this SHA');
  return pr;
 };
 const pr=await checkPr();
 const wf=await api('/actions/workflows/'+GATE);
 assert.ok(wf.id===GATE&&wf.path==='.github/workflows/qa-production-gates.yml'&&wf.state==='active','Unexpected quality workflow');
 const revision=await api('/contents/.github/workflows/qa-production-gates.yml?ref='+requestedSha);
 assert.ok(GATE_BLOBS.has(revision.sha),'PR quality workflow needs controller review');
 const params=new URLSearchParams({branch:pr.head.ref,head_sha:requestedSha,per_page:'30'});
 const list=await api('/actions/workflows/'+GATE+'/runs?'+params);
 const run=list.workflow_runs?.find(r=>r.workflow_id===GATE&&r.head_sha===requestedSha&&r.head_branch===pr.head.ref&&
  r.head_repository?.id===ID&&r.repository?.id===ID&&
  (r.event==='pull_request'||(r.event==='workflow_dispatch'&&r.actor?.id===OWNER)));
 assert.ok(Number.isSafeInteger(run?.id)&&run.status==='completed'&&run.conclusion==='success','PR quality checks are not green');
 const result=await api('/actions/runs/'+run.id+'/jobs?filter=latest&per_page=100');
 assert.ok(JOBS.every(name=>{
  const matches=result.jobs?.filter(j=>j.name===name);
  return matches?.length===1&&matches[0].status==='completed'&&matches[0].conclusion==='success';
 }),'Missing green PR release checks');
 await checkPr();
 return {sha:requestedSha,pullRequest:Number(prNumber),gateRun:run.id,branch:pr.head.ref,privateSource:repo.private};
}
