import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verifySource} from './verify-source.mjs';

// Immutable source workflow reviewed in PR #224.
// Never accept a controller-supplied workflow revision or a generic artifact name.
const SOURCE='EwertonMendes/roteiva-web',SOURCE_ID=1422595328,OWNER_ID=33728924;
const WORKFLOW_ID=428402383,WORKFLOW_PATH='.github/workflows/release-package.yml';
const WORKFLOW_BLOBS=new Set(['70f72c10dab83307f37bd91b1ee4346790dec955']);

export async function verifyRelease({api,requestedSha,packageRunId,target}){
 if(!['dev','prod'].includes(target))throw Error('Invalid release target');
 if(!/^[1-9][0-9]{5,14}$/.test(String(packageRunId)))throw Error('Release run ID is required');
 const gate=await verifySource({api,requestedSha,publicProbe:false});
 const wf=await api('/actions/workflows/'+WORKFLOW_ID);
 if(wf.id!==WORKFLOW_ID||wf.path!==WORKFLOW_PATH||wf.state!=='active')
  throw Error('The reviewed packaging workflow is unavailable');
 const revision=await api('/contents/'+WORKFLOW_PATH+'?ref='+requestedSha);
 if(!WORKFLOW_BLOBS.has(revision.sha))throw Error('Source package workflow requires independent controller review');
 const run=await api('/actions/runs/'+packageRunId);
 if(run.id!==Number(packageRunId)||run.workflow_id!==WORKFLOW_ID||
    run.head_sha!==requestedSha||run.head_branch!=='master'||
    run.event!=='workflow_dispatch'||run.conclusion!=='success'||run.status!=='completed'||
    run.repository?.id!==SOURCE_ID||run.head_repository?.id!==SOURCE_ID||
    run.actor?.id!==OWNER_ID||run.inputs?.target!==target||run.inputs?.sha!==requestedSha)
  throw Error('Package execution lacks immutable owner/source/target provenance');
 const jobs=await api('/actions/runs/'+packageRunId+'/jobs?filter=latest&per_page=100');
 const packaging=jobs.jobs?.filter(j=>j.name==='Source-only release package ('+target+')');
 if(packaging?.length!==1||packaging[0].conclusion!=='success'||packaging[0].status!=='completed')
  throw Error('Required release packaging job did not succeed');
 const artifacts=await api('/actions/runs/'+packageRunId+'/artifacts?per_page=100');
 const name='roteiva-release-'+target+'-'+requestedSha;
 const matching=artifacts.artifacts?.filter(a=>a.name===name);
 if(matching?.length!==1||matching[0].expired||matching[0].workflow_run?.head_sha!==requestedSha||
    !/^sha256:[a-f0-9]{64}$/.test(matching[0].digest||'')||
    matching[0].size_in_bytes<=1000||matching[0].size_in_bytes>200_000_000)
  throw Error('Expected private, immutable, SHA-verified artifact unavailable');
 const latest=await api('/branches/master');
 if(latest.commit?.sha!==requestedSha)throw Error('Source master changed during release authorization');
 return {...gate,target,packageRunId:Number(packageRunId),artifactId:matching[0].id,zipDigest:matching[0].digest};
}
async function main(){
 const token=process.env.SOURCE_READ_TOKEN;
 if(!token)throw Error('SOURCE_READ_TOKEN is missing from protected environment');
 const api=async path=>{
  const response=await fetch('https://api.github.com/repos/'+SOURCE+path,{
   headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},
   redirect:'error',signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw Error('Source metadata API returned HTTP '+response.status);
  return response.json();
 };
 const info=await verifyRelease({api,requestedSha:process.env.RELEASE_SHA,
  packageRunId:process.env.PACKAGE_RUN_ID,target:process.env.RELEASE_TARGET});
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,
  ['sha='+info.sha,'gate_run='+info.gateRun,'package_run='+info.packageRunId,
   'artifact_id='+info.artifactId,'zip_digest='+info.zipDigest].join('\n')+'\n');
 console.log('Verified source release: '+info.sha+' '+info.target+'; gate #'+info.gateRun+'; package #'+info.packageRunId);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{
 console.error(e.message);process.exitCode=1;
});
