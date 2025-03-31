# Progress: pluggedin-mcp

*This file tracks the current state of the project: what's working, what's left, and known issues.*

## Current Status (as of 2025-03-29)

The core proxy functionality for tools, resources, and prompts is implemented. Recent work focused on refactoring tool discovery to ensure compatibility with platforms like Smithery by introducing static `get_pluggedin_tools` and `call_pluggedin_tool` tools. Versioning has been updated. The next phase involves implementing related features (resource template display, server notes) in the companion `pluggedin-app`.

## What's Working

*   Basic MCP server structure.
*   Fetching downstream server configurations from `pluggedin-app` via API key.
*   Establishing sessions with downstream servers.
*   Proxying `resources/list`, `resources/read`, `prompts/list`, `prompts/get` requests.
*   Static `tools/list` response providing `get_pluggedin_tools` and `call_pluggedin_tool`.
*   Execution logic for `get_tools` (fetches and aggregates proxied tools, handles missing API key).
*   Execution logic for `tool_call` (finds downstream server and proxies tool call, handles missing API key).
*   Dynamic version loading from `package.json` (currently `0.4.8`).
*   Basic CLI argument handling (`commander`).
*   Containerization setup (`Dockerfile` updated to use `pnpm` and `node:20-slim`, `docker-compose.yml`).
*   `package.json` updated with correct Smithery identifier (`@VeriTeknik/pluggedin-mcp-proxy`) and includes `smithery.yaml` in published files.
*   `smithery.yaml` description tweaked to potentially bust caches.
*   Tool reporting (`report-tools.ts`) and inactive tool fetching (`fetch-tools.ts`) functionality confirmed compatible with fixed `pluggedin-app` backend API (`/api/tools`).

## What's Left to Build (in `pluggedin-mcp`)

*   **Resource Template Proxying:** Verify the `resources/templates/list` handler correctly proxies requests and aggregates results (code exists but needs confirmation/testing in light of recent changes).
*   **Refinement:**
    *   Improve efficiency of `findClientForTool` in `call-pluggedin-tool.ts` (currently re-fetches/re-maps on every call). Consider caching or a shared mapping.
    *   Refactor the temporary result wrapping in the `tools/call` handler for `get_pluggedin_tools` to ensure it returns the correct `CallToolResult` format.
*   **Robust Error Handling:** Enhance error handling for downstream server communication and API interactions.
*   **Testing:** Add more comprehensive unit or integration tests.

## Known Issues & Bugs

*   Potential inefficiency in `CallPluggedinToolTool.findClientForTool` due to re-fetching/re-mapping on each call.
*   Temporary result wrapping for `get_pluggedin_tools` execution within the `tools/call` handler needs proper refactoring.

## Future Considerations

*   More sophisticated caching for downstream server capabilities.
*   Support for more complex authentication schemes if needed for the proxy itself (unlikely) or for reporting back to `pluggedin-app`.
*   Integration with potential future "MCP Server Creator" functionality in `pluggedin-app`.
