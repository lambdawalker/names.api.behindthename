import { describe, it, expect, vi } from 'vitest';
import { BehindTheNameClient, SourceError, RateBudget } from '../src/index.js';
const key = 'private-test-key+/=';
const lookup = [{ name: 'John', gender: 'm', usages: [{ usage_code: 'eng', usage_full: 'English', usage_gender: 'm' }] }];
const json = (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), init);
const make = (fetcher: typeof fetch, more = {}) => new BehindTheNameClient({ apiKey: key, fetch: fetcher, intervalMs: 0, budget: new RateBudget([{windowMs:1000,limit:10000}]), ...more });
it('builds exact lookup and related filters without exposing the key in records', async () => {
 const urls: URL[] = []; const c = make(async (u, init) => { urls.push(new URL(String(u))); expect(init?.redirect).toBe('error'); return json(urls.length === 1 ? lookup : { names: ['Juan', 'Giovanni'] }); });
 const a = await c.lookup('John', { exact: true }); const b = await c.related('John', { usage: 'spa', gender: 'm' });
 expect(urls[0]!.searchParams.get('key')).toBe(key); expect(urls[0]!.searchParams.get('exact')).toBe('yes'); expect(urls[1]!.searchParams.get('usage')).toBe('spa');
 expect(a.data).toEqual(lookup); expect(b.data).toEqual({ names: ['Juan', 'Giovanni'] }); expect(JSON.stringify([a,b])).not.toContain(key); expect(a.locator).not.toContain('key='); expect(a.query).toEqual({ name: 'John', exact: true });
});
it('validates configuration and query input without echoing values or calling upstream', async () => {
 let calls = 0; const c = make(async () => { calls++; return json(lookup); });
 for (const name of ['', ' ', 'x'.repeat(257)]) await expect(c.lookup(name)).rejects.toBeInstanceOf(SourceError);
 await expect(c.related('John', { usage: 'en&key=oops' })).rejects.toBeInstanceOf(SourceError);
 expect(calls).toBe(0); expect(() => new BehindTheNameClient({ apiKey: '' })).toThrow();
});
it('caches success and empty results by operation and full query and isolates mutations', async () => {
 let now = 0, calls = 0; const c = make(async () => { calls++; return json([]); }, { now: () => new Date(now), cacheTtlMs: 1000 });
 const a = await c.lookup('John'); a.data.push(lookup[0]!); now = 500;
 const b = await c.lookup('John'); expect(b.data).toEqual([]); expect(b.retrievedAt).toBe(a.retrievedAt); expect(calls).toBe(1);
 await c.lookup('John', { exact: true }); expect(calls).toBe(2); now = 1001; await c.lookup('John'); expect(calls).toBe(3);
});
it('does not cache transient HTTP failures or upstream API errors', async () => {
 let calls = 0; const c = make(async () => { calls++; return calls === 1 ? json({}, {status: 503}) : calls === 2 ? json({ error_code: 1, error: key }) : json(lookup); });
 await expect(c.lookup('John')).rejects.toMatchObject({code:'http'}); await expect(c.lookup('John')).rejects.toMatchObject({code:'api_error'}); expect((await c.lookup('John')).data).toEqual(lookup); expect(calls).toBe(3);
});
it.each([null, {}, [{name:'John'}], {names:['John']}])('rejects malformed lookup responses', async data => { await expect(make(async () => json(data)).lookup('John')).rejects.toMatchObject({code:'invalid_response'}); });
it.each([[], {names:[1]}, {names:['']}, null])('rejects malformed related responses', async data => { await expect(make(async () => json(data)).related('John')).rejects.toMatchObject({code:'invalid_response'}); });
it('redacts network errors and successful responses reflecting credentials', async () => {
 const c = make(async u => { throw Error(String(u)); });
 try { await c.lookup('John'); throw Error('expected failure'); } catch(e) { expect(e).toBeInstanceOf(SourceError); expect(String(e)).not.toContain(key); expect((e as Error).cause).toBeUndefined(); }
 await expect(make(async () => json([{...lookup[0],name:key}])).lookup('John')).rejects.toMatchObject({code:'invalid_response'});
});
it('bounds streamed bodies and suppresses raw JSON errors', async () => {
 await expect(make(async () => json(lookup), {maxResponseBytes:10}).lookup('John')).rejects.toMatchObject({code:'response_too_large'});
 await expect(make(async () => new Response(key)).lookup('John')).rejects.toMatchObject({code:'invalid_response'});
});
it('returns Retry-After without hidden retry requests', async () => {
 let calls = 0; const c = make(async () => { calls++; return json({error:key}, {status:429,headers:{'Retry-After':'120'}}); });
 await expect(c.lookup('John')).rejects.toMatchObject({code:'rate_limited',retryAfterMs:120000}); expect(calls).toBe(1);
});
it('enforces timeout and caller cancellation including a fetch ignoring abort', async () => {
 await expect(make(async () => new Promise(() => {}), {timeoutMs:10}).lookup('John')).rejects.toMatchObject({code:'timeout'});
 const controller = new AbortController(); controller.abort(); let calls = 0;
 await expect(make(async () => { calls++; return json(lookup); }).lookup('John',{signal:controller.signal})).rejects.toMatchObject({code:'aborted'}); expect(calls).toBe(0);
});
it('serializes concurrent requests and serves queued duplicate from cache', async () => {
 let active = 0, peak = 0, calls = 0; const c = make(async () => { calls++; active++; peak=Math.max(peak,active); await new Promise(r=>setTimeout(r,5)); active--; return json(lookup); });
 await Promise.all([c.lookup('John'),c.lookup('John'),c.lookup('Juan')]); expect(peak).toBe(1); expect(calls).toBe(2);
});
it('uses bounded LRU entries and expiry, never caching errors', async () => {
 let calls=0; const c=make(async()=>{calls++;return json(lookup);},{cacheMaxEntries:1}); await c.lookup('A');await c.lookup('B');await c.lookup('A');expect(calls).toBe(3);
});
it('enforces rolling budgets and counts failed attempts', async () => {
 const budget=new RateBudget([{windowMs:1000,limit:2}]); expect(budget.reserve(0)).toBe(0);expect(budget.reserve(1)).toBe(0);expect(budget.reserve(2)).toBe(998);expect(budget.reserve(1000)).toBe(0);
 const c=make(async()=>{throw Error(key);},{budget:new RateBudget([{windowMs:1000,limit:1}])});await expect(c.lookup('A')).rejects.toMatchObject({code:'network'});await expect(c.lookup('B')).rejects.toMatchObject({code:'rate_limited'});
});
it('cancelled queued callers never make a later request', async () => {
 let calls=0; const c=make(async()=>{calls++;await new Promise(r=>setTimeout(r,20));return json(lookup);});const first=c.lookup('John');const ctl=new AbortController();const queued=c.lookup('Juan',{signal:ctl.signal});ctl.abort();await expect(queued).rejects.toMatchObject({code:'aborted'});await first;await c.lookup('John');expect(calls).toBe(1);
});
it('spaces starts by the configured interval', async()=>{
 vi.useFakeTimers();try{const times:number[]=[];const c=make(async()=>{times.push(Date.now());return json(lookup);},{intervalMs:500});const a=c.lookup('A');const b=c.lookup('B');await vi.runAllTimersAsync();await Promise.all([a,b]);expect(times[1]!-times[0]!).toBeGreaterThanOrEqual(500);}finally{vi.useRealTimers();}
});
it('does not export credentials escaped inside successful JSON strings',async()=>{
 const unusual='key"with\\escapes';const c=new BehindTheNameClient({apiKey:unusual,fetch:async()=>json([{...lookup[0],name:unusual}])});await expect(c.lookup('John')).rejects.toMatchObject({code:'invalid_response'});
});
it('respects provider no-store and shorter max-age directives',async()=>{
 let calls=0,now=0;const c=make(async()=>{calls++;return json(lookup,{headers:{'Cache-Control':calls<3?'no-store':'max-age=1'}});},{now:()=>new Date(now)});
 await c.lookup('John');await c.lookup('John');expect(calls).toBe(2);await c.lookup('John');await c.lookup('John');expect(calls).toBe(3);now=1001;await c.lookup('John');expect(calls).toBe(4);
});
