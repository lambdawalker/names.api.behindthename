# names.api.behindthename

TypeScript client for Behind the Name lookup and related-name discovery, with bounded read-only MCP, CLI, caching and Markdown evidence adapters. Requires Node.js 24+ and an API key.

## Setup

```sh
git clone https://github.com/lambdawalker/names.api.behindthename.git
cd names.api.behindthename
npm ci
npm test
```

[Linux and Windows setup](docs/setup.md) includes API-key registration, environment configuration, CLI and MCP examples. No npm release is required: the checkout builds with `npm ci`, or install directly from Git with `npm install github:lambdawalker/names.api.behindthename`.

## Library

```ts
import { BehindTheNameClient, toDocumentInput, toDiscoveryFinding } from '@lambdawalker/names-api-behindthename';

const client = new BehindTheNameClient({ apiKey: process.env.BEHINDTHENAME_API_KEY! });
const lookup = await client.lookup('John', { exact: true });
const related = await client.related('John', { usage: 'eng', gender: 'm' });
const document = toDocumentInput(related); // metadata_only retention by default
const finding = toDiscoveryFinding(related); // source + evidence, no invented edges
```

Lookup retains every returned match, including native spelling, gender and provider usage codes/labels. `exact: true` sends `exact=yes` to distinguish missing diacritics. Usage codes are provider-specific: `eng` must not silently become ISO language code `en`. Source gender values are preserved, not treated as population statistics.

Related names are **discovery candidates**. The API does not establish roots, historical paths or borrowing direction. The client never creates origin, relationship or language-specific usage claims automatically. The original etymology articles are outside this API. Random-name generation is intentionally out of scope.

Records contain the operation, full query, key-free locator and original retrieval time. There is no upstream revision identifier; do not treat a retrieval timestamp as a source revision. Cache hits retain their original retrieval time. The server uses the key in the HTTPS query string as required by the provider, disables redirects, and removes credentials from exported records and error messages. Do not enable HTTP tracing that records authenticated URLs.

## Cache and quotas

Each client serializes calls, spaces starts by at least 500 ms, and caches validated successes (including empty responses) for five minutes in a 100-entry LRU. Keys include operation, name, exactness, usage and gender. Provider no-store/no-cache and shorter max-age directives take precedence. Failed requests are not cached. Cached records are copied before returning. No automatic retries are performed; `SourceError.code` and `retryAfterMs` let the caller choose when to retry.

Rolling attempt budgets enforce 2/second, 400/hour, 4,000/day, and 400,000 per conservative 366-day year. Attempts count even when upstream fails. Local exhaustion fails promptly with `rate_limited`, rather than sleeping for hours. HTTP 429 exposes Retry-After when supplied. Defaults: 15-second request timeout (including streamed body), 1 MiB response limit. `AbortSignal` cancels queued and active requests.

**Cache and budget are process-local.** Share one long-lived client per key, or a shared `RateBudget` across clients in one process. CLI launches and restarts reset local state. Multiple processes or other applications using the same key need external shared quota coordination and a durable cache, such as the research service's SQL cache. This package does not claim account-wide persistent rate enforcement.

## Evidence and storage

`toDocumentInput(record)` returns a storage-compatible Markdown document and separate retrieval provenance. Identical content has identical Markdown across retrievals; source identities include retrieval time. The default is `retention: metadata_only`, with `public_reuse: restricted` and no asserted open license. API responses must not inherit the CC BY-SA license of separate downloadable datasets.

If your permissions permit retaining response content locally, pass `{ retainContent: true }` to both document and finding adapters. This sets document retention to `allowed` and adds the exact structured response to the evidence's supporting text; it does not change public reuse. `documentId` can link the resulting finding to the stored document. These options do not grant additional rights.

Default findings preserve a citation and a candidate note without copying response data. No database schema change is needed. When linking discovered names later, the research agent must establish form identity, language and cited historical relationships separately.

## MCP

`npm run mcp` exposes only `lookup_name` and `related_names`, accepting the same query options plus `offset`, `limit` (1–100; default 20), and `snapshot`. Pass the returned snapshot for continuation pages; if cache refresh changes the snapshot, restart at zero. Results are capped at 64 KiB including the MCP envelope; reduce `limit` when necessary. Tool schemas never accept API keys, URLs, SQL or database commands. Set the key only in the MCP server environment. Read-only annotations concern the provider; the server maintains an in-memory cache and attempt budget.

## Validation

```sh
npm test
npm run typecheck
npm pack --dry-run
# Optional authenticated live check (two upstream calls):
npm run smoke
# Against a built checkout of names.research.store:
STORE_CHECKOUT=../names.research.store npm run store:integration
```

Offline tests use synthetic responses, not redistributed API data. The compatibility script tests the real authenticated HTTP/SQLite service, Markdown deduplication, idempotent findings, metadata-only defaults and restart recovery. The opt-in smoke check is required before claiming live API validation; it is not run in untrusted PR CI.

## Sources

- [API setup and limits](https://www.behindthename.com/api/)
- [API endpoint documentation](https://www.behindthename.com/api/help.php)
- [Terms](https://www.behindthename.com/info/terms)

Code: MIT. Source data retains the provider's rights.

## Managed local API and in-memory credentials

This project ships `config.default.yaml` (loopback port **4321**) and `npm run serve`. In managed mode, the orchestrator launches the service with a per-boot control credential, checks its boot identity and sends the provider credential to authenticated `POST /v1/credentials`. Keys are held in memory; none belong in YAML. `{"token":null}` clears the credential. Public providers do not need a provider token.

`GET /v1/tools` lists tool definitions; `POST /v1/tools/TOOL_NAME` invokes the existing validated MCP tool. Both require the per-boot control credential. `GET /health` returns non-secret identity/readiness information. `npm run mcp:remote` is a stdio bridge to the local API, using `NAMES_SERVICE_URL` and `NAMES_CONTROL_TOKEN` in the supervising host's memory. The original standalone `npm run mcp` remains available for compatibility.

Use the orchestrator vault/fleet setup to avoid managing plaintext provider-key files. The managed port registry overrides the standalone default port at launch. Credentials/caches are discarded on rotation or process exit; slow requests crossing credential rotation are refused. Browser origins are rejected and listeners bind only to IPv4 loopback. See [the orchestrator setup](https://github.com/lambdawalker/ds.names.orchestrator/blob/main/docs/local-services.md).
