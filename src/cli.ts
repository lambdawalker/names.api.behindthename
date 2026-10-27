#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BehindTheNameClient } from './client.js';
import { toDocumentInput } from './evidence.js';
import { SourceError } from './transport.js';
const HELP=`Usage:
  names-behindthename lookup NAME [--exact] [--markdown | --document]
  names-behindthename related NAME [--usage eng] [--gender m] [--markdown | --document]
  --output FILE creates a new file exclusively; default output is stdout.
  --retain-content marks document content retention as allowed by the caller.
Set BEHINDTHENAME_API_KEY in the environment; no command-line keys accepted.
`;
interface CliIO{env?:Record<string,string|undefined>;stdout?:(s:string)=>void;stderr?:(s:string)=>void;fetch?:typeof fetch;signal?:AbortSignal;writeFile?:(p:string,s:string)=>Promise<void>}
export async function runCli(args:string[],io:CliIO={}):Promise<number>{
 const stdout=io.stdout??((s:string)=>{process.stdout.write(s);});const stderr=io.stderr??((s:string)=>{process.stderr.write(s);});
 try{
  const {values:v,positionals:p}=parseArgs({args,allowPositionals:true,strict:true,options:{exact:{type:'boolean'},usage:{type:'string'},gender:{type:'string'},markdown:{type:'boolean'},document:{type:'boolean'},output:{type:'string'},'retain-content':{type:'boolean'},help:{type:'boolean'}}});
  if(v.help){stdout(HELP);return 0;}
  if(p.length!==2||!['lookup','related'].includes(p[0]!)||(v.markdown&&v.document))throw Error('arguments');
  if((p[0]==='lookup'&&(v.usage!==undefined||v.gender!==undefined))||(p[0]==='related'&&v.exact!==undefined)||(v['retain-content']&&!v.document))throw Error('arguments');
  const apiKey=(io.env??process.env).BEHINDTHENAME_API_KEY;if(!apiKey)throw Error('configuration');
  const client=new BehindTheNameClient({apiKey,...(io.fetch?{fetch:io.fetch}:{})});
  const record=p[0]==='lookup'?await client.lookup(p[1]!,{exact:v.exact,signal:io.signal}):await client.related(p[1]!,{usage:v.usage,gender:v.gender as 'm'|'f'|undefined,signal:io.signal});
  const doc=v.markdown||v.document?toDocumentInput(record,{retainContent:v['retain-content']}):undefined;
  const output=v.markdown?doc!.content:JSON.stringify(v.document?doc:record,null,2)+'\n';
  if(v.output)await(io.writeFile??((p,s)=>writeFile(p,s,{flag:'wx',mode:0o600,encoding:'utf8'})))(v.output,output);else stdout(output);return 0;
 }catch(error){stderr(`ERROR: ${error instanceof SourceError?error.code:'configuration_or_arguments'}: Behind the Name command failed. Check BEHINDTHENAME_API_KEY, command options (--help), provider availability and output path.\n`);return 1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);process.exitCode=await runCli(process.argv.slice(2),{signal:controller.signal});process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
}
