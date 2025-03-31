# Active Context: pluggedin-mcp

*This file tracks the current focus of work, recent changes, and immediate next steps.*

## Current Focus

*   Implementing Resource Template discovery and display in the associated `pluggedin-app`.
*   Implementing a "Notes" feature for MCP servers within `pluggedin-app`.
*   Ensuring `pluggedin-mcp` correctly proxies `resources/templates/list` requests.

## Recent Changes (as of 2025-03-29)

*   **Smithery Compatibility:** Refactored the tool handling mechanism to address issues with discovery on platforms like Smithery.
    *   Introduced two static tools: `get_pluggedin_tools` (for discovering proxied tools) and `call_pluggedin_tool` (for executing proxied tools).
    *   Modified the `tools/list` handler to always return these static tools.
            *   Modified the `tools/call` handler to route requests to the appropriate static tool's execution logic.
*   **Smithery Fixes (cont.):**
    *   Removed eager `initSessions()` call from server startup.
    *   Modified static tools (`get_tools`, `tool_call`) to handle missing API key during execution without throwing errors during probes.
    *   Updated `Dockerfile` to use `pnpm` and switched base image to `node:20-slim`.
    *   Corrected package name in `package.json` to match the Smithery identifier (`@VeriTeknik/pluggedin-mcp-proxy`).
    *   Added `smithery.yaml` to `files` array in `package.json` to ensure it's included in the published package.
    *   Made minor change to `smithery.yaml` description field to potentially bust caches.
*   **Tool Management Backend Fixed:** Corresponding database tables (`toolsTable`) and API endpoints (`/api/tools`) were fixed/re-added in the `pluggedin-app` backend. `pluggedin-mcp`'s existing logic for reporting tools and fetching inactive tool statuses should now function correctly when the `TOOLS_MANAGEMENT` capability is enabled for a profile.
*   **Versioning:** Updated server version dynamically read from `package.json` (currently `0.4.8`).
*   **Memory Bank:** Populated and updated memory bank files.

## Next Steps

1.  **Implement `pluggedin-app` changes:**
    *   Modify database schema (`db/schema.ts`) to add `resource_templates` table and `notes` column to `mcp_servers` table.
    *   Create Drizzle migrations for schema changes.
    *   Implement backend API endpoints in `pluggedin-app` for fetching/storing templates (including variable parsing) and reading/writing server notes.
    *   Update frontend UI in `pluggedin-app` to display resource templates (with variables) and the notes section.
2.  **Verify `pluggedin-mcp`:** Double-check that the `resources/templates/list` handler in `pluggedin-mcp` correctly proxies requests.
3.  **Testing:** Test the end-to-end flow of template discovery/display and notes functionality.
4.  **Documentation:** Update READMEs and memory banks as needed upon completion.

## Active Decisions & Considerations

*   **Resource Template Variable Parsing:** Need to implement the regex logic (`/\{([^}]+)\}/g`) to extract variables from `uri_template` strings in the `pluggedin-app` backend.
*   **Database Type for Variables:** Decide on the best DB type for `template_variables` (e.g., `TEXT[]` in Postgres, or JSON). JSON might be more flexible.
*   **Template Fetching Strategy:** Decide when `pluggedin-app` should fetch/refresh templates from `pluggedin-mcp` (on-demand, periodic background job, etc.). On-demand when viewing server details seems like a reasonable starting point.
*   **Error Handling:** Ensure robust error handling for API calls between `pluggedin-app` and `pluggedin-mcp`, and between `pluggedin-mcp` and downstream servers.
