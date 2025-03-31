#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp-proxy.js";
import { Command } from "commander";
import { reportAllTools } from "./report-tools.js";
import { cleanupAllSessions } from "./sessions.js";

const program = new Command();

program
  .name("pluggedin-mcp-proxy")
  .description("PluggedinMCP MCP Server - The One MCP to manage all your MCPs")
  .option(
    "--pluggedin-api-key <key>",
    "API key for PluggedinMCP (can also be set via PLUGGEDIN_API_KEY env var)"
  )
  .option(
    "--pluggedin-api-base-url <url>",
    "Base URL for PluggedinMCP API (can also be set via PLUGGEDIN_API_BASE_URL env var)"
  )
  .option(
    "--report",
    "Fetch all MCPs, initialize clients, and report tools to PluggedinMCP API"
  )
  .parse(process.argv);

const options = program.opts();

// Set environment variables from command line arguments
if (options.PLUGGEDIN_API_KEY) {
  process.env.PLUGGEDIN_API_KEY = options.PLUGGEDIN_API_KEY;
}
if (options.pluggedinApiBaseUrl) {
  process.env.PLUGGEDIN_API_BASE_URL = options.pluggedinApiBaseUrl;
}

async function main() {
  // If --report flag is set, run the reporting function instead of starting the server
  if (options.report) {
    await reportAllTools();
    await cleanupAllSessions();
    return;
  }

  const transport = new StdioServerTransport();

  const { server, cleanup } = await createServer();

  // Connect the server to the transport
  await server.connect(transport);

  // Note: Debug logging for raw outgoing messages needs to be implemented
  // within the transport layer or by modifying the SDK if direct access is needed.
  // The wrapper attempt here was incorrect due to type mismatches.

  const handleExit = async () => {
    await cleanup();
    await transport.close();
    await server.close();
    process.exit(0);
  };

  // Cleanup on exit
  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  process.stdin.resume();
  process.stdin.on("end", handleExit);
  process.stdin.on("close", handleExit);
}

main().catch((error) => {
  console.error("Server error:", error);
});
