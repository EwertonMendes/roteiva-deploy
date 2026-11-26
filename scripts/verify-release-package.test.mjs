import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyRelease} from './verify-release-package.mjs';

const sha='3b8439d02baf8b8d1b946b2336776043f61a1700';
const source={id:1422595328},owner={id:33728924};
const pr={number:222,merged:true,merged_by:owner,merge_commit_sha:sha,
 base:{ref:'master',repo:source},head:{repo:source}};
const id=428402383,runId=45290000000;
const digest='sha256:'+'a'.repeat(64);
function fixture(options={}){
 let branches=0;
 return async path=>{
  if(path==='')return {...source,full_name:'EwertonMendes/roteiva-web',owner,default_branch:'master',private:true};
  if(path==='/branches/master')return {commit:{sha:options.staleAtEnd&&branches++>0?'f'.repeat(40):sha}};
  if(path.startsWith('/commits/'))return [pr];
  if(path==='/pulls/222')return pr;
  if(path==='/actions/workflows/428216408')return {id:428216408,path:'.github/workflows/qa-production-gates.yml',state:'active'};
  if(path.includes('qa-production-gates.yml'))return {sha:options.gateBlob||'9ca5ebbc1c6efbf2a3910efd65e853c4b4af4d1d'};
  if(path==='/actions/workflows/'+id)return {id,path:'.github/workflows/release-package.yml',state:'active'};
  if(path.includes('release-package.yml'))return {sha:options.blob||'248f7a0c870d4551ceedc244b8f50a3bceee13fe'};
  if(path.includes('428216408/runs'))return {workflow_runs:[{id:45278221929,status:'completed',conclusion:'success',
   workflow_id:428216408,head_branch:'master',head_sha:sha,event:'push',repository:source,head_repository:source}]};
  if(path.includes('/actions/runs/45278221929/jobs'))return {jobs:(options.names||[
   '01 - Quality, security & production build',
   '02 - E2E Access, billing & tenant isolation',
   '03 - E2E Projects, finance, Drive & approvals'
   ]).map(name=>({name,status:'completed',conclusion:'success'}))};
  if(path==='/actions/runs/'+runId)return {id:runId,workflow_id:id,head_sha:sha,head_branch:'master',
   status:'completed',conclusion:'success',event:options.runEvent||'workflow_dispatch',repository:source,
   head_repository:source,actor:options.actor||owner,
   };
  if(path.includes('/actions/runs/'+runId+'/jobs'))return {jobs:[{
   name:'Source-only release package ('+(options.packageTarget||'dev')+')',status:'completed',conclusion:'success'
  }]};
  if(path.includes('/actions/runs/'+runId+'/artifacts'))return {artifacts:[{
   id:432100,name:'roteiva-release-'+(options.artifactTarget||'dev')+'-'+sha,expired:false,
   workflow_run:{head_sha:sha},digest:options.digest||digest,size_in_bytes:12345
  }]};
  throw Error('Unexpected test request: '+path);
 };
}
test('authorizes only the exact private source run and artifact digest',async()=>{
 const x=await verifyRelease({api:fixture(),requestedSha:sha,packageRunId:runId,target:'dev'});
 assert.equal(x.gateRun,45278221929);
 assert.equal(x.packageRunId,runId);
 assert.equal(x.artifactId,432100);
 assert.equal(x.zipDigest,digest);
});
test('rejects package source revision changes, non-owner and invalid digest',async()=>{
 for(const o of [{blob:'c'.repeat(40)},{actor:{id:1}},{digest:'sha256:not-a-digest'}])
  await assert.rejects(verifyRelease({api:fixture(o),requestedSha:sha,packageRunId:runId,target:'dev'}));
});
test('rejects incorrect environment, malformed run ID and master race',async()=>{
 await assert.rejects(verifyRelease({api:fixture(),requestedSha:sha,packageRunId:runId,target:'prod'}));
 await assert.rejects(verifyRelease({api:fixture(),requestedSha:sha,packageRunId:'-1',target:'dev'}));
 await assert.rejects(verifyRelease({api:fixture({staleAtEnd:true}),requestedSha:sha,packageRunId:runId,target:'dev'}));
});

test('allows reviewed automatic package only for DEV, not production',async()=>{
 const dev=await verifyRelease({api:fixture({runEvent:'workflow_run'}),requestedSha:sha,packageRunId:runId,target:'dev'});
 assert.equal(dev.artifactId,432100);
 await assert.rejects(verifyRelease({api:fixture({runEvent:'workflow_run'}),requestedSha:sha,packageRunId:runId,target:'prod'}));
 await assert.rejects(verifyRelease({api:fixture({runEvent:'push'}),requestedSha:sha,packageRunId:runId,target:'dev'}));
});

test('accepts the reviewed consolidated gate and packaging workflows',async()=>{
 const api=fixture({gateBlob:'cc57716de9130c3d2b2e860c804eca339314c8b3',
  blob:'9e5d874006f751c111ec21e4153ea610c584ec34',runEvent:'workflow_run'});
 const release=await verifyRelease({api,requestedSha:sha,packageRunId:runId,target:'dev'});
 assert.equal(release.artifactId,432100);
});

const dualOptions={gateBlob:'b2caf15c235f9d993528373210f87021c21f2824',names:["01 - Frontend | unit, types and build","02 - API | unit, types, D1 and security","03 - Firestore | tenant and access rules","04 - E2E | access, payments and tenant isolation","05 - E2E | impacted product and media smoke"],blob:'9d95de351bff2b639f930e3747d8c63cecd577b1',runEvent:'workflow_run',packageTarget:'both'};
test('reuses one reviewed master package run for target-specific DEV and PROD artifacts',async()=>{
 const dev=await verifyRelease({api:fixture(dualOptions),requestedSha:sha,packageRunId:runId,target:'dev'});
 const prod=await verifyRelease({api:fixture({...dualOptions,artifactTarget:'prod'}),requestedSha:sha,packageRunId:runId,target:'prod'});
 assert.equal(dev.packageRunId,prod.packageRunId);
 assert.equal(prod.target,'prod');
 await assert.rejects(verifyRelease({api:fixture(dualOptions),requestedSha:sha,packageRunId:runId,target:'prod'}));
 await assert.rejects(verifyRelease({api:fixture({...dualOptions,packageTarget:'dev',artifactTarget:'prod'}),requestedSha:sha,packageRunId:runId,target:'prod'}));
 await assert.rejects(verifyRelease({api:fixture({...dualOptions,names:dualOptions.names.slice(0,-1),artifactTarget:'prod'}),requestedSha:sha,packageRunId:runId,target:'prod'}));
});
