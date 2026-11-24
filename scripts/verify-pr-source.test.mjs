import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPrSource} from './verify-pr-source.mjs';
import {verifyRelease} from './verify-release-package.mjs';
const sha='b'.repeat(40),id=1422595328,owner=33728924,gate=428216408,packageId=428402383;
const names=['01 - Quality, security & production build','02 - E2E Access, billing & tenant isolation','03 - E2E Projects, finance, Drive & approvals'];
function fixture(opts={}){
 let prReads=0;
 const branch='feature/test';
 return async path=>{
  if(path==='')return {id,full_name:'EwertonMendes/roteiva-web',owner:{id:owner},default_branch:'master',private:true};
  if(path==='/pulls/42')return {state:opts.closed?'closed':'open',base:{ref:'master',repo:{id}},head:{ref:branch,repo:{id:opts.foreign?99:id},sha:opts.changed&&prReads++>0?'c'.repeat(40):sha}};
  if(path==='/actions/workflows/'+gate)return {id:gate,path:'.github/workflows/qa-production-gates.yml',state:'active'};
  if(path.includes('qa-production-gates.yml?ref='))return {sha:opts.badGate?'0'.repeat(40):'9ca5ebbc1c6efbf2a3910efd65e853c4b4af4d1d'};
  if(path.startsWith('/actions/workflows/'+gate+'/runs?'))return {workflow_runs:[{id:123456,workflow_id:gate,head_sha:sha,head_branch:branch,repository:{id},head_repository:{id},event:'pull_request',status:'completed',conclusion:opts.failed?'failure':'success'}]};
  if(path.startsWith('/actions/runs/123456/jobs'))return {jobs:names.map(name=>({name,status:'completed',conclusion:'success'}))};
  if(path==='/actions/workflows/'+packageId)return {id:packageId,path:'.github/workflows/release-package.yml',state:'active'};
  if(path.includes('release-package.yml?ref='))return {sha:'50ae1a673344ddd40cfdb2c354c1af6963750ac2'};
  if(path==='/actions/runs/123457')return {id:123457,workflow_id:packageId,head_sha:sha,head_branch:branch,repository:{id},head_repository:{id},actor:{id:opts.otherActor?2:owner},event:'workflow_dispatch',status:'completed',conclusion:'success'};
  if(path.startsWith('/actions/runs/123457/jobs'))return {jobs:[{name:'Source-only release package (dev)',status:'completed',conclusion:'success'}]};
  if(path.startsWith('/actions/runs/123457/artifacts'))return {artifacts:[{id:555,name:'roteiva-release-dev-'+sha,digest:'sha256:'+'a'.repeat(64),expired:false,size_in_bytes:12345,workflow_run:{head_sha:sha}}]};
  throw Error('Unexpected '+path);
 };
}
test('authorizes exact open same-repo PR and its immutable DEV artifact',async()=>{
 const x=await verifyRelease({api:fixture(),requestedSha:sha,prNumber:'42',packageRunId:123457,target:'dev'});
 assert.equal(x.artifactId,555);assert.equal(x.branch,'feature/test');assert.equal(x.pullRequest,42);
});
test('rejects PR production, foreign/closed/stale PR, altered gates and non-owner packaging',async()=>{
 await assert.rejects(verifyRelease({api:fixture(),requestedSha:sha,prNumber:'42',packageRunId:123457,target:'prod'}));
 for(const opts of [{closed:true},{foreign:true},{changed:true},{badGate:true},{failed:true},{otherActor:true}]){
  await assert.rejects(verifyRelease({api:fixture(opts),requestedSha:sha,prNumber:'42',packageRunId:123457,target:'dev'}));
 }
});
