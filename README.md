# PluggedinMCP MCP Server

[https://plugged.in](https://plugged.in): The One MCP to manage all your MCPs

PluggedinMCP MCP Server is a proxy server that joins multiple MCP⁠ servers into one. It fetches tool/prompt/resource configurations from PluggedinMCP App⁠ and routes tool/prompt/resource requests to the correct underlying server.

[![smithery badge](https://smithery.ai/badge/@VeriTeknik/pluggedin-mcp-proxy)](https://smithery.ai/server/@VeriTeknik/pluggedin-mcp-proxy)


PluggedinMCP App repo: https://github.com/VeriTeknik/pluggedin-app

## Installation

### Installing via Smithery

Sometimes Smithery works (confirmed in Windsurf locally) but sometimes it is unstable because PluggedinMCP is special that it runs other MCPs on top of it. Please consider using manual installation if it doesn't work instead.

To install PluggedinMCP MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@VeriTeknik/pluggedin-mcp-proxy):

```bash
npx -y @smithery/cli install @VeriTeknik/pluggedin-mcp-proxy --client claude
```

### Manual Installation

```bash
export PLUGGEDIN_API_KEY=<env>
npx -y @pluggedin/pluggedin-mcp-proxy@latest
```

```json
{
  "mcpServers": {
    "PluggedinMCP": {
      "command": "npx",
      "args": ["-y", "@pluggedin/pluggedin-mcp-proxy@latest"],
      "env": {
        "PLUGGEDIN_API_KEY": "<your api key>"
      }
    }
  }
}
```

## Highlights

- Compatible with ANY MCP Client
- Multi-Workspaces layer enables you to switch to another set of MCP configs within one-click.
- GUI dynamic updates of MCP configs.
- Namespace isolation for joined MCPs.

## Environment Variables

- PLUGGEDIN_API_KEY: Required. Obtained from PluggedinMCP App's "API Keys" page (https://plugged.in/api-keys).
- PLUGGEDIN_API_BASE_URL: Optional override for PluggedinMCP App URL (e.g. http://localhost:12005).

## Command Line Arguments

You can configure the API key and base URL using command line arguments:

```bash
npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key <your-api-key> --pluggedin-api-base-url <base-url>
```

For help with all available options:

```bash
npx -y @pluggedin/pluggedin-mcp-proxy@latest --help
```

These command line arguments take precedence over environment variables.

## Architecture Overview

```mermaid
sequenceDiagram
    participant MCPClient as MCP Client (e.g. Claude Desktop)
    participant PluggedinMCP-mcp-server as PluggedinMCP MCP Server
    participant PluggedinMCPApp as PluggedinMCP App
    participant MCPServers as Installed MCP Servers in Plugged.in App

    MCPClient ->> PluggedinMCP-mcp-server: Request list tools
    PluggedinMCP-mcp-server ->> PluggedinMCPApp: Get tools configuration & status
    PluggedinMCPApp ->> PluggedinMCP-mcp-server: Return tools configuration & status

    loop For each listed MCP Server
        PluggedinMCP-mcp-server ->> MCPServers: Request list_tools
        MCPServers ->> PluggedinMCP-mcp-server: Return list of tools
    end

    PluggedinMCP-mcp-server ->> PluggedinMCP-mcp-server: Aggregate tool lists
    PluggedinMCP-mcp-server ->> MCPClient: Return aggregated list of tools

    MCPClient ->> PluggedinMCP-mcp-server: Call tool
    PluggedinMCP-mcp-server ->> MCPServers: call_tool to target MCP Server
    MCPServers ->> PluggedinMCP-mcp-server: Return tool response
    PluggedinMCP-mcp-server ->> MCPClient: Return tool response
```

## Credits
- Forked from https://github.com/metatool-ai/mcp-server-metamcp
- Inspirations and some code (refactored in this project) from https://github.com/adamwattis/mcp-proxy-server/