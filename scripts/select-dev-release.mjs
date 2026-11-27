import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verifyRelease} from './verify-release-package.mjs';

const SOURCE='EwertonMendes/roteiva-web',SOURCE_ID=1422595328;
export async function selectDevRelease({api,liveIdentity,manual=false,verify=verifyRelease,alreadyAttempted=async()=>false}){
 const source=await api('');
 if(source.id!==SOURCE_ID||source.full_name!==SOURCE||source.default_branch!=='master')throw Error('Unexpected source repository');
 // Scheduled releases stay inert until the private cutover; manual rehearsal
 // can exercise the complete selector before the visibility change.
 if(!source.private&&!manual)return null;
 const branch=await api('/branches/master'),sha=branch.commit?.sha;
 if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Invalid master SHA');
 if(liveIdentity?.environment==='dev'&&liveIdentity?.projectId==='roteiva-web-dev'&&liveIdentity?.sha===sha)return null;
 // A manual PR homologation owns DEV until that PR closes or an explicit
 // manual release replaces it. An unrelated master merge must never
 // downgrade an in-flight destructive job to a Worker without its routes.
 if(!manual){
  if(liveIdentity?.environment!=='dev'||liveIdentity?.projectId!=='roteiva-web-dev'||! /^[a-f0-9]{40}$/.test(liveIdentity?.sha||''))throw Error('Cannot verify current DEV identity');
  const prs=await api('/commits/'+liveIdentity.sha+'/pulls?per_page=100');
  if(!Array.isArray(prs)||prs.length>=100)throw Error('Cannot verify DEV homologation ownership');
  if(prs.some(pr=>pr.state==='open'&&pr.base?.ref==='master'&&pr.base?.repo?.id===SOURCE_ID&&pr.head?.repo?.id===SOURCE_ID))return null;
 }
 if(!manual&&await alreadyAttempted(sha))return null;
 const query=new URLSearchParams({branch:'master',head_sha:sha,status:'success',per_page:'30'});
 const data=await api('/actions/workflows/428402383/runs?'+query);
 for(const run of data.workflow_runs||[]){
  if(run.head_sha!==sha||run.head_branch!=='master'||run.status!=='completed'||run.conclusion!=='success'||
     !(run.event==='workflow_run'||(manual&&run.event==='workflow_dispatch')))continue;
  const artifacts=await api('/actions/runs/'+run.id+'/artifacts?per_page=100');
  if(!artifacts.artifacts?.some(a=>a.name==='roteiva-release-dev-'+sha&&!a.expired))continue;
  return verify({api,requestedSha:sha,packageRunId:run.id,target:'dev'});
 }
 return null;
}
async function main(){
 const token=process.env.SOURCE_READ_TOKEN;
 if(!token)throw Error('Missing protected source token');
 const api=async path=>{
  const r=await fetch('https://api.github.com/repos/'+SOURCE+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Source API HTTP '+r.status);
  return r.json();
 };
 const identity=await fetch('https://roteiva-web-dev.web.app/roteiva-build.json',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!identity.ok)throw Error('Cannot determine current DEV version safely');
 const alreadyAttempted=async sha=>{
  const token=process.env.CONTROLLER_RECEIPT_TOKEN;
  if(!token)throw Error('Missing controller receipt read authorization');
  const params=new URLSearchParams({environment:'roteiva-dev-release-receipts',task:'roteiva-dev-release',per_page:'100'});
  const response=await fetch('https://api.github.com/repos/EwertonMendes/roteiva-deploy/deployments?'+params,{
   headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Controller receipt API HTTP '+response.status);
  return (await response.json()).some(d=>{
   const payload=typeof d.payload==='string'?JSON.parse(d.payload||'{}'):d.payload;
   return payload?.source_sha===sha;
  });
 };
 const result=await selectDevRelease({api,liveIdentity:await identity.json(),manual:process.env.MANUAL_REHEARSAL==='true',alreadyAttempted});
 const outputs=result?['ready=true','sha='+result.sha,'package_run='+result.packageRunId]:['ready=false'];
 appendFileSync(process.env.GITHUB_OUTPUT,outputs.join('\n')+'\n');
 console.log(result?'Verified a completed DEV release candidate.':'No new eligible DEV package.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
