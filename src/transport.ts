import type { ClientOptions } from './types.js';
import { RateBudget } from './budget.js';

export type ErrorCode = 'not_found' | 'http' | 'rate_limited' | 'timeout' | 'aborted' | 'invalid_response' | 'network' | 'response_too_large' | 'api_error' | 'language_not_found' | 'document_too_large';
export class SourceError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status?: number, public readonly retryAfterMs?: number) {
    super(message); this.name = 'SourceError';
  }
}
export interface JsonResult { data: unknown; fetchedAt: string; cacheControl?: string }

function aborted(): SourceError { return new SourceError('aborted', 'Source request cancelled'); }
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw aborted();
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
function retryAfter(header: string | null, now: number): number | undefined {
  if (!header) return;
  if (/^\d+(?:\.\d+)?$/.test(header.trim())) return Math.ceil(Number(header) * 1000);
  const date = Date.parse(header); return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
async function readJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new SourceError('invalid_response', 'Empty source response');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await raceAbort(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new SourceError('response_too_large', 'Source response exceeds byte limit');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new SourceError('invalid_response', 'Source returned invalid JSON'); }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Serial, fixed-origin HTTPS transport. Credentials never leave this boundary. */
export class JsonTransport {
  #tail: Promise<unknown> = Promise.resolve();
  #lastStarted = -Infinity;
  #options: {apiKey:string;fetch:typeof fetch;userAgent:string;timeoutMs:number;intervalMs:number;maxResponseBytes:number;now:()=>Date;budget:RateBudget};
  constructor(options: ClientOptions) {
    if(typeof options.apiKey !== 'string' || !options.apiKey.trim() || options.apiKey.length>512 || /[\s\u0000-\u001f]/.test(options.apiKey)) throw new TypeError('A valid API key is required');
    const o={apiKey:options.apiKey, fetch:options.fetch??globalThis.fetch,userAgent:options.userAgent??'NamesBehindTheName/0.1 (https://github.com/lambdawalker/names.api.behindthename)',timeoutMs:options.timeoutMs??15000,intervalMs:options.intervalMs??500,maxResponseBytes:options.maxResponseBytes??1048576,now:options.now??(()=>new Date()),budget:options.budget??new RateBudget()};
    if(!o.userAgent.trim() || /[\r\n]/.test(o.userAgent)) throw new TypeError('Invalid User-Agent');
    for(const [n,min,max] of [[o.timeoutMs,1,120000],[o.intervalMs,0,60000],[o.maxResponseBytes,1,1048576]]) if(!Number.isInteger(n)||(n ?? 0)<(min ?? 0)||(n ?? 0)>(max ?? 0)) throw new TypeError('Invalid transport limits');
    this.#options=o;
  }
  rejectsSecret(value:string): boolean {
    const key=this.#options.apiKey;
    return [key,JSON.stringify(key).slice(1,-1),encodeURIComponent(key),new URLSearchParams({key}).toString().slice(4)].some(s=>value.includes(s));
  }
  get(operation:'lookup'|'related',params:Record<string,string>,signal?:AbortSignal):Promise<JsonResult>{
    const request=this.#tail.then(()=>this.run(operation,params,signal));this.#tail=request.catch(()=>{});return signal?raceAbort(request,signal):request;
  }
  private async run(operation:'lookup'|'related',params:Record<string,string>,signal?:AbortSignal):Promise<JsonResult>{
    const o=this.#options;
    await delay(Math.max(0,this.#lastStarted+o.intervalMs-Date.now()),signal);
    if(signal?.aborted) throw aborted();
    const wait=o.budget.reserve(o.now().getTime());if(wait) throw new SourceError('rate_limited','Local API attempt budget exhausted',undefined,wait);
    this.#lastStarted=Date.now();
    const url=new URL('https://www.behindthename.com/api/'+operation+'.json');for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);url.searchParams.set('key',o.apiKey);
    const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),o.timeoutMs);const combined=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal;
    try {
      const response=await raceAbort(o.fetch(url,{headers:{Accept:'application/json','User-Agent':o.userAgent},redirect:'error',signal:combined}),combined);
      if(!response.ok){void response.body?.cancel().catch(()=>{});throw new SourceError(response.status===429?'rate_limited':response.status===401||response.status===403?'api_error':'http','Provider request failed',response.status,retryAfter(response.headers.get('Retry-After'),o.now().getTime()));}
      const data=await readJson(response,o.maxResponseBytes,combined);
      if(data && typeof data==='object' && !Array.isArray(data) && ('error' in data || 'error_code' in data)) throw new SourceError('api_error','Provider rejected the request');
      if(this.rejectsSecret(JSON.stringify(data))) throw new SourceError('invalid_response','Provider response contains private configuration');
      return {data,fetchedAt:o.now().toISOString(),cacheControl:response.headers.get('Cache-Control')??undefined};
    } catch(error){
      if(signal?.aborted) throw aborted();if(timeout.signal.aborted) throw new SourceError('timeout','Provider request timed out');if(error instanceof SourceError) throw error;throw new SourceError('network','Provider request failed');
    } finally {clearTimeout(timer);}
  }
}
