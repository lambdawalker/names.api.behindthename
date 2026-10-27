import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SourceRecord } from './types.js';
import { LookupDataSchema, RelatedDataSchema, LookupOptionsSchema, RelatedOptionsSchema, Name } from './schemas.js';
import { SourceError } from './transport.js';
export function canonicalJson(value:unknown):string {
 const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort((v as Record<string,unknown>)[k])])):v;
 return JSON.stringify(sort(value),null,2);
}
const digest=(v:unknown)=>createHash('sha256').update(canonicalJson(v)).digest('hex');
const EvidenceOptions=z.strictObject({retainContent:z.boolean().default(false),documentId:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export type EvidenceOptions=z.input<typeof EvidenceOptions>;
function validate(r:SourceRecord){
 if(r.source!=='behindthename'||!['lookup','related'].includes(r.operation))throw new TypeError('Invalid provider operation');
 z.iso.datetime({offset:true}).parse(r.retrievedAt);
 const {name,...selection}=r.query;Name.parse(name);const args=r.operation==='lookup'?LookupOptionsSchema.parse(selection):RelatedOptionsSchema.parse(selection);
 const locator=new URL('https://www.behindthename.com/api/'+r.operation+'.json');for(const [k,v]of Object.entries({name,...args}))if(v!==undefined)locator.searchParams.set(k,typeof v==='boolean'?(v?'yes':'no'):v);
 if(locator.href!==r.locator)throw new TypeError('Source locator and query mismatch');
 const data=r.operation==='lookup'?LookupDataSchema.parse(r.data):RelatedDataSchema.parse(r.data);
 return {...r,data,query:{name,...args}};
}
export function toDocumentInput(record:SourceRecord,options:EvidenceOptions={}){
 const r=validate(record);const args=EvidenceOptions.parse(options);
 const body=canonicalJson({operation:r.operation,query:r.query,data:r.data});const fence='`'.repeat(Math.max(3,...Array.from(body.matchAll(/`+/g),m=>m[0].length+1)));
 const content=`# Behind the Name API evidence\n\n${r.locator}\n\nAttribution: Behind the Name. API response; no etymology article was retrieved.\nRelated results are discovery candidates, not historical derivations or borrowing evidence.\nAPI data reuse is restricted; this is not a CC BY-SA bulk download.\n\n${fence}json\n${body}\n${fence}\n`;
 if(Buffer.byteLength(content)>1048576)throw new SourceError('document_too_large','Markdown evidence exceeds 1 MiB');
 const source={id:'btn:'+digest([r.operation,r.query,r.data,r.retrievedAt]),provider:'behindthename',upstream_source:'Behind the Name API',url:r.locator,retrieved_at:r.retrievedAt,public_reuse:'restricted' as const};
 return {source,locator:r.locator,content,format:'markdown' as const,retention:args.retainContent?'allowed' as const:'metadata_only' as const};
}
/** Source discovery only: no form identity, directed relationship or usage mapping is inferred. */
export function toDiscoveryFinding(record:SourceRecord,options:EvidenceOptions={}){
 const args=EvidenceOptions.parse(options);const doc=toDocumentInput(record,args);const id=digest([doc.source.id,args.documentId??null,args.retainContent]);
 const evidence={id:'btn-evidence-'+id,source_id:doc.source.id,locator:doc.locator,...(args.documentId?{document_id:args.documentId}:{}),...(args.retainContent?{supporting_text:canonicalJson(validate(record).data)}:{}),note:'Unverified discovery candidate response. Related names do not establish derivation, direction, borrowing or a language-specific identity; usage codes are provider-specific.'};
 const finding={idempotency_key:'btn-discovery-'+id,sources:[doc.source],evidence:[evidence]};
 if(Buffer.byteLength(JSON.stringify(finding))>131072)throw new SourceError('response_too_large','Evidence finding exceeds 128 KiB');return finding;
}
