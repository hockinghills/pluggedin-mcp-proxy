# Contributing to Plugged.in MCP Proxy

Thank you for your interest in contributing to the Plugged.in MCP Proxy! This document provides guidelines and information for contributing to the MCP proxy server component of the Plugged.in ecosystem.

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

## Project Overview

The Plugged.in MCP Proxy (`pluggedin-mcp`) is a TypeScript-based Model Context Protocol proxy server that provides a unified interface for MCP clients. It works in conjunction with the main Plugged.in application (`pluggedin-app`) to enable seamless MCP server management and social features.

### Key Features
- Unified MCP server interface
- Progressive server initialization
- Built-in notification system
- Security sandboxing for STDIO servers
- Lightweight Docker deployment
- RAG integration support

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

1. **Keep It Lightweight**: The MCP proxy must remain lightweight for efficient Docker deployments
   - Minimize dependencies
   - Avoid redundant libraries
   - Regularly audit package.json
   - Consider bundle size impact

2. **Performance First**: Optimize for speed and memory efficiency
   - Use streaming where possible
   - Implement proper connection pooling
   - Monitor memory usage
   - Profile performance regularly

3. **Security by Default**: All operations must be secure
   - Validate all inputs
   - Sandbox STDIO operations (Linux)
   - Implement proper authentication
   - Follow security best practices

4. **Error Resilience**: Handle errors gracefully
   - Progressive server initialization
   - Automatic reconnection logic
   - Detailed error logging
   - Non-blocking notification system

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

1. **Protocol Compliance**: Follow MCP specification strictly
2. **Version Compatibility**: Support multiple MCP versions
3. **Tool Discovery**: Implement proper capability discovery
4. **Resource Management**: Handle resources efficiently

### Server Types

Support all MCP server types:
- **STDIO**: With proper sandboxing
- **HTTP/SSE**: With connection management
- **WebSocket**: With reconnection logic

### Notification System

The notification system must be non-blocking:

```typescript
// Good: Non-blocking notification
async function notifyActivity(activity: Activity): Promise<void> {
  // Fire and forget
  sendNotification(activity).catch(error => {
    logger.error('Notification failed:', error);
    // Don't throw - continue operation
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

## Getting Help

### Resources

- **Main Documentation**: See CLAUDE.md in the root directory
- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Issues**: GitHub Issues for bug reports and features
- **Discussions**: GitHub Discussions for questions

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **Pull Requests**: Code contributions
- **Security Issues**: Email security@plugged.in (do not use public issues)

## License

By contributing to Plugged.in MCP Proxy, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Plugged.in! Your efforts help make MCP more accessible to everyone.