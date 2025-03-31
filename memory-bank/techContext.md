# Tech Context: pluggedin-mcp

*This file outlines the technologies used, development setup, technical constraints, and dependencies.*

## Core Technologies

*   **Language:** TypeScript
*   **Runtime:** Node.js
*   **MCP SDK:** `@modelcontextprotocol/sdk` (for server creation, types, client interaction)
*   **HTTP Client:** `axios` (for communicating with `pluggedin-app` API)
*   **CLI Arguments:** `commander`
*   **Validation:** `zod` (used implicitly by MCP SDK for schema validation)

## Development Environment Setup

*   Node.js (check `package.json` for specific version requirements, likely latest LTS)
*   `pnpm` (preferred package manager, based on `pnpm-lock.yaml`)
*   TypeScript compiler (`tsc`)
*   Environment Variables (or CLI args):
    *   `PLUGGEDIN_API_KEY`: API key for authenticating with the `pluggedin-app` backend.
    *   `PLUGGEDIN_API_BASE_URL`: Base URL for the `pluggedin-app` backend API (defaults might exist in code).

*Setup Steps:*
1.  Clone the repository.
2.  Install dependencies: `pnpm install`
3.  Configure environment variables (e.g., in a `.env` file or export them).
4.  Compile TypeScript: `pnpm run build` (or equivalent script in `package.json`)
5.  Run the server: `node build/index.js` (or use the configured `start` script if available)
    *   Provide `--pluggedin-api-key` and `--pluggedin-api-base-url` via CLI if not using environment variables.

## Build & Deployment Process

*   **Build:** `pnpm run build` compiles TypeScript code in `src/` to JavaScript in `build/`.
*   **Deployment:** Typically run as a Node.js process. Can be containerized using the provided `Dockerfile` and `docker-compose.yml`. Requires environment variables (`PLUGGEDIN_API_KEY`, `PLUGGEDIN_API_BASE_URL`) to be set in the deployment environment.

## Technical Constraints

*   Relies on the availability and responsiveness of the `pluggedin-app` backend API.
*   Performance depends on the latency and performance of the downstream MCP servers it proxies.
*   Requires Node.js environment.

## Key Dependencies

*   `@modelcontextprotocol/sdk`: Core MCP functionality.
*   `axios`: HTTP requests to `pluggedin-app`.
*   `commander`: CLI argument parsing.
*   `pluggedin-app` Backend: Provides the list of downstream servers and their configurations.

## Code Style & Conventions

*   TypeScript.
*   Likely follows standard TypeScript/Node.js conventions. Check for linters/formatters (e.g., ESLint, Prettier) if configured.
*   Uses ES Module syntax (`import`/`export`).
