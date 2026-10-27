# Linux and Windows setup

Install Node.js 24 LTS or newer and Git. On Linux, use your preferred Node version manager or distribution installation; verify `node --version` is at least 24. On Windows, `winget install OpenJS.NodeJS.LTS` installs the current LTS; reopen your terminal and verify its version.

## Get an API key

1. [Register](https://www.behindthename.com/members/register) or sign in to Behind the Name.
2. Open the [API key form](https://www.behindthename.com/api/edit.php) and complete it.
3. Your key and usage information are available in the [API gateway](https://www.behindthename.com/api/).

Keep the key on your computer; do not paste it into chats, tracked configuration, tool arguments or issue reports. No credential vault setup is required for this client. The research storage API token is a separate credential.

## Install

Same commands on Linux and PowerShell:

```sh
git clone https://github.com/lambdawalker/names.api.behindthename.git
cd names.api.behindthename
npm ci
npm test
npm run typecheck
```

`npm ci` builds the library and CLI through the prepare script.

## Configure and run

Create a `.env` file in the checkout using your editor, containing:

```dotenv
BEHINDTHENAME_API_KEY=replace_with_your_actual_key
```

`.env` is ignored by Git. Linux users can restrict it with `chmod 600 .env`; on Windows keep it in your user-owned directory. Node reads it explicitly; no dotenv dependency is needed:

```sh
node --env-file=.env dist/cli.js lookup John --exact
node --env-file=.env dist/cli.js related John --usage eng --gender m
node --env-file=.env dist/cli.js lookup John --document --output john-document.json
node --env-file=.env dist/cli.js related John --markdown --output john-related.md
node --env-file=.env scripts/smoke.mjs
```

`--output` refuses to overwrite an existing file. `--document` produces the storage document payload with metadata-only retention by default. `--markdown` explicitly writes source content to your chosen file; check your permission to retain it. API data is not automatically licensed for redistribution.

If you already set the environment variable through your shell or process manager, omit `--env-file=.env`; `npm run smoke` and `npm run mcp` read that environment. Keys are never passed as CLI arguments.

## MCP configuration

Use your MCP host's environment or secret configuration. Example using Node's ignored environment file, with absolute paths on your machine:

```json
{
  "mcpServers": {
    "behindthename": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/names.api.behindthename/.env",
        "/absolute/path/names.api.behindthename/dist/mcp-stdio.js"
      ]
    }
  }
}
```

For Windows use paths such as `C:/dev/names.api.behindthename/.env` and `C:/dev/names.api.behindthename/dist/mcp-stdio.js`. Forward slashes avoid JSON escaping issues. Tools are `lookup_name` and `related_names`. This MCP server can be used beside the Wiktionary and Wikidata servers; adding it to orchestrator workflow policy is a separate integration step.

## Storage compatibility check

Build the `names.research.store` checkout first. Linux:

```sh
STORE_CHECKOUT=../names.research.store npm run store:integration
```

PowerShell:

```powershell
$env:STORE_CHECKOUT = "../names.research.store"
npm run store:integration
```

This check uses synthetic source data and a temporary authenticated SQLite service, and requires neither a real API key nor Neo4j. The service's graph projection is outside this source-client test.

## Troubleshooting

- `configuration_or_arguments`: check the key is set, `--env-file` points to the right file, command syntax is valid, and the output file does not already exist.
- `api_error`: verify the key and account access; raw provider errors are suppressed to protect credentials.
- `rate_limited`: respect `retryAfterMs` when supplied. A new CLI launch does not restore your provider quota.
- `invalid_response`: the provider may have changed its response shape. Run the live smoke check locally; do not post authenticated URLs or response dumps containing secrets.
- `response_too_large`: lower the MCP result limit. HTTP responses over 1 MiB are rejected rather than truncated silently.
