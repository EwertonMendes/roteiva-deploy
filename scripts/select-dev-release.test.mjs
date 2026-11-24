import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectDevRelease} from './select-dev-release.mjs';
const sha='a'.repeat(40),old='b'.repeat(40);
function fixture(options={}){
 const calls=[];
 const api=async path=>{
  calls.push(path);
  if(path==='')return {id:1422595328,full_name:'EwertonMendes/roteiva-web',default_branch:'master',private:options.private??true};
  if(path==='/branches/master')return {commit:{sha}};
  if(path.startsWith('/actions/workflows/428402383/runs?'))return {workflow_runs:[{id:100001,head_sha:sha,head_branch:'master',status:'completed',conclusion:'success',event:options.event||'workflow_run'}]};
  if(path.startsWith('/actions/runs/100001/artifacts'))return {artifacts:[{name:'roteiva-release-'+(options.target||'dev')+'-'+sha,expired:options.expired??false}]};
  throw Error('Unexpected API request');
 };
 const verify=async args=>{calls.push('verify');assert.equal(args.target,'dev');assert.equal(args.requestedSha,sha);return {sha,packageRunId:args.packageRunId}};
 const liveIdentity={environment:'dev',projectId:'roteiva-web-dev',sha:options.liveSha||old};
 return {api,verify,liveIdentity,calls};
}
test('selects a completed automatic DEV package and calls full verifier',async()=>{
 const f=fixture();
 assert.deepEqual(await selectDevRelease(f),{sha,packageRunId:100001});
 assert.equal(f.calls.at(-1),'verify');
});
test('public source scheduled execution never deploys',async()=>{
 const f=fixture({private:false});
 assert.equal(await selectDevRelease(f),null);assert.deepEqual(f.calls,['']);
});
test('skips already published source SHA',async()=>{
 const f=fixture({liveSha:sha});
 assert.equal(await selectDevRelease(f),null);assert.ok(!f.calls.includes('verify'));
});
test('never selects PROD, expired packages or manually dispatched scheduled releases',async()=>{
 for(const opts of [{target:'prod'},{expired:true},{event:'workflow_dispatch'}]){
  const f=fixture(opts);assert.equal(await selectDevRelease(f),null);assert.ok(!f.calls.includes('verify'));
 }
});
test('explicit rehearsal accepts a verified manual DEV package',async()=>{
 const f=fixture({private:false,event:'workflow_dispatch'});
 assert.deepEqual(await selectDevRelease({...f,manual:true}),{sha,packageRunId:100001});
});

test('scheduled controller never overwrites an explicitly promoted PR after master was processed',async()=>{
 const f=fixture();
 assert.equal(await selectDevRelease({...f,alreadyAttempted:async s=>s===sha}),null);
 assert.ok(!f.calls.includes('verify'));
 const manual=fixture();
 assert.deepEqual(await selectDevRelease({...manual,manual:true,alreadyAttempted:async()=>true}),{sha,packageRunId:100001});
});
