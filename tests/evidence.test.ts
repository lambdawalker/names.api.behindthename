import { it, expect } from 'vitest';
import { BehindTheNameClient, toDocumentInput, toDiscoveryFinding } from '../src/index.js';
const create = async () => new BehindTheNameClient({apiKey:'secret-test-key',fetch:async()=>new Response(JSON.stringify({names:['Juan','Giovanni','`'.repeat(8)]})),now:()=>new Date('2026-10-27T00:00:00Z')}).related('John',{usage:'spa'});
it('renders deterministic Markdown with full query context and conservative reuse',async()=>{
 const record=await create();const a=toDocumentInput(record),b=toDocumentInput(record);expect(a).toEqual(b);expect(a.content).toContain('Giovanni');expect(a.content).toContain('"usage": "spa"');expect(a.content).toContain('`````````json');expect(a.source.public_reuse).toBe('restricted');expect(a.retention).toBe('metadata_only');expect(a.source).not.toHaveProperty('license');expect(a.content).not.toContain('secret-test-key');
 expect(toDocumentInput(record,{retainContent:true}).retention).toBe('allowed');
});
it('retains retrieval provenance independently of content identity',async()=>{
 const record=await create();const a=toDocumentInput(record),b=toDocumentInput({...record,retrievedAt:'2026-10-27T00:00:01Z'});expect(a.content).toBe(b.content);expect(a.source.id).not.toBe(b.source.id);
});
it('makes idempotent evidence-only findings without inventing graph edges',async()=>{
 const record=await create();const a=toDiscoveryFinding(record);expect(a).toEqual(toDiscoveryFinding(record));expect(a).not.toHaveProperty('relationships');expect(a).not.toHaveProperty('origins');expect(a.evidence[0]).not.toHaveProperty('supporting_text');expect(a.evidence[0]!.note).toContain('candidate');
 const b=toDiscoveryFinding(record,{retainContent:true,documentId:'a'.repeat(64)});expect(b.evidence[0]!.supporting_text).toContain('Giovanni');expect(b.evidence[0]!.document_id).toBe('a'.repeat(64));
});
it('rejects forged locators, mismatched query context and invalid dates',async()=>{
 const r=await create();for(const patch of [{locator:r.locator+'&key=secret'},{query:{name:'Other'}},{source:'other'},{retrievedAt:'yesterday'},{data:{names:[3]}}])expect(()=>toDocumentInput({...r,...patch} as typeof r)).toThrow();
 expect(()=>toDiscoveryFinding(r,{documentId:'../bad'})).toThrow();
});
