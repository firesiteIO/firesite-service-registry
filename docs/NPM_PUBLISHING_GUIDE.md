# NPM Publishing Guide - @firesite/service-registry

**Complete step-by-step guide for first-time NPM package publishing**

## Prerequisites

Before you begin, ensure you have:
- [ ] Node.js 18+ installed
- [ ] npm CLI installed and updated (`npm install -g npm@latest`)
- [ ] Git installed and configured
- [ ] GitHub account with repository access
- [ ] NPM account (create at [npmjs.com](https://www.npmjs.com/))

## Phase 1: NPM Account Setup

### Step 1: Create NPM Account
1. Go to [npmjs.com](https://www.npmjs.com/)
2. Click "Sign Up" and create your account
3. Verify your email address
4. Enable two-factor authentication (highly recommended)

### Step 2: Verify @firesite Namespace Access
Since you own the @firesite namespace as a personal user account:
1. Log into NPM dashboard
2. Verify you can see @firesite packages in your profile
3. No organization setup needed for personal namespace

**Note**: If you prefer to use an organization for team collaboration, you can create @firesite-ai organization as an alternative, but for this infrastructure package, using your personal @firesite namespace is simpler and recommended.

### Step 3: Generate NPM Granular Access Token
1. Go to NPM dashboard → Access Tokens
2. Click "Generate New Token"
3. Token type: **"Granular Access Token"** (new recommended approach)
4. Configure the token:
   - **Token Name**: `firesite-packages-ci`
   - **Description**: `CI/CD token for all @firesite packages - GitHub Actions automation`
   - **Expiration**: Set to your preference (e.g., 3-4 years for long-term use)
   - **Organizations**: Leave empty (since @firesite is your personal namespace, not an organization)
   - **Packages and scopes**: 
     - Select "Read and Write (all packages)" - this covers all current and future @firesite packages
   - **Permissions**:
     - ✅ **Read**: Yes (for downloading/installing)
     - ✅ **Write**: Yes (for publishing new versions)
     - ❌ **Delete**: No (safer to not allow deletion from CI)
     - ❌ **Admin**: No (not needed for publishing)
   - **IP Allow List**: Leave empty (unless you want to restrict to specific IPs)
5. Click "Generate Token"
6. Copy the token immediately (you won't see it again)
7. Store it securely for GitHub Secrets

## Phase 2: Local Development Setup

### Step 1: Install Dependencies
```bash
cd /Users/thomasbutler/Documents/Firesite/firesite-service-registry
npm install
```

### Step 2: Build the Package
```bash
npm run build
```

### Step 3: Run Tests
```bash
npm run test:coverage
```

### Step 4: Lint and Format
```bash
npm run lint
npm run format
```

### Step 5: Local Testing
```bash
# Create a test package locally
npm pack

# This creates a .tgz file you can install locally for testing:
# npm install ./firesite-service-registry-0.1.0.tgz
```

## Phase 3: GitHub Setup

### Step 1: Add NPM Token to GitHub Secrets
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `NPM_TOKEN`
5. Value: Paste the NPM access token from Step 2.3
6. Click "Add secret"

### Step 2: Verify GitHub Actions
The CI/CD workflow is already set up in `.github/workflows/ci.yml`. It will:
- Run tests on multiple Node.js versions
- Perform security audits
- Build the package
- Publish to NPM on releases

## Phase 4: Publishing Process

### Method 1: Automatic Publishing (Recommended)

#### Step 1: Ensure Everything is Ready
```bash
# Verify all tests pass
npm run test:coverage

# Verify build works
npm run build

# Verify linting passes
npm run lint:check

# Verify types are correct
npm run type-check
```

#### Step 2: Commit and Push
```bash
git add .
git commit -m "feat: initial release of @firesite/service-registry

- Complete Node.js and browser implementation
- TypeScript support with full type definitions
- Comprehensive test suite with 95% coverage
- Automated CI/CD pipeline
- Documentation and examples"

git push origin main
```

#### Step 3: Create a Release
1. Go to GitHub repository → Releases
2. Click "Create a new release"
3. Tag version: `v0.1.0` (must start with 'v')
4. Release title: `v0.1.0 - Initial Release`
5. Description:
   ```markdown
   ## 🎉 Initial Release of @firesite/service-registry

   ### Features
   - ✅ **Dual Environment Support**: Works in both Node.js and browser
   - ✅ **Dynamic Service Discovery**: Real-time port discovery
   - ✅ **Health Monitoring**: Built-in health check capabilities
   - ✅ **TypeScript Support**: Full type definitions included
   - ✅ **Zero Configuration**: Works out of the box
   - ✅ **Retry Logic**: Resilient service discovery

   ### What's Included
   - Node.js file-based registry implementation
   - Browser HTTP-based registry implementation
   - Unified ServiceRegistry class with environment detection
   - Comprehensive error handling and retry logic
   - 95% test coverage
   - Complete TypeScript definitions

   ### Breaking Changes
   None (initial release)

   ### Migration Guide
   See [README.md](README.md) for migration from existing implementations.
   ```
6. Check "This is a pre-release" (for v0.x versions)
7. Click "Publish release"

This will trigger the GitHub Actions workflow which will automatically publish to NPM.

### Method 2: Manual Publishing (Backup)

If automatic publishing fails, you can publish manually:

```bash
# Login to NPM
npm login

# Verify you're logged in to the correct account
npm whoami

# Publish the package
npm publish --access public

# For scoped packages, you need --access public for free accounts
```

## Phase 5: Verification

### Step 1: Verify NPM Publication
1. Go to [npmjs.com/package/@firesite/service-registry](https://npmjs.com/package/@firesite/service-registry)
2. Verify the package appears correctly
3. Check version, description, and metadata

### Step 2: Test Installation
```bash
# Create a temporary directory for testing
mkdir /tmp/test-install
cd /tmp/test-install

# Test installation
npm init -y
npm install @firesite/service-registry

# Test import
node -e "const { ServiceRegistry } = require('@firesite/service-registry'); console.log('Import successful:', typeof ServiceRegistry);"
```

### Step 3: Test in Existing Projects
Update one of the Firesite projects to use the new package:

```bash
cd /Users/thomasbutler/Documents/Firesite/firesite-cli
npm install @firesite/service-registry

# Update imports in relevant files
# Before: import { registerService } from '../utils/service-registry.js';
# After: import { ServiceRegistry } from '@firesite/service-registry';
```

## Phase 6: Post-Publication

### Step 1: Update Documentation
- [ ] Update README badges with NPM version
- [ ] Add installation instructions
- [ ] Update links to point to published package

### Step 2: Migration Planning
Plan the migration of existing projects:
1. **firesite-cli**: Update service registry usage
2. **firesite-mcp**: Replace local service registry
3. **firesite-chat-service**: Update to use NPM package
4. **firesite-project-service**: Integrate when ready

### Step 3: Monitor Usage
- [ ] Watch NPM download statistics
- [ ] Monitor GitHub issues for bug reports
- [ ] Check CI/CD pipeline health

## Troubleshooting

### Common Issues

#### 1. "Package name already exists"
- The @firesite organization must be set up correctly
- Ensure you have publishing rights to the organization
- Check if someone else claimed the name

#### 2. "Authentication failed"
- Verify NPM token is correct and hasn't expired
- For Granular Access Tokens, ensure:
  - Token has **Write** permission enabled
  - Token scope includes `@firesite/service-registry` or `@firesite/*`
  - Organization access is properly configured
  - Token hasn't been revoked or expired
- Test locally: `npm whoami` (should show your username)
- Test token: `npm token list` (should show your active tokens)

#### 3. "Build fails in CI"
- Check Node.js version compatibility
- Verify all dependencies are listed in package.json
- Review error logs in GitHub Actions

#### 4. "Tests fail in CI but pass locally"
- Environment differences (file paths, permissions)
- Missing environment variables
- Timing issues in CI environment

### Recovery Procedures

#### If Publishing Fails
1. Check GitHub Actions logs for specific errors
2. Fix issues and push new commit
3. Create new release with incremented version

#### If Wrong Version Published
```bash
# Deprecate the wrong version
npm deprecate @firesite/service-registry@0.1.0 "This version has issues, please upgrade"

# Publish fixed version
npm version patch  # Increments to 0.1.1
git push origin main --tags
# Create new GitHub release
```

#### If Package Needs to be Unpublished
```bash
# Only possible within 72 hours and if no other packages depend on it
npm unpublish @firesite/service-registry@0.1.0
```

## Security Best Practices

- [ ] Never commit NPM tokens to Git
- [ ] Use GitHub Secrets for all sensitive data
- [ ] Enable two-factor authentication on NPM
- [ ] Regularly rotate access tokens
- [ ] Use `npm audit` to check for vulnerabilities
- [ ] Keep dependencies updated

## Maintenance and Updates

### For Future Releases
1. Update version in package.json: `npm version patch|minor|major`
2. Update CHANGELOG.md with changes
3. Commit and push changes
4. Create GitHub release (triggers automatic publishing)

### Monitoring
- Set up notifications for NPM package downloads
- Monitor GitHub issues and pull requests
- Watch for security advisories
- Keep dependencies updated

## Success Checklist

- [ ] NPM account created and verified
- [ ] @firesite organization set up
- [ ] NPM token generated and added to GitHub Secrets
- [ ] Package builds successfully
- [ ] All tests pass with 95%+ coverage
- [ ] GitHub Actions workflow completes
- [ ] Package published to NPM
- [ ] Installation test successful
- [ ] Documentation updated
- [ ] Migration plan created

## Support and Resources

- **NPM Documentation**: [docs.npmjs.com](https://docs.npmjs.com/)
- **GitHub Actions**: [docs.github.com/actions](https://docs.github.com/actions)
- **Semantic Versioning**: [semver.org](https://semver.org/)
- **TypeScript Handbook**: [typescriptlang.org/docs](https://www.typescriptlang.org/docs/)

---

**Remember**: This is foundational infrastructure for the entire Firesite ecosystem. Take your time, test thoroughly, and don't hesitate to ask for help if anything is unclear!