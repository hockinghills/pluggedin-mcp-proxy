# Project Brief: pluggedin-mcp

*This file is the foundation of the Memory Bank. It defines the core requirements and goals of the project.*

## Project Name

pluggedin-mcp

## Overview

This project is an MCP (Model Context Protocol) server that acts as a dynamic proxy for other MCP servers. It connects to a backend service (pluggedin-app) to discover and manage user-configured downstream MCP servers. It aggregates the capabilities (tools, resources, prompts) of these downstream servers and presents them through a single MCP interface. This allows clients (like Cline, Cursor, Claude) to interact with multiple MCP servers via this single proxy endpoint.

## Core Requirements

*   Act as a compliant MCP server.
*   Connect to the `pluggedin-app` backend using an API key to fetch the list of configured downstream MCP servers.
*   Establish sessions with downstream MCP servers.
*   Proxy MCP requests (tools/list, tools/call, resources/list, resources/templates/list, resources/read, prompts/list, prompts/get) to the appropriate downstream servers.
*   Aggregate responses from downstream servers.
*   Prefix tool/prompt/resource names with the source server name for clarity.
*   Provide static tools (`get_pluggedin_tools`, `call_pluggedin_tool`) for discovery and execution, compatible with platforms like Smithery.
*   Optionally filter active/inactive tools based on `pluggedin-app` settings.

## Goals

*   Simplify MCP server management for users by providing a single point of connection.
*   Enable centralized control (activation/deactivation) of MCP servers via the `pluggedin-app` interface.
*   Abstract away the complexity of connecting to multiple MCP servers for clients.
*   Securely manage API keys/credentials by keeping them within the proxy/backend, not exposed directly to the client.
*   Be discoverable and configurable on platforms like Smithery.

## Scope

*   **In Scope:** MCP proxy functionality for tools, resources, resource templates, and prompts. Fetching server configurations from `pluggedin-app`. Static tool implementation for discovery platforms. Version management. Basic error handling and logging.
*   **Out of Scope:** User interface (provided by `pluggedin-app`). Direct management of downstream server configurations (handled by `pluggedin-app`). Complex authentication flows beyond API keys for the proxy itself (downstream servers handle their own auth).
