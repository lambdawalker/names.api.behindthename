#!/usr/bin/env node
import { createBehindTheNameMcpServer } from './mcp.js';
import {startConfiguredService} from './local-service.js';
try {await startConfiguredService('behindthename',(config,token)=>createBehindTheNameMcpServer({clientOptions:{apiKey:token??"not-configured"}}),true);}catch{console.error('Service startup failed; check configuration, control token and port.');process.exitCode=1;}
