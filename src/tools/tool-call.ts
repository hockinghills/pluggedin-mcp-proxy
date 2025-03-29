import { z } from "zod";
import { BaseTool } from "../lib/base-tool.js";
import { getMcpServers } from "../fetch-pluggedinmcp.js";
import { getSession, initSessions } from "../sessions.js";
import { getSessionKey } from "../utils.js";

const toolName = "tool_call";
const toolDescription = `
"Use this tool to execute a specific method of another tool with the provided parameters based on get-tools tool response.
You need to specify the tool name, method name, and any required parameters for that method."
`;

export class ToolCallTool extends BaseTool {
  name = toolName;
  description = toolDescription;

  schema = z.object({
    tool: z.string().describe("The name of the tool to call"),
    method: z.string().describe("The method of the tool to call"),
    parameters: z.record(z.any())
      .default({})
      .describe("The parameters required by the specific tool method being called")
  });

  async execute({ tool, method, parameters }: z.infer<typeof this.schema>) {
    try {
      await initSessions();
      const serverParams = await getMcpServers(true);

      for (const [uuid, params] of Object.entries(serverParams)) {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session) continue;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.tools) continue;

        try {
          const result = await session.client.request(
            {
              method: "tools/call",
              params: {
                name: tool,
                method,
                arguments: parameters || {},
              },
            },
            z.object({ content: z.array(z.any()) })
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result.content, null, 2),
              },
            ],
          };
        } catch (error) {
          // If tool not found in this server, continue to next server
          continue;
        }
      }

      throw new Error(`Tool ${tool} not found in any connected server`);
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  }
}
