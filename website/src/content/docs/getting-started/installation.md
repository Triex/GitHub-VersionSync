---
title: Installation
excerpt: How to install GitHub Version Sync extension in VS Code
order: 2
---

# Installation Guide

This guide will walk you through installing the GitHub Version Sync extension in Visual Studio Code.

## Prerequisites

Before installing GitHub Version Sync, ensure you have:

- **Visual Studio Code v1.80.0** or higher
- **Git** installed and configured on your system
- A **GitHub account** for GitHub release functionality (optional)

## Installing from VS Code Marketplace (coming soon)

The easiest way to install GitHub Version Sync is directly from the VS Code Marketplace:

1. Open VS Code
2. Click on the Extensions icon in the Activity Bar (or press `Ctrl+Shift+X`)
3. Search for "GitHub Version Sync"
4. Click the "Install" button next to the extension

## Manual Installation

If you prefer to install the extension manually:

1. Download the latest `.vsix` file from the [GitHub Releases page](https://github.com/Triex/GitHub-VersionSync/releases)
2. Open VS Code
3. Open the Command Palette (`Ctrl+Shift+P`)
4. Type "Extensions: Install from VSIX..." and select it
5. Navigate to the downloaded `.vsix` file and select it

## Verifying the Installation

To verify that GitHub Version Sync is installed correctly:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Type "GitHub Version Sync" - you should see a list of available commands
3. Look for the Version Control panel in the Source Control view

## Setting Up GitHub Authentication

If you want to use the GitHub release functionality, you'll need to set up authentication:

1. Go to your [GitHub Token Settings](https://github.com/settings/tokens)
2. Create a token with the `repo` scope
3. The extension will prompt you for this token when needed
4. Tokens are securely stored in VS Code's built-in secret storage

If you try to create a release without setting this up, it will prompt you with a quick connect button.

## What's Next?

Continue to the [Quick Start Guide](./quick-start) to learn how to use GitHub Version Sync for your first version bump and release!
