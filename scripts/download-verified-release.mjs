import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readdirSync,readFileSync,rmSync,lstatSync,statSync,writeFileSync} from 'node:fs';
import {join,relative,resolve,sep} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {verifyRelease} from './verify-release-package.mjs';
import {verifyReleaseControls} from './verify-release-controls.mjs';

const SOURCE='EwertonMendes/roteiva-web';
const sha=process.env.RELEASE_SHA,target=process.env.RELEASE_TARGET;
const token=process.env.SOURCE_READ_TOKEN;
const packageRunId=process.env.PACKAGE_RUN_ID;
assert.ok(token,'Missing source artifact read credential');
function archiveCommand(command,args){
 try{return execFileSync(command,args,{encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});}
 catch{throw new Error('Release archive operation failed.');}
}
function readPackageDocument(file){
 try{return JSON.parse(readFileSync(file,'utf8'));}
 catch{throw new Error('Release package metadata is missing or invalid.');}
}
const api=async path=>{
 const response=await fetch('https://api.github.com/repos/'+SOURCE+path,{
  headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},
  redirect:'error',signal:AbortSignal.timeout(20_000)});
 if(!response.ok)throw Error('Release metadata request failed (HTTP '+response.status+')');
 return response.json();
};
const verified=await verifyRelease({api,requestedSha:sha,target,packageRunId,prNumber:process.env.PR_NUMBER||''});
const tmp=process.env.RUNNER_TEMP;
assert.ok(tmp&&resolve(tmp)!==process.cwd(),'Runner temporary directory required');
const outer=join(tmp,'roteiva-controlled-release');
rmSync(outer,{force:true,recursive:true});mkdirSync(outer,{recursive:true,mode:0o700});
const zip=join(outer,'artifact.zip');
const resp=await fetch('https://api.github.com/repos/'+SOURCE+
 '/actions/artifacts/'+verified.artifactId+'/zip',{
  headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},
  redirect:'follow',signal:AbortSignal.timeout(90_000)});
if(!resp.ok)throw Error('Verified private artifact download failed (HTTP '+resp.status+')');
const buffer=Buffer.from(await resp.arrayBuffer());
assert.ok(buffer.length<=200_000_000,'Artifact exceeds maximum allowed size');
assert.equal('sha256:'+createHash('sha256').update(buffer).digest('hex'),verified.zipDigest,
 'GitHub SHA-256 artifact digest did not match');
writeFileSync(zip,buffer,{mode:0o600});
const zipEntries=archiveCommand('unzip',['-Z1',zip]).trim().split('\n');
assert.ok(zipEntries.length===1&&zipEntries[0]==='release-package.tar.gz','Unexpected or unsafe zip contents');
archiveCommand('unzip',['-qq',zip,'-d',outer]);
const tgz=join(outer,'release-package.tar.gz'),extract=join(outer,'payload');
const entryTypes=archiveCommand('tar',['-tvzf',tgz]).split('\n').filter(Boolean);
for(const row of entryTypes)assert.ok(['-','d'].includes(row[0]),'Release tar contains a link or non-file entry');
const entries=archiveCommand('tar',['-tzf',tgz]).split('\n').filter(Boolean);
assert.ok(entries.length>10&&entries.length<2000);
for(const entry of entries){
 const clean=entry.replace(/^\.\/?/,'');
 if(!clean)continue;
 assert.ok(!clean.startsWith('/')&&!clean.split('/').includes('..')&&
  !clean.includes('\\')&&!clean.includes('\0'),'Unsafe archive path');
}
mkdirSync(extract,{recursive:true,mode:0o700});
archiveCommand('tar',['-xzf',tgz,'--no-same-owner','--no-same-permissions','-C',extract]);
const manifest=readPackageDocument(join(extract,'release-manifest.json'));
assert.ok(manifest?.source===SOURCE&&manifest.sourceRepositoryId===1422595328&&manifest.sourceSha===sha&&
 manifest.target===target&&manifest.projectId==='roteiva-web-'+target,'Package source or target mismatch');
assert.ok(Array.isArray(manifest.files)&&manifest.files.length>=15);
const observed=[];
function walk(path){
 for(const item of readdirSync(path,{withFileTypes:true})){
  const absolute=join(path,item.name),st=lstatSync(absolute);
  assert.ok(st.isDirectory()||st.isFile(),'Links are not permitted in release payload');
  if(st.isDirectory())walk(absolute);
  else if(absolute!==join(extract,'release-manifest.json'))
   observed.push({path:relative(extract,absolute).split(sep).join('/'),
    size:st.size,sha256:createHash('sha256').update(readFileSync(absolute)).digest('hex')});
 }
}
try{walk(extract);}catch{throw new Error('Release payload file inspection failed.');}
observed.sort((a,b)=>a.path.localeCompare(b.path));
assert.ok(isDeepStrictEqual(observed,manifest.files),'Package file digest, size or listing mismatch');
verifyReleaseControls(observed,target);
const identity=readPackageDocument(join(extract,'dist/roteiva-build.json'));
assert.ok(identity?.sha===sha&&identity.projectId==='roteiva-web-'+target&&identity.environment===target,'Build identity mismatch');
if(target==='prod'){
 const flags=['PRODUCTION_BILLING_ENABLED','PRODUCTION_BILLING_CHECKOUT_ENABLED',
  'PRODUCTION_BILLING_PIX_ENABLED','PRODUCTION_BILLING_PUBLIC_ROLLOUT_ENABLED'];
 for(const flag of flags){
  assert.ok(['true','false'].includes(process.env[flag]),'Missing protected billing flag '+flag);
  assert.ok(manifest.billing?.[flag]===process.env[flag],'Production billing flag mismatch: '+flag);
 }
}
if(process.env.GITHUB_OUTPUT)writeFileSync(process.env.GITHUB_OUTPUT,'release_path='+extract+'\n',{flag:'a'});
console.log('Release artifact provenance, SHA-256 and target verified: '+sha+' '+target);
