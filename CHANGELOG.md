# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2025-01-25

### Changed
- Switched from pnpm to npm for dependency management
- Updated Dockerfile to use `npm ci` instead of `pnpm install`
- Updated .dockerignore to exclude pnpm-lock.yaml and include package-lock.json

### Fixed
- Resolved "pnpm-lock.yaml is not up to date" error during Docker builds
- Fixed dependency version mismatches in lockfile

## [1.2.1] - 2025-01-25

### Fixed
- Removed smithery.yaml from .dockerignore to fix Docker build issues on Smithery platform
- Resolved "smithery.yaml not found" error during Docker image creation

## [1.2.0] - 2025-01-25

### Added
- **Enhanced Security Validations**
  - Comprehensive URL validation with SSRF protection blocking private IPs and dangerous ports
  - Command allowlisting for STDIO servers (node, npx, python, python3, uv, uvx, uvenv)
  - Header validation and sanitization for Streamable HTTP connections
  - Protection against header injection attacks with RFC 7230 compliance
- **Lazy Authentication Support**
  - Tool discovery without API keys for better Smithery compatibility
  - Authentication only required for actual tool/resource invocations
  - Improved compatibility with MCP clients that expect unauthenticated discovery
- **Production Optimizations**
  - Multi-stage Docker builds for minimal container footprint
  - Excluded test files and dev dependencies from production images
  - Optimized for resource-constrained environments

### Changed
- Improved session management and cleanup in Streamable HTTP mode
- Better error handling for transport lifecycle events
- Enhanced TypeScript types for security validators
- Updated documentation with comprehensive security best practices
- Refined Smithery configuration for HTTP transport mode

### Fixed
- Memory management issues in long-running sessions
- Proper cleanup of transports on error conditions
- Session handling edge cases in stateless mode
- Smithery YAML configuration for proper HTTP transport

### Security
- Added comprehensive input validation for all user-provided data
- Implemented SSRF protection for URL-based connections
- Added header injection prevention with size limits
- Command injection protection through strict allowlisting

## [1.1.0] - 2025-01-21

### Added
- **Streamable HTTP Transport Support**: The proxy can now connect to downstream MCP servers that use the Streamable HTTP transport protocol
- **HTTP Server Mode**: The proxy itself can run as an HTTP server instead of STDIO, enabling:
  - Web-based access from browsers and HTTP clients
  - Remote connections over the network
  - Stateless mode for scalable deployments
  - Session-based stateful mode for efficient multi-request operations
- **Authentication for HTTP Mode**: Optional Bearer token authentication for Streamable HTTP endpoints
- **Health Check Endpoint**: `/health` endpoint for monitoring when running in HTTP mode
- **CORS Support**: Built-in CORS headers for browser compatibility
- **Session Management**: Session-based connection management with `mcp-session-id` header

### Changed
- Updated `@modelcontextprotocol/sdk` from ^1.5.0 to ^1.13.0
- Enhanced server type support to include STREAMABLE_HTTP in addition to STDIO and SSE
- Improved TypeScript types for server parameters

### Technical Details
- Added Express.js (v5.1.0) for HTTP server functionality
- New CLI options: `--transport`, `--port`, `--stateless`, `--require-api-auth`
- Default HTTP port: 12006
- Supports both stateless (new transport per request) and stateful (session-based) modes

## [1.0.0] - 2025-01-01

### Major Features
- **Real-Time Notification System**: Track all MCP activities with comprehensive notification support
- **RAG Integration**: Support for document-enhanced queries through the plugged.in App
- **Inspector Scripts**: New automated testing tools for debugging and development
- **Health Monitoring**: Built-in ping endpoint for connection monitoring

### Security Enhancements
- **Input Validation**: Industry-standard validation and sanitization for all inputs
- **URL Security**: Enhanced URL validation with SSRF protection
- **Environment Security**: Secure parsing of environment variables with dotenv
- **Error Sanitization**: Prevents information disclosure in error responses

### Bug Fixes
- Fixed JSON-RPC protocol interference (stdout vs stderr separation)
- Resolved localhost URL validation for development environments
- Fixed API key handling in inspector scripts
- Improved connection stability and memory management

### Developer Tools
- New inspector scripts for automated testing
- Improved error messages and debugging capabilities
- Structured logging with proper stderr usage
- Enhanced TypeScript type safety

## [0.5.12] - 2024-12-15

### Changed
- Initial public release
- Core proxy functionality for aggregating MCP servers
- Support for STDIO and SSE transports
- Integration with plugged.in App