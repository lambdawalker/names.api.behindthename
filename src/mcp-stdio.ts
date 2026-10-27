#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createBehindTheNameMcpServer } from './mcp.js';
try{
 const apiKey=process.env.BEHINDTHENAME_API_KEY;if(!apiKey)throw Error('configuration');
 await createBehindTheNameMcpServer({clientOptions:{apiKey}}).connect(new StdioServerTransport());
}catch{console.error('Behind the Name MCP startup failed; set BEHINDTHENAME_API_KEY in the server environment.');process.exitCode=1;}
