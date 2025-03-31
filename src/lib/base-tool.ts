import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract schema: z.ZodObject<any>;

  register(server: Server<any, any, any>) {
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== this.name) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }
      return this.execute(request.params.arguments || {});
    });
  }

  abstract execute(args: z.infer<typeof this.schema>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}
