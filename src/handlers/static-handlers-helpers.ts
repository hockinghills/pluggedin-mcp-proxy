// Helper function to provide helpful API key setup instructions
export function getApiKeySetupMessage(toolName: string): string {
  return `The '${toolName}' tool requires a Plugged.in API key.

To get started:
1. Sign up at https://plugged.in
2. Get your API key from https://plugged.in/settings/api-keys
3. Set the PLUGGEDIN_API_KEY environment variable
4. Restart your MCP client

For detailed setup instructions, run: pluggedin_setup

Available help topics:
- pluggedin_setup topic:getting_started
- pluggedin_setup topic:api_key
- pluggedin_setup topic:configuration
- pluggedin_setup topic:troubleshooting`;
}