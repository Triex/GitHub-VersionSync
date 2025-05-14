---
title: Automation
excerpt: Learn how to integrate GitHub Version Sync into automated workflows
order: 4
---

# Automation

GitHub Version Sync can be integrated into automated workflows to streamline your versioning and release process.

## Integration with GitHub Actions

GitHub Version Sync works seamlessly with GitHub Actions, allowing you to create fully automated CI/CD pipelines:

### Triggering Workflows on Tags

When GitHub Version Sync creates a new tag, you can trigger a GitHub Action:

```yaml
name: Release Workflow

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Bun
        uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: bun install
      - name: Build project
        run: bun run build
      # Additional deployment steps...
```

### Triggering Workflows on Releases

You can also trigger workflows when GitHub Version Sync creates a new release:

```yaml
name: Release Deployment

on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to production
        run: ./deploy.sh
```

## Pre-Commit and Post-Commit Hooks

You can use Git hooks with GitHub Version Sync to automate additional tasks:

### Pre-Commit Hooks

Use pre-commit hooks to validate your code before version bumping:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run tests before allowing commit with version bump
if git diff --cached | grep -q '"version":'; then
  echo "Version change detected, running tests..."
  bun test
  if [ $? -ne 0 ]; then
    echo "Tests failed, aborting commit"
    exit 1
  fi
fi
```

### Post-Commit Hooks

Use post-commit hooks to perform actions after a version bump:

```bash
#!/bin/bash
# .git/hooks/post-commit

# Detect if commit includes a version bump
if git log -1 --pretty=%B | grep -q "→ v"; then
  echo "Version bump detected, running build and notifications..."
  bun run build
  ./notify-team.sh
fi
```

## Continuous Delivery Pipeline

Here's an example of a complete continuous delivery pipeline using GitHub Version Sync:

1. **Development**: Make code changes and commit regularly
2. **Version Bump**: Use GitHub Version Sync to bump version and tag when ready
3. **Automated Tests**: GitHub Actions runs tests when tagged versions are pushed
4. **Build**: Create build artifacts automatically
5. **Release Creation**: GitHub Version Sync creates a GitHub release
6. **Deployment**: GitHub Actions deploys to production based on the release

## CI/CD Best Practices with GitHub Version Sync

When integrating GitHub Version Sync into your CI/CD workflow:

1. **Version in Build Artifacts**: Ensure build artifacts include the version for traceability
2. **Release Notes in Deployments**: Include release notes from GitHub Version Sync in your deployment logs
3. **Version Verification**: Validate that the deployed version matches the intended release version
4. **Rollback Strategy**: Use Git tags created by GitHub Version Sync for precise rollbacks

## Scripting with GitHub Version Sync

You can script interactions with GitHub Version Sync using VS Code's extension API:

```javascript
// Example script to trigger a version bump
const vscode = require('vscode');

async function bumpMinorVersion() {
  await vscode.commands.executeCommand('github-versionsync.selectVersionType', 'minor');
  await vscode.commands.executeCommand('github-versionsync.commitWithVersion');
}

bumpMinorVersion();
```

This automation capability allows GitHub Version Sync to fit into virtually any development workflow, whether for individual developers or teams working on enterprise projects.
