export interface ClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  intervalMs?: number;
  maxResponseBytes?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  now?: () => Date;
  budget?: import('./budget.js').RateBudget;
}
export interface SourceRecord<T = unknown> {
  source: 'behindthename';
  operation: 'lookup' | 'related';
  query: { name: string; exact?: boolean; usage?: string; gender?: string };
  locator: string;
  retrievedAt: string;
  data: T;
}
