// src/plugin-system.ts
import { ToolSchema, ToolExecutionResult } from "./types.js";
import { z } from "zod";

/**
 * Interface for a static tool plugin managed by the PluginRegistry.
 * Each static tool (like get_tools, tool_call, refresh_tools) should implement this.
 */
export interface ToolPlugin {
  /**
   * The unique name of the tool (e.g., 'get_tools', 'tool_call').
   */
  readonly name: string;

  /**
   * A description of what the tool does.
   */
  readonly description: string;

  /**
   * The Zod schema defining the expected input arguments for the tool.
   * Use z.object({}) for tools that take no arguments.
   */
  readonly inputSchema: z.ZodType<any, any, any>;

  /**
   * Executes the tool's logic.
   * @param args - The validated arguments passed to the tool, matching the inputSchema.
   * @param meta - Optional metadata passed with the MCP request (e.g., progressToken).
   * @returns A promise resolving to the tool's execution result, conforming to ToolExecutionResult.
   */
  execute(args: any, meta?: any): Promise<ToolExecutionResult>;
}

/**
 * Singleton registry for managing ToolPlugin instances.
 */
export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, ToolPlugin> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance of the PluginRegistry.
   * @returns The PluginRegistry instance.
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Registers a tool plugin with the registry.
   * @param plugin - The ToolPlugin instance to register.
   * @throws Error if a plugin with the same name is already registered.
   */
  register(plugin: ToolPlugin): void {
    if (this.plugins.has(plugin.name)) {
      // Consider logging a warning instead of throwing if hot-reloading might be a factor
      throw new Error(`[PluginRegistry] Tool plugin with name "${plugin.name}" is already registered.`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Retrieves a registered tool plugin by its name.
   * @param name - The name of the plugin to retrieve.
   * @returns The ToolPlugin instance or undefined if not found.
   */
  get(name: string): ToolPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Gets an array of all registered tool plugins.
   * @returns An array of ToolPlugin instances.
   */
  getAll(): ToolPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Checks if a plugin with the given name is registered.
   * @param name - The name of the plugin.
   * @returns True if the plugin is registered, false otherwise.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }
}

// Export a pre-initialized instance for convenience
export const pluginRegistry = PluginRegistry.getInstance();
