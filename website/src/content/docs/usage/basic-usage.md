---
title: Basic Usage
excerpt: Learn the day-to-day usage of GitHub Version Sync
order: 1
---

# Basic Usage

GitHub Version Sync is designed to integrate seamlessly with your regular development workflow. This guide covers the basic day-to-day operations.

## Version Control Panel

The Version Control panel is available in the Source Control view of VS Code. It provides quick access to:

- Version type selection (patch, minor, major)
- Version status (current and next version)
- GitHub release toggle

## Committing with Version Bumps

The typical workflow for updating versions is:

1. Make code changes in your project
2. Stage your changes in Git
3. Select a version type:
   - **Patch** (0.0.x) - for bug fixes and minor changes
   - **Minor** (0.x.0) - for new features that don't break compatibility
   - **Major** (x.0.0) - for breaking changes
4. Enter your commit message
5. Click Commit

The extension will:
- Update the version in your `package.json`
- Add the version change to your commit message
- (Optionally) Create a Git tag for the version

## Version Format in Commit Messages

By default, version changes appear in commit messages like this:

```
Your commit message → v1.2.3
```

You can customize this format in the extension settings:

- **Arrow** (default): `→ v1.2.3`
- **Bump**: `⇧ v1.2.3`
- **Simple**: `v1.2.3`
- **Release**: `📦 v1.2.3`
- **Brackets**: `(v1.2.3)`

## Keyboard Shortcuts

To improve your workflow, you can use:

- `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac) while the commit message input is focused to commit with the selected version type.

## Git Tags

When committing with a version bump, the extension can automatically:

1. Create a Git tag for the new version (e.g., `v1.2.3`)
2. Push the tag to your remote repository (if configured)

This ensures your Git history is properly tagged at each version point.
