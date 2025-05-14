---
title: GitHub Releases
excerpt: Learn how to create and customize GitHub releases with GitHub Version Sync
order: 2
---

# GitHub Releases

GitHub Version Sync can automatically create GitHub releases when you update your project's version. This guide explains how to use and customize this feature.

## Enabling GitHub Releases

GitHub releases are disabled by default. To enable them:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Type "GitHub Version Sync: Toggle GitHub Releases"
3. Select "Enable"

Alternatively, you can enable releases in settings:

1. Open VS Code settings
2. Search for "github-versionsync.enableGitHubRelease"
3. Check the box to enable

## GitHub Authentication

To create releases, you'll need a GitHub personal access token:

1. Go to your [GitHub Token Settings](https://github.com/settings/tokens)
2. Create a token with the `repo` scope
3. The extension will prompt for this token when needed
4. The token is securely stored in VS Code's built-in secret storage

## Customizing Release Content

### Changelog Generation

GitHub Version Sync automatically generates a changelog for each release based on your Git commit history. You can customize this:

1. Open VS Code settings
2. Look for "github-versionsync.generateChangelog" (enabled by default)
3. Configure additional options:
   - `changelogShowDate` - Include dates in the changelog
   - `changelogShowAuthor` - Include authors in the changelog
   - `changelogIncludeMessageBody` - Include full commit messages, not just the first line

### Release Title and Description

The release title uses the format: `v1.2.3` (matching your version).

The release description contains:
1. A header with the version and date
2. The auto-generated changelog showing commits since the last version

## Attaching Assets to Releases

You can attach build artifacts or other files to your releases:

1. Configure `github-versionsync.includePackageFiles` with glob patterns:
   ```json
   "github-versionsync.includePackageFiles": [
     "*.vsix",
     "dist/*.zip"
   ]
   ```

2. (Optional) Run build commands before creating a release:
   ```json
   "github-versionsync.preReleaseCommands": [
     "bun run build",
     "bun x vsce package"
   ]
   ```

## Manual Release Creation

To create a release without committing:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Type "GitHub Version Sync: Create GitHub Release"
3. The extension will:
   - Generate a changelog
   - Run any configured pre-release commands
   - Create a GitHub release for the current version

## Release Triggers

You can control which version types trigger a release:

1. Open VS Code settings
2. Configure "github-versionsync.releaseOn" array:
   ```json
   "github-versionsync.releaseOn": [
     "major",
     "minor",
     "patch"
   ]
   ```

For example, to create releases only for major and minor updates, remove "patch" from the array.
