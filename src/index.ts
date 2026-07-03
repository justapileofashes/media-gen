#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const server = createServer(cfg);
  await server.connect(new StdioServerTransport());
  // stderr only — stdout is the MCP protocol channel
  console.error(`media-gen ready (output: ${cfg.outputDir}, providers: ${Object.keys(cfg.keys).join(", ") || "none"})`);
}

main().catch((e) => {
  console.error(`media-gen failed to start: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
