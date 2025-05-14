---
title: Quick Start Guide
excerpt: Get up and running with GitHub Version Sync in minutes
order: 3
---

# Quick Start Guide

This guide will help you start using GitHub Version Sync to manage your project versions.

## Basic Setup

After installing the extension, it's ready to use with default settings for most projects. The extension will automatically detect your Git repository and look for version information in your `package.json` file.

## Your First Version Bump

1. Make some changes to your code
2. Stage your changes in Git
3. Open the Source Control panel in VS Code
4. Look for the "Version Control" section
5. Select a version type (patch, minor, or major)
6. Enter your commit message
7. Click the "Commit" button

GitHub Version Sync will:
- Update the version in your `package.json`
- Amend your commit message to include the version change
- Create a Git tag (if enabled)

## Creating a GitHub Release

To create a GitHub release:

1. Ensure GitHub releases are enabled in settings:
   - Open Command Palette (`Ctrl+Shift+P`)
   - Type "GitHub Version Sync: Toggle GitHub Releases"
   - Select "Enable"

2. After committing a version bump, GitHub Version Sync will:
   - Generate a changelog based on your commits
   - Create a GitHub release with the changelog as release notes
   - Attach any specified assets to the release

## Common Commands

GitHub Version Sync provides several commands through the Command Palette:

- **Version Control: Select Version Type** - Choose between patch, minor, and major updates
- **Version Control: Toggle GitHub Releases** - Enable or disable GitHub release creation
- **Version Control: Create GitHub Release** - Manually create a release
- **Version Control: Open Settings** - Access the extension configuration

## Next Steps

Now that you've learned the basics, you can:

- Explore the [Configuration Guide](../configuration/settings) to customize the extension
- Learn about [Advanced Usage](../usage/advanced-features) for more complex workflows
- Set up [Automation](../usage/automation) for continuous integration
