# Product Context: pluggedin-mcp

*This file describes the "why" behind the project, the problems it solves, and the desired user experience.*

## Problem Statement

Users utilizing multiple MCP servers (e.g., for GitHub, weather, filesystem) face challenges:
1.  **Configuration Overhead:** Each client application (Cline, Cursor, Claude Desktop) needs to be configured individually with all desired MCP servers.
2.  **Credential Management:** API keys and sensitive configurations for downstream servers might need to be duplicated across clients or exposed directly.
3.  **Discovery Complexity:** Keeping track of available tools and resources across multiple servers can be difficult.
4.  **Platform Compatibility:** Some discovery platforms (like Smithery) might not easily handle dynamic proxy servers without specific static entry points.

## Target Audience

*   Users of MCP client applications (Cline, Cursor, Claude Desktop, etc.).
*   Developers or users who utilize multiple MCP servers for various tasks.
*   Users of the `pluggedin-app` web interface for managing MCP servers.

## Proposed Solution

`pluggedin-mcp` acts as a central proxy server. Users configure this single proxy server in their client applications. The proxy then connects to the `pluggedin-app` backend to get the list of actual downstream MCP servers the user wants to use. It dynamically aggregates the capabilities of these active downstream servers and exposes them through its own MCP interface. It also provides static `get_pluggedin_tools` and `call_pluggedin_tool` endpoints to ensure compatibility with discovery platforms like Smithery.

## User Experience Goals

*   **Simplicity:** Users only need to configure one MCP server (`pluggedin-mcp`) in their clients.
*   **Centralization:** Management (adding, removing, activating/deactivating servers and their tools) is handled centrally via the `pluggedin-app` web UI.
*   **Security:** Downstream server credentials are managed by the proxy/backend, not exposed directly in the client configuration.
*   **Transparency:** Proxied tools and resources are clearly identified by prefixing their names with the source server.
*   **Compatibility:** Works seamlessly with standard MCP clients and discovery platforms.

## Key Features (from a User/Client Perspective)

*   Single MCP endpoint for accessing multiple downstream servers.
*   Dynamic aggregation of tools, resources, and prompts from active downstream servers.
*   Static `get_pluggedin_tools` tool for discovering available proxied tools.
*   Static `call_pluggedin_tool` tool for executing proxied tools using their prefixed names.
*   Automatic fetching of server configurations from the `pluggedin-app` backend via API key.
