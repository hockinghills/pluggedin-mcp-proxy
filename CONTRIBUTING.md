# Contributing to Plugged.in MCP Proxy - The Neural Pathways of AI Data Exchange

Welcome to the core of plugged.in's infrastructure! The MCP Proxy is where the magic happens - it's the intelligent router that ensures every AI interaction flows seamlessly while respecting user sovereignty. Your contributions here directly impact how millions will experience AI in the future.

## Table of Contents
- [Project Overview](#project-overview)
- [Development Setup](#development-setup)
- [Development Guidelines](#development-guidelines)
- [Testing](#testing)
- [Security](#security)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [MCP-Specific Guidelines](#mcp-specific-guidelines)
- [Performance Considerations](#performance-considerations)

## Why This Matters

The MCP Proxy is the guardian at the crossroads - it ensures that:
- **Data flows securely** between AI models and your tools
- **Performance stays blazing fast** even at massive scale
- **Privacy is preserved** through intelligent routing
- **Control remains with users** through transparent operations

## Project Overview

The Plugged.in MCP Proxy (`pluggedin-mcp`) is a TypeScript-based Model Context Protocol proxy server that provides a unified interface for MCP clients. It's the critical infrastructure that transforms chaos into order, enabling:

### Key Features
- **Unified MCP server interface**: One connection, infinite possibilities
- **Progressive server initialization**: Resilient connections that never block
- **Built-in notification system**: Real-time awareness of AI activities
- **Security sandboxing**: STDIO servers run in isolated environments
- **Lightweight Docker deployment**: Optimized for edge and cloud
- **RAG integration support**: Seamless document intelligence

### Tech Stack
- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Testing**: Vitest
- **Build**: TSC
- **Deployment**: Docker, PM2

## Development Setup

### Prerequisites
- Node.js 20.0.0 or higher
- npm or pnpm
- Git
- Docker (optional, for container testing)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/pluggedin/pluggedin-mcp.git
   cd pluggedin-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Key environment variables:
   - `PLUGGEDIN_API_KEY`: Authentication key for proxy access
   - `PLUGGEDIN_API_URL`: URL of the Plugged.in API (default: http://localhost:12005)
   - `PORT`: Port for the MCP proxy server (default: 5173)
   - `ENABLE_NOTIFICATIONS`: Enable notification system (default: true)
   - `MAX_RECONNECT_ATTEMPTS`: Maximum reconnection attempts for servers (default: 3)

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

### Development Commands

```bash
# Development
npm run dev              # Start development server with watch mode
npm run build           # Build TypeScript to JavaScript
npm start               # Start production server

# Testing
npm test                # Run tests with Vitest
npm run test:watch      # Run tests in watch mode

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix linting issues
npm run typecheck       # Run TypeScript type checking

# MCP Inspector (for testing)
npm run inspector       # Auto-opening mode (requires Claude Desktop)
npm run inspector:manual # Manual mode for testing
npm run inspector:auth  # Authenticated mode testing
```

## Vision Alignment

Every line of code in the MCP Proxy should advance our mission. Before contributing, understand our journey:

- Read the main [ROADMAP.md](https://github.com/VeriTeknik/pluggedin-app/blob/main/ROADMAP.md) to see where we're heading
- Understand how the proxy fits into each phase of our vision
- Consider how your contribution empowers users

## Development Guidelines

### Project Structure

```
pluggedin-mcp/
├── src/
│   ├── index.ts           # Main server entry point
│   ├── mcp-server.ts      # Core MCP proxy implementation
│   ├── types.ts           # TypeScript type definitions
│   ├── security.ts        # Security utilities and sandboxing
│   └── utils.ts           # Utility functions
├── scripts/
│   └── inspector/         # MCP Inspector scripts
├── tests/
│   ├── mcp-server.test.ts # Core functionality tests
│   └── security.test.ts   # Security tests
├── docker/
│   └── Dockerfile         # Production Docker configuration
└── package.json           # Project configuration
```

### Core Principles

1. **Keep It Lightweight**: Every byte matters when you're the backbone
   - Minimize dependencies ruthlessly
   - Question every library addition
   - Optimize for container environments
   - Target sub-50MB Docker images

2. **Performance First**: Milliseconds multiply at scale
   - Stream everything streamable
   - Pool connections intelligently
   - Profile before and after changes
   - Aim for sub-100ms response times

3. **Security by Default**: Trust nothing, verify everything
   - Validate inputs like your life depends on it
   - Sandbox all external processes
   - Authenticate every request
   - Assume breach, limit blast radius

4. **Error Resilience**: Fail gracefully, recover automatically
   - Never let one server block others
   - Implement circuit breakers
   - Log errors with context
   - Keep users informed, not alarmed

### Code Patterns

#### Server Connection Management
```typescript
// Use progressive initialization
async function connectToServer(config: ServerConfig): Promise<Client> {
  try {
    const client = await initializeClient(config);
    await client.connect();
    return client;
  } catch (error) {
    logger.error(`Failed to connect: ${error.message}`);
    // Don't block other servers
    return null;
  }
}
```

#### Error Handling
```typescript
// Consistent error responses
function handleError(error: unknown): ErrorResponse {
  if (error instanceof MCPError) {
    return { error: error.message, code: error.code };
  }
  return { error: 'Internal server error', code: 'INTERNAL_ERROR' };
}
```

#### Security Validation
```typescript
// Always validate inputs
function validateServerConfig(config: unknown): ServerConfig {
  // Use proper validation
  if (!isValidConfig(config)) {
    throw new Error('Invalid server configuration');
  }
  return config as ServerConfig;
}
```

## Testing

### Writing Tests

All new features and bug fixes must include tests. We use Vitest for testing.

```typescript
// Example test structure
describe('MCPServer', () => {
  it('should initialize server connections progressively', async () => {
    const server = new MCPServer(mockConfig);
    await server.initialize();
    expect(server.getActiveServers()).toHaveLength(2);
  });
});
```

### Test Categories

1. **Unit Tests**: Test individual functions and modules
2. **Integration Tests**: Test server connections and API interactions
3. **Security Tests**: Validate security measures
4. **Performance Tests**: Monitor resource usage

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test src/security.test.ts

# Run with coverage
npm test -- --coverage
```

### MCP Inspector Testing

Use the MCP Inspector for manual testing:

```bash
# Test with Claude Desktop (auto-opening)
npm run inspector

# Manual testing mode
npm run inspector:manual

# Test with authentication
npm run inspector:auth
```

## Security

### Security Guidelines

1. **Input Validation**: Validate all inputs before processing
2. **Sandboxing**: Use Firejail for STDIO servers on Linux
3. **Authentication**: Implement proper API key validation
4. **Rate Limiting**: Respect rate limits from main application
5. **Dependency Security**: Regularly audit dependencies

### Security Checklist

- [ ] Validate all user inputs
- [ ] Sanitize configuration data
- [ ] Implement proper error messages (no sensitive data)
- [ ] Use secure communication protocols
- [ ] Follow OWASP best practices
- [ ] Regular security audits

## Code Style

### TypeScript Guidelines

1. **Use strict TypeScript**: Enable all strict checks
2. **Explicit types**: Avoid `any` type
3. **Consistent naming**: Use camelCase for variables, PascalCase for types
4. **Document complex logic**: Add JSDoc comments

### Code Formatting

We use ESLint for code formatting. Run before committing:

```bash
npm run lint:fix
```

### Example Style
```typescript
/**
 * Connects to an MCP server with retry logic
 * @param config - Server configuration
 * @param retries - Number of retry attempts
 * @returns Connected client or null
 */
async function connectWithRetry(
  config: ServerConfig,
  retries: number = 3
): Promise<Client | null> {
  // Implementation
}
```

## Pull Request Process

### Before Submitting

1. **Update documentation**: Update README or other docs if needed
2. **Add tests**: Include tests for new functionality
3. **Run checks**: Ensure all tests and linting pass
4. **Test locally**: Verify functionality with MCP Inspector
5. **Check bundle size**: Ensure no unnecessary dependencies added

### PR Guidelines

1. **Clear description**: Explain what and why
2. **Reference issues**: Link related issues
3. **Small, focused PRs**: One feature/fix per PR
4. **Screenshots**: Include for UI changes
5. **Breaking changes**: Clearly document

### PR Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Tested with MCP Inspector
- [ ] Performance impact assessed

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No unnecessary dependencies added
```

## MCP-Specific Guidelines

### Working with MCP Protocol

1. **Protocol Compliance**: The spec is sacred - follow it religiously
2. **Version Compatibility**: Support the ecosystem, not just the latest
3. **Tool Discovery**: Make capabilities discoverable and understandable
4. **Resource Management**: Treat resources like they're precious (they are)

### Server Types

Each server type has unique challenges - master them all:

- **STDIO**: The wild west - sandbox everything
  ```typescript
  // Always use Firejail on Linux
  const sandbox = await createSecureSandbox(serverPath);
  ```

- **HTTP/SSE**: The marathoner - manage long connections
  ```typescript
  // Implement proper keep-alive and timeout handling
  const connection = await createResilientConnection(config);
  ```

- **WebSocket**: The sprinter - handle reconnections gracefully
  ```typescript
  // Exponential backoff with jitter
  const ws = await createAutoReconnectingWebSocket(url);
  ```

### Notification System

Notifications inform without interrupting:

```typescript
// Excellence: Non-blocking, contextual notifications
async function notifyActivity(activity: Activity): Promise<void> {
  // Enrich with context
  const enriched = await enrichActivity(activity);
  
  // Fire and forget with telemetry
  sendNotification(enriched)
    .catch(error => {
      telemetry.record('notification.failed', { error });
      logger.error('Notification failed:', error);
      // Never throw - the show must go on
    });
}
```

## Performance Considerations

### Optimization Guidelines

1. **Memory Management**
   - Monitor memory usage
   - Implement proper cleanup
   - Avoid memory leaks
   - Use streaming for large data

2. **Connection Pooling**
   - Reuse connections where possible
   - Implement connection limits
   - Proper timeout handling

3. **Bundle Size**
   - Keep dependencies minimal
   - Use tree-shaking
   - Regular dependency audits
   - Consider deployment size

### Performance Monitoring

```typescript
// Example performance tracking
const startTime = performance.now();
await operation();
const duration = performance.now() - startTime;
if (duration > 1000) {
  logger.warn(`Slow operation: ${duration}ms`);
}
```

## Contributing to Our Vision

### How You Can Shape the Future

The MCP Proxy is central to our roadmap. Here's how you can contribute to each phase:

**Phase 1 (Current)**: Help us build unshakeable foundations
- Improve error recovery mechanisms
- Optimize connection handling
- Enhance security sandboxing
- Create comprehensive tests

**Phase 2**: Enable the business layer
- Build usage tracking for billing
- Implement rate limiting
- Add multi-tenant isolation
- Create admin APIs

**Phase 3**: Power the AI assistant ecosystem
- Design multi-agent protocols
- Build capability negotiation
- Implement context sharing
- Create assistant SDKs

**Phase 4**: Decentralize everything
- Research P2P protocols
- Implement edge computing
- Build federation support
- Create privacy-preserving routing

## Getting Help

### Resources

- **Project Vision**: [ROADMAP.md](https://github.com/VeriTeknik/pluggedin-app/blob/main/ROADMAP.md)
- **Main Documentation**: See CLAUDE.md in the root directory
- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Issues**: GitHub Issues for bug reports and features
- **Discord**: [Join our community](https://discord.gg/pluggedin)

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **Pull Requests**: Code contributions
- **Discord**: Real-time discussions and support
- **Security Issues**: security@plugged.in (never use public channels)

## Join the Revolution

Every contribution to the MCP Proxy is a step toward a future where:

- **AI serves humanity**, not corporate interests
- **Data sovereignty** is a fundamental right
- **Performance and privacy** coexist beautifully
- **Open source** drives innovation

Your code here doesn't just route data - it routes the future of human-AI interaction.

## License

By contributing to Plugged.in MCP Proxy, you agree that your contributions will be licensed under the same license as the project.

---

> *"In the flow of data between human and machine, we are the guardians of intent."*

**Welcome to the MCP Proxy team. Let's build infrastructure that empowers billions.** 🚀