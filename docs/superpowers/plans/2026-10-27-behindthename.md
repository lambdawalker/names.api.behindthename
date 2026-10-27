# Behind the Name client implementation plan

Goal: implement the approved lookup and related-name client in TypeScript, matching the existing clients.
Architecture: typed source client, fixed HTTPS transport, bounded in-memory cache and quotas, evidence adapter, CLI and read-only MCP. No orchestrator or database schema changes are required.
Constraints: Node 24+, credentials supplied by server environment only; never export authenticated URLs or upstream errors. Preserve source usage codes and ambiguous lookup results. Related names do not establish direction, borrowing or derivation. Default document retention is metadata_only and public reuse restricted; API responses are not the CC BY-SA downloads.

1. Client and transport: write failing tests for lookup/related parameters, response validation, errors and key redaction, timeout, cancellation, response limits, concurrent serialization, cache isolation, expiry, quota exhaustion. Implement and run tests/typecheck.
2. Evidence: write failing tests for deterministic Markdown, content hashes, retrieval identity, restricted reuse and metadata-only retention, exact query context. Implement source/evidence finding adapter without invented historical edges. Verify against the real storage service including restart/idempotent replay.
3. Interfaces: write failing tests for CLI option/key handling and real MCP tools, bounded output and cancellation. Implement CLI and stdio MCP with exactly lookup_name and related_names. Add Linux/Windows setup and opt-in live smoke.
4. Verify complete suite, typecheck, package, installation and security checks; review. Publish feature PR, leaving main unchanged.

Live authenticated validation requires the user-owned API key and remains explicitly pending if unavailable.

## Execution record

Implemented the approved scope without additional orchestration or schema changes. Client/transport tests, evidence tests, CLI and actual MCP tests pass (33 total); TypeScript typecheck and clean offline npm ci pass. The real storage HTTP/SQLite compatibility script confirms metadata-only default, Markdown deduplication, replay idempotency and restart recovery. An independent review identified the same escaped-credential case covered by a newly failing-then-passing regression. Provider cache directives also have regression coverage. Live authenticated validation remains pending without a user-owned key.
