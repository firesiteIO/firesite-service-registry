# Rolling Context Document - Firesite Service Registry

**Last Updated**: 2025-07-20 by Claude Code
**Current Phase**: Initial Setup & Architecture
**Session Count**: 1

## 🎯 Current Mission
**Immediate Goal**: Create a centralized NPM package for service registry functionality
**Context**: Consolidating duplicate service-registry.js files across multiple Firesite projects into a single, maintainable NPM package that supports both Node.js and browser environments.

## 📍 Current Position
### What We Just Completed
- Created GitHub repository: https://github.com/firesiteIO/firesite-service-registry
- Cloned to local directory: /Users/thomasbutler/Documents/Firesite/firesite-service-registry
- Establishing initial documentation structure

### What We're Working On Now
- Setting up package structure and documentation
- Creating GitHub Actions workflow for CI/CD
- Planning NPM publishing strategy (private/public)
- Defining dual-environment architecture (Node.js + Browser)

### Next Immediate Steps
1. Create comprehensive package.json with proper configuration
2. Set up TypeScript support for type definitions
3. Implement Node.js version (file system based)
4. Implement Browser version (HTTP API based)
5. Create unified API interface
6. Set up automated testing
7. Configure NPM publishing

## 🧠 Key Decisions & Learnings
### Architectural Decisions
- **Dual Implementation**: Separate Node.js and browser implementations with shared interface
- **TypeScript Support**: Include type definitions for better DX
- **Environment Detection**: Automatic selection of appropriate implementation
- **Backward Compatibility**: Maintain API compatibility with existing implementations

### Package Design Goals
1. **Single Source of Truth**: One package to rule them all
2. **Zero Breaking Changes**: Drop-in replacement for existing implementations
3. **Enhanced Features**: Add retry logic, event emitters, better error handling
4. **Cross-Project Compatibility**: Work seamlessly across CLI, MCP servers, and web apps

### NPM Strategy
- **Package Name**: @firesite/service-registry
- **Scope**: @firesite (requires NPM organization setup)
- **Initial Version**: 0.1.0
- **Publishing**: Automated via GitHub Actions on main branch commits
- **Access Level**: Private initially (can be made public later)

## 🔗 Critical Resources
### Codebase Locations
- **Main Project**: /Users/thomasbutler/Documents/Firesite/firesite-service-registry
- **Source Implementations**:
  - CLI: /Users/thomasbutler/Documents/Firesite/firesite-cli/src/services/registry.js
  - MCP: /Users/thomasbutler/Documents/Firesite/firesite-mcp/utils/service-registry.js
  - Chat: /Users/thomasbutler/Documents/Firesite/firesite-chat-service/utils/service-registry.js

### Integration Points
- **Registry Path**: ~/.firesite/registry.json
- **API Endpoints**: /api/registry (for HTTP access)
- **Default Ports**: Defined in each service's config
- **Health Check URLs**: Constructed from service info

## 🚀 Active Development Threads
### Thread 1: Package Structure
**Status**: Planning
**Goal**: Create proper directory structure with src/, dist/, tests/

### Thread 2: CI/CD Pipeline
**Status**: Not Started
**Goal**: GitHub Actions for testing, building, and publishing to NPM

### Thread 3: NPM Publishing Setup
**Status**: Not Started
**Goal**: Configure NPM organization, access tokens, and automated publishing

## ⚠️ Known Issues & Constraints
### Current Limitations
- Multiple duplicate implementations across projects
- No centralized versioning or updates
- Browser implementation requires HTTP endpoint
- PID tracking only works with self-registration

### Technical Requirements
- Must work in both Node.js and browser environments
- Cannot use Node.js fs module in browser code
- Must maintain backward compatibility
- Should support TypeScript consumers

## 🤝 Handoff Protocol
**For Next Claude Instance**:
1. Start by reading this CONTEXT.md
2. Check the TODO.md for current tasks
3. Review the package.json for dependencies and scripts
4. Ensure all changes maintain backward compatibility
5. Test in both Node.js and browser environments
6. Update documentation for any API changes

## 📋 NPM Publishing Process (First-Time Setup)
Since this is your first NPM package, here's what we'll need to do:

### 1. NPM Organization Setup
- Create @firesite organization on NPM
- Add your NPM account as owner
- Configure organization settings (private/public)

### 2. Package Configuration
- Set up package.json with proper metadata
- Configure .npmignore to exclude unnecessary files
- Add proper LICENSE file
- Set up semantic versioning

### 3. Authentication Setup
- Generate NPM access token
- Add token to GitHub Secrets
- Configure GitHub Actions to use token

### 4. Publishing Workflow
- Automated publishing on main branch commits
- Version bumping strategy
- Tag creation for releases
- Changelog generation

## 🏗️ Implementation Plan
### Phase 1: Foundation (Current)
- Documentation structure
- Package configuration
- Basic directory setup

### Phase 2: Core Implementation
- Migrate existing code
- Add TypeScript support
- Implement dual-environment support

### Phase 3: Enhanced Features
- Retry logic with exponential backoff
- Event emitters for real-time updates
- Better error handling and logging
- Connection pooling for HTTP implementation

### Phase 4: Integration
- Update all Firesite projects to use package
- Remove duplicate implementations
- Add self-registration pattern for PID tracking

## 💡 Innovation Opportunities
- WebSocket support for real-time registry updates
- Service discovery beyond just ports (capabilities, versions)
- Health check aggregation
- Automatic failover mechanisms
- Registry replication for high availability

---

**Remember**: This package is foundational infrastructure for the entire Firesite ecosystem. Every decision should prioritize reliability, maintainability, and developer experience.