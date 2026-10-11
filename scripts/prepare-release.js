'use strict';
// Build a static payload from an explicit allowlist, never from a repository copy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
function allowed(file) {
 return ['index.html','style.css'].includes(file) || /^(?:js|vendor|clinical-knowledge)\//.test(file) && !file.split('/').some(p=>p.startsWith('.')) && (/\.(?:html|css|js|json|woff2?|ttf|eot|svg|png|ico)$/.test(file) || /^vendor\/.*(?:LICENSE|OFL)[^/]*\.txt$/i.test(file));
}
function prepare(output) {
 const target=path.resolve(output);
 if(target===ROOT||target.startsWith(ROOT+path.sep))throw Error('Output must be outside the source repository');
 if(fs.existsSync(target))throw Error('Output already exists; choose a new directory');
 const files=execFileSync('git',['ls-files','-z'],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).filter(allowed);
 const manifest={schemaVersion:1,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:ROOT,encoding:'utf8'}).trim(),files:[]};
 for(const file of files){
  const source=path.join(ROOT,file),stat=fs.lstatSync(source);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Nonregular release asset: '+file);
  const bytes=fs.readFileSync(source);if(!bytes.length)throw Error('Empty release asset: '+file);
  manifest.files.push({path:file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 const names=new Set(files);
 for(const file of files.filter(p=>p.endsWith('.html'))){
  const source=fs.readFileSync(path.join(ROOT,file),'utf8');
  for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
   const ref=match[1];if(/^(?:[a-z]+:|#|\/\/)/i.test(ref))continue;
   const clean=ref.split(/[?#]/)[0];if(!clean)continue;
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),clean));
   if(!names.has(resolved))throw Error('Missing release asset: '+file+' -> '+ref);
  }
 }
 fs.mkdirSync(target,{recursive:true});
 for(const file of files){const dest=path.join(target,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(ROOT,file),dest);}
 fs.writeFileSync(path.join(target,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
if(require.main===module){try{if(!process.argv[2])throw Error('Usage: node scripts/prepare-release.js /absolute/new/output-directory');const result=prepare(process.argv[2]);console.log('Prepared '+result.files.length+' static assets; no deployment performed');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={allowed,prepare};
