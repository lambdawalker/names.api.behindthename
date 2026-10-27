import { it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { BehindTheNameClient } from '../src/client.js';
import { createBehindTheNameMcpServer } from '../src/mcp.js';
import { runCli } from '../src/cli.js';
const key='private-key-never-export';const data=[{name:'John',gender:'m',usages:[{usage_code:'eng',usage_full:'English'}]}];
const close:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const f of close.splice(0))await f();});
const body=(r:Awaited<ReturnType<Client['callTool']>>)=>JSON.parse((r.content as {text:string}[])[0]!.text);
async function connect(source:BehindTheNameClient){const server=createBehindTheNameMcpServer({client:source});const client=new Client({name:'test',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);close.push(async()=>{await client.close();await server.close();});return client;}
it('CLI validates options and reads the API key only from environment',async()=>{
 let out='',err='',calls=0;const io={env:{BEHINDTHENAME_API_KEY:key},stdout:(s:string)=>{out+=s;},stderr:(s:string)=>{err+=s;},fetch:async()=>{calls++;return new Response(JSON.stringify(data));}};
 expect(await runCli(['lookup','John','--exact'],io)).toBe(0);expect(JSON.parse(out).data[0].name).toBe('John');expect(out).not.toContain(key);
 expect(await runCli(['lookup','John','--key',key],io)).toBe(1);expect(await runCli(['lookup','John','--gender','m'],io)).toBe(1);expect(calls).toBe(1);expect(err).not.toContain(key);
 expect(await runCli(['lookup','John'],{...io,env:{}})).toBe(1);expect(calls).toBe(1);
});
it('CLI supports Markdown evidence and exclusive output creation',async()=>{
 let written='';expect(await runCli(['related','John','--markdown','--output','evidence.md'],{env:{BEHINDTHENAME_API_KEY:key},fetch:async()=>new Response('{"names":["Juan"]}'),writeFile:async(p,s)=>{expect(p).toBe('evidence.md');written=s;}})).toBe(0);expect(written).toContain('Juan');expect(written).not.toContain(key);
});
it('advertises exactly two read-only tools and pages a stable snapshot',async()=>{
 const source=new BehindTheNameClient({apiKey:key,fetch:async()=>new Response('{"names":["Juan","Giovanni"]}')});const c=await connect(source);const list=await c.listTools();expect(list.tools.map(t=>t.name).sort()).toEqual(['lookup_name','related_names']);expect(list.tools.every(t=>t.annotations?.readOnlyHint)).toBe(true);
 const first=body(await c.callTool({name:'related_names',arguments:{name:'John',limit:1}}));expect(first.items).toEqual(['Juan']);expect(first.next_offset).toBe(1);
 const next=body(await c.callTool({name:'related_names',arguments:{name:'John',offset:1,limit:1,snapshot:first.snapshot}}));expect(next.items).toEqual(['Giovanni']);expect(JSON.stringify(next)).not.toContain(key);
 expect((await c.callTool({name:'related_names',arguments:{name:'John',offset:1,snapshot:'x'.repeat(64)}})).isError).toBe(true);
});
it('MCP bounds upstream and validation errors, including unknown large argument keys',async()=>{
 let requests=0;const c=await connect(new BehindTheNameClient({apiKey:key,fetch:async()=>{requests++;throw Error(key);}}));
 for(const args of [{name:'John',apiKey:key},{name:'John',['x'.repeat(100000)]:1}]){const r=await c.callTool({name:'lookup_name',arguments:args});expect(r.isError).toBe(true);expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(65536);expect(JSON.stringify(r)).not.toContain(key);}expect(requests).toBe(0);
 const r=await c.callTool({name:'lookup_name',arguments:{name:'John'}});expect(r.isError).toBe(true);expect(JSON.stringify(r)).not.toContain(key);
});
it('refuses oversized serialized MCP results',async()=>{
 const huge=Array.from({length:100},()=>({name:'漢'.repeat(1024),gender:'m',usages:[]}));const c=await connect(new BehindTheNameClient({apiKey:key,fetch:async()=>new Response(JSON.stringify(huge))}));const r=await c.callTool({name:'lookup_name',arguments:{name:'John',limit:100}});expect(r.isError).toBe(true);expect(body(r).code).toBe('response_too_large');
});
it('starts real stdio MCP with a server-only key and clean protocol output',async()=>{
 const c=new Client({name:'test-stdio',version:'1'});try{await c.connect(new StdioClientTransport({command:process.execPath,args:['dist/mcp-stdio.js'],env:{...process.env as Record<string,string>,BEHINDTHENAME_API_KEY:key},stderr:'pipe'}));expect((await c.listTools()).tools).toHaveLength(2);}finally{await c.close();}
});
