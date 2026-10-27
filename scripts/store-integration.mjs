// Synthetic API fixture against the real authenticated storage HTTP API and SQLite.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { BehindTheNameClient, toDocumentInput, toDiscoveryFinding } from '../dist/index.js';
assert(process.env.STORE_CHECKOUT,'Set STORE_CHECKOUT to a built names.research.store checkout');
const {Store,createApi}=await import(pathToFileURL(resolve(process.env.STORE_CHECKOUT,'dist/index.js')).href);
const record=await new BehindTheNameClient({apiKey:'synthetic-not-a-real-key',fetch:async()=>new Response('{"names":["Synthetic Related Name"]}')}).related('Synthetic Name');
const directory=await mkdtemp(join(tmpdir(),'btn-store-'));const token=randomBytes(32).toString('hex');let store=new Store(directory);const api=createApi(store,token);
try{
 await new Promise(r=>api.listen(0,'127.0.0.1',r));
 const call=async(name,input)=>{const response=await fetch(`http://127.0.0.1:${api.address().port}/v1/operations/${name}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 const metadata=await call('store_document',toDocumentInput(record));assert.equal((await readdir(join(directory,'documents'))).length,0);
 const input=toDocumentInput(record,{retainContent:true});const doc=await call('store_document',input);
 await call('store_document',toDocumentInput({...record,retrievedAt:new Date(Date.parse(record.retrievedAt)+1000).toISOString()},{retainContent:true}));
 assert.equal((await readdir(join(directory,'documents'))).length,1);
 const finding=toDiscoveryFinding(record,{retainContent:true,documentId:doc.document_id});const first=await call('record_finding',finding);const retry=await call('record_finding',finding);assert.equal(first.finding_id,retry.finding_id);
 await new Promise(r=>api.close(r));store.close();store=new Store(directory);
 assert(store.readDocument({document_id:doc.document_id}).text.includes('Synthetic Related Name'));
 assert.equal(store.readEntity('evidence',finding.evidence[0].id).entity.source_id,input.source.id);
 console.log(JSON.stringify({compatible:true,metadataOnlyDefault:true,replayIdempotent:true,markdownBodies:1,survivedRestart:true}));
}finally{if(api.listening)await new Promise(r=>api.close(r));store.close();await rm(directory,{recursive:true,force:true});}
