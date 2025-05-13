# Contributing to GitHub Version Sync

Thank you for your interest in contributing to GitHub Version Sync! This document provides guidelines and instructions for development.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Triex/GitHub-Version-Sync.git
   cd GitHub-Version-Sync
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Build the extension:
   ```bash
   bun run build
   ```

4. Launch the extension in debug mode:
   - Open the project in VS Code
   - Press F5 to start debugging

## Project Structure

- `src/`: Source code
  - `extension.ts`: Main extension code
  - `version-provider.ts`: TreeView provider for version control
- `out/`: Compiled JavaScript
- `.vscode/`: VS Code configuration
- `package.json`: Extension manifest

## Building and Testing

1. Build the extension:
   ```bash
   bun run build
   ```

2. Package the extension:
   ```bash
   vsce package
   ```

3. Run tests:
   ```bash
   bun test
   ```

## Code Style

- Use TypeScript
- Follow existing code formatting
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Update documentation if needed
4. Submit a pull request
5. Wait for review and address any feedback

## Release Process

1. Update version in `package.json`
2. Update changelog
3. Create a git tag
4. Build and package extension
5. Publish to VS Code Marketplace

## Need Help?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about the codebase
