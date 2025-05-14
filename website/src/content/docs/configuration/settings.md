---
title: Extension Settings
excerpt: Comprehensive guide to all settings and configuration options in GitHub Version Sync
order: 1
---

# Extension Settings

GitHub Version Sync provides extensive configuration options to tailor the extension to your specific workflow needs. This document covers all available settings.

## Accessing Settings

1. Open VS Code settings (`Ctrl+,` or `Cmd+,`)
2. Search for "github-versionsync"

Alternatively, use the command:
1. Open Command Palette (`Ctrl+Shift+P`)
2. Type "GitHub Version Sync: Open Settings"

## Version Management Settings

### Version File Location

```json
"github-versionsync.versionFile": ""
```
Path to an optional VERSION file (relative to workspace root). Leave empty to use only package.json.

### Version Format

```json
"github-versionsync.versionFormat": "arrow"
```

Format for displaying version in commit messages:
- `arrow`: "→ v1.2.3"
- `bump`: "⇧ v1.2.3"
- `simple`: "v1.2.3"
- `release`: "📦 v1.2.3"
- `brackets`: "(v1.2.3)"

### Version Update Confirmation

```json
"github-versionsync.confirmVersionUpdate": true
```

Show confirmation dialog before updating version during commit.

## Git Integration Settings

### Auto Tagging

```json
"github-versionsync.enableAutoTag": true
```

Automatically create Git tags when version is updated.

### Tag Prefix

```json
"github-versionsync.tagPrefix": "v"
```

Prefix to use for Git tags (e.g., 'v' for v1.0.0).

### Push Tags

```json
"github-versionsync.pushTags": false
```

Automatically push Git tags to the remote repository.

## GitHub Release Settings

### Enable GitHub Releases

```json
"github-versionsync.enableGitHubRelease": false
```

Create GitHub releases automatically when version is updated.

### Release Prefix

```json
"github-versionsync.releasePrefix": "v"
```

Prefix to use for releases (e.g., 'v' for v1.0.0).

### Release Triggers

```json
"github-versionsync.releaseOn": ["major", "minor", "patch"]
```

When to create GitHub releases. You can limit releases to specific version types.

### Pre-Release Commands

```json
"github-versionsync.preReleaseCommands": []
```

Commands to run before creating a release. For example:
```json
"github-versionsync.preReleaseCommands": [
  "bun run build",
  "bun x vsce package"
]
```

### Include Package Files

```json
"github-versionsync.includePackageFiles": ["*.vsix"]
```

Glob patterns for files to include in the release assets.

## Changelog Settings

### Generate Changelog

```json
"github-versionsync.generateChangelog": true
```

Generate changelog when creating a release.

### Changelog Content Options

```json
"github-versionsync.changelogShowDate": false
"github-versionsync.changelogShowAuthor": false
"github-versionsync.changelogIncludeMessageBody": false
```

Customize the content included in the changelog.

## Workspace-Specific Settings

GitHub Version Sync supports workspace-specific settings, allowing you to have different configurations for each project. This is particularly useful for pre-release commands, which may vary depending on the project structure and build tools.

### Setting Up Workspace Settings

1. Open your project in VS Code
2. Go to File > Preferences > Settings
3. Click on the "Workspace" tab at the top
4. Search for "github-versionsync" to find all extension settings
5. Configure the settings specifically for your current workspace

### Example: Project-Specific Pre-Release Commands

For a project using TypeScript with bun:
```json
{
  "github-versionsync.preReleaseCommands": [
    "bun run build",
    "bun x vsce package"
  ]
}
```

For a project using JavaScript with npm:
```json
{
  "github-versionsync.preReleaseCommands": [
    "npm run build",
    "npx vsce package"
  ]
}
```
