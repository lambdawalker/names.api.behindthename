/** Rolling attempt quotas. Share one budget/client per key. State is process-local. */
export class RateBudget {
  #windows: { windowMs: number; limit: number; attempts: number[] }[];
  constructor(windows = [{windowMs:1000,limit:2},{windowMs:3600000,limit:400},{windowMs:86400000,limit:4000},{windowMs:366*86400000,limit:400000}]) {
    if (!windows.length || windows.some(w=>!Number.isSafeInteger(w.windowMs)||w.windowMs<1||!Number.isSafeInteger(w.limit)||w.limit<1)) throw new TypeError('Invalid rate budget');
    this.#windows = windows.map(w=>({...w,attempts:[]}));
  }
  /** Zero admits and charges an attempt. Otherwise returns the necessary wait. */
  reserve(now: number): number {
    let wait=0;
    for(const w of this.#windows){while(w.attempts.length && w.attempts[0]! <= now-w.windowMs) w.attempts.shift();if(w.attempts.length>=w.limit) wait=Math.max(wait,w.attempts[0]!+w.windowMs-now);}
    if(!wait) for(const w of this.#windows) w.attempts.push(now);
    return wait;
  }
}
