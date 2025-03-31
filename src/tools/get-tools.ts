import { z } from "zod";
import { BaseTool } from "../lib/base-tool.js";
import { getMcpServers } from "../fetch-pluggedinmcp.js";
import { getSession, initSessions } from "../sessions.js";
import { getSessionKey } from "../utils.js";

const toolName = "get_tools";
const toolDescription = `
"Use this tool to retrieve a list of available tools from all connected MCP servers.
This will return dynamic tools that user has access to.
You can use this tool to get the list of tools, method names and parameters, and then use tool_call tool to call the tool with the provided parameters."
`;

export class GetToolsTool extends BaseTool {
  name = toolName;
  description = toolDescription;

  schema = z.object({});

  async execute() {
    try {
      await initSessions();
      const serverParams = await getMcpServers(true);
      const allTools: any[] = [];

      await Promise.allSettled(
        Object.entries(serverParams).map(async ([uuid, params]) => {
          const sessionKey = getSessionKey(uuid, params);
          const session = await getSession(sessionKey, uuid, params);
          if (!session) return;

          const capabilities = session.client.getServerCapabilities();
          if (!capabilities?.tools) return;

          const serverName = session.client.getServerVersion()?.name || "";
          try {
            const result = await session.client.request(
              {
                method: "tools/list",
                params: {},
              },
              z.object({ tools: z.array(z.any()) })
            );

            if (result.tools) {
              allTools.push(...result.tools);
            }
          } catch (error) {
            console.error(`Error fetching tools from: ${serverName}`, error);
          }
        })
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(allTools, null, 2),
          },
        ],
      };
    } catch (error) {
      throw error;
    }
  }
}
