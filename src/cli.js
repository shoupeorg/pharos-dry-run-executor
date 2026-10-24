#!/usr/bin/env node
import{readFile}from"node:fs/promises";import{simulateLive}from"./mcp.js";
const input=JSON.parse(await readFile(process.argv[2],"utf8"));console.log(JSON.stringify(await simulateLive(input),null,2));

