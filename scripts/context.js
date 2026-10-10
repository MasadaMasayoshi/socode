'use strict';
// Bounded source reads; do not mutate Japanese runtime text.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),MAX_LINES=100,MAX_CHARS=8000;
function readSource(file){
 const full=path.resolve(ROOT,file),relative=path.relative(ROOT,full).split(path.sep).join('/');
 const allowed=/^(?:js\/|tests\/|scripts\/|docs\/|clinical-knowledge\/|index\.html$|style\.css$|server\.js$|README\.md$|AGENTS\.md$|package\.json$)/;
 if(!allowed.test(relative)||relative.includes('..')||!/\.(js|json|md|html|css)$/.test(relative))throw Error('Unsupported source path');
 execFileSync('git',['ls-files','--error-unmatch','--',relative],{cwd:ROOT,stdio:'pipe'});
 if(fs.realpathSync(full)!==full)throw Error('Symlinks are not supported');
 return {file:relative,lines:fs.readFileSync(full,'utf8').split(/\r?\n/)};
}
function outline(lines){
 const entries=[];lines.forEach((line,index)=>{
  const match=line.match(/^\s*(?:async\s+)?function\s+([\w$]+)/)||line.match(/^\s*(?:const|let|class)\s+([\w$]+)/)||line.match(/^\s*window\.([\w$]+)\s*=/);
  if(match)entries.push({name:match[1],line:index+1});
 });return entries;
}
function excerpt(lines,start,limits={}){
 const maxLines=limits.maxLines||MAX_LINES,maxChars=limits.maxChars||MAX_CHARS;
 if(!Number.isInteger(start)||start<1||start>lines.length)throw Error('Line is outside the file');
 let text='',next=start,truncatedLine=false;
 while(next<=lines.length&&next<start+maxLines){
  const line=next+': '+lines[next-1]+'\n';
  if(text.length+line.length>maxChars){if(!text){text=line.slice(0,maxChars);truncatedLine=true;}break;}
  text+=line;next++;
 }
 return {text,nextLine:next<=lines.length?next:null,truncatedLine};
}
function main(args){
 const [file,mode='--outline',value]=args;
 if(!file)throw Error('Usage: npm run context -- FILE [--outline | --symbol NAME | --line N | --search TEXT]');
 const source=readSource(file);console.log(source.file+' ('+source.lines.length+' lines)');
 if(mode==='--outline'||mode==='--search'){
  const entries=mode==='--outline'?outline(source.lines):source.lines.flatMap((line,index)=>line.includes(value||'\0')?[{name:line.trim().slice(0,160),line:index+1}]:[]);
  let output='',count=0;
  for(const entry of entries){const row=entry.line+': '+entry.name+'\n';if(count===50||output.length+row.length>MAX_CHARS)break;output+=row;count++;}
  process.stdout.write(output);
  if(count<entries.length)console.log('More matches omitted ('+(entries.length-count)+'); narrow the search or select a symbol.');
  return;
 }
 let start;
 if(mode==='--symbol'){
  const matches=outline(source.lines).filter(entry=>entry.name===value);
  if(matches.length!==1)throw Error('Symbol must match one declaration; use --search or --line for duplicates');start=matches[0].line;
 }else if(mode==='--line')start=Number(value);else throw Error('Unknown mode: '+mode);
 const result=excerpt(source.lines,start);process.stdout.write(result.text);
 if(result.nextLine)console.log('\nMore source: --line '+result.nextLine+(result.truncatedLine?' (long line truncated; inspect this line directly)':''));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={readSource,outline,excerpt,main};
