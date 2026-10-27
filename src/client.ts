import type { ClientOptions, SourceRecord } from './types.js';
import { JsonTransport, SourceError } from './transport.js';
import { Name, LookupOptionsSchema, RelatedOptionsSchema, LookupDataSchema, RelatedDataSchema, type LookupOptions, type RelatedOptions, type LookupData, type RelatedData } from './schemas.js';
import type { z } from 'zod';
export class BehindTheNameClient {
  #transport: JsonTransport;
  #cache = new Map<string,{record:SourceRecord;expires:number}>();
  #tail: Promise<unknown> = Promise.resolve();
  #now:()=>Date; #ttl:number; #max:number;
  constructor(options:ClientOptions){
    this.#transport=new JsonTransport(options);this.#now=options.now??(()=>new Date());this.#ttl=options.cacheTtlMs??300000;this.#max=options.cacheMaxEntries??100;
    if(!Number.isInteger(this.#ttl)||this.#ttl<0||this.#ttl>604800000||!Number.isInteger(this.#max)||this.#max<0||this.#max>1000) throw new TypeError('Invalid cache limits');
  }
  lookup(name:string,options:LookupOptions={}):Promise<SourceRecord<LookupData>> { return this.request('lookup',name,options,LookupOptionsSchema,LookupDataSchema); }
  related(name:string,options:RelatedOptions={}):Promise<SourceRecord<RelatedData>> { return this.request('related',name,options,RelatedOptionsSchema,RelatedDataSchema); }
  private async request<T>(operation:'lookup'|'related',name:string,options:{signal?:AbortSignal},args:z.ZodType,output:z.ZodType<T>):Promise<SourceRecord<T>>{
    const {signal,...rest}=options;const parsedName=Name.safeParse(name), parsed=args.safeParse(rest);
    if(!parsedName.success||!parsed.success) throw new SourceError('invalid_response','Invalid research query');
    const query={name:parsedName.data,...parsed.data as object};
    if(this.#transport.rejectsSecret(JSON.stringify(query))) throw new SourceError('invalid_response','Query contains private configuration');
    const params:Record<string,string>={};for(const [k,v] of Object.entries(query)) if(v!==undefined)params[k]=typeof v==='boolean'?(v?'yes':'no'):String(v);
    const locator=new URL('https://www.behindthename.com/api/'+operation+'.json');for(const [k,v] of Object.entries(params))locator.searchParams.set(k,v);
    const key=locator.href;
    const run=async()=>{
      if(signal?.aborted)throw new SourceError('aborted','Source request cancelled');
      const existing=this.#cache.get(key);if(existing&&existing.expires>this.#now().getTime()){this.#cache.delete(key);this.#cache.set(key,existing);return structuredClone(existing.record) as SourceRecord<T>;}
      this.#cache.delete(key);
      const response=await this.#transport.get(operation,params,signal);const validated=output.safeParse(response.data);if(!validated.success)throw new SourceError('invalid_response','Unexpected provider response shape');
      const record:SourceRecord<T>={source:'behindthename',operation,query,locator:locator.href,retrievedAt:response.fetchedAt,data:validated.data};
      const directive=response.cacheControl??'';
      const maxAge=directive.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i)?.[1];
      const ttl=/\b(?:no-store|no-cache)\b/i.test(directive)?0:Math.min(this.#ttl,maxAge===undefined?this.#ttl:Number(maxAge)*1000);
      if(this.#max&&ttl){this.#cache.set(key,{record:structuredClone(record),expires:this.#now().getTime()+ttl});while(this.#cache.size>this.#max)this.#cache.delete(this.#cache.keys().next().value!);}
      return record;
    };
    const request=this.#tail.then(run);this.#tail=request.catch(()=>{});
    if(!signal)return request;
    return new Promise((resolve,reject)=>{const abort=()=>reject(new SourceError('aborted','Source request cancelled'));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});request.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
  }
}
