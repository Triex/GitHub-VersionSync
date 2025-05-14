---
title: How to Contribute
excerpt: Learn how to contribute to the GitHub Version Sync extension
order: 1
---

# Contributing to GitHub Version Sync

Thank you for your interest in contributing to GitHub Version Sync! This guide will help you get started with developing and submitting changes to the project.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [Bun](https://bun.sh/) as the package manager
- [Visual Studio Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)

### Setting Up the Dev Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/Triex/GitHub-Version-Sync.git
   cd GitHub-Version-Sync
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Open the project in VS Code:
   ```bash
   code .
   ```

4. Build the extension:
   ```bash
   bun run build
   ```

## Development Workflow

### Running the Extension

To run and test the extension during development:

1. Press `F5` in VS Code to launch the Extension Development Host
2. The new VS Code window will have your extension loaded
3. Changes to most files will be automatically applied when you save them

### Testing

Run the tests with:

```bash
bun run test
```

## Submitting Changes

### Creating a Pull Request

1. Create a new branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes with clear commit messages following [conventional commit](https://www.conventionalcommits.org/) format.

3. Push your branch to GitHub:
   ```bash
   git push -u origin feature/your-feature-name
   ```

4. Go to the [repository on GitHub](https://github.com/Triex/GitHub-Version-Sync) and create a Pull Request.

### Pull Request Guidelines

- Include a clear description of the changes and why they're needed
- Make sure all tests pass
- Update documentation if needed
- Add tests for new features
- Keep pull requests focused on a single topic

## Code Style Guidelines

The project uses ESLint and TypeScript. Before submitting your PR:

1. Format your code:
   ```bash
   bun run format
   ```

2. Run linting:
   ```bash
   bun run lint
   ```

## Reporting Issues

If you find a bug or have a feature request:

1. Check if the issue already exists in the [GitHub issues](https://github.com/Triex/GitHub-Version-Sync/issues)
2. If not, create a new issue with a clear title and description
3. Include steps to reproduce for bugs
4. Add screenshots if applicable

## Community Guidelines

- Be respectful and inclusive in all interactions
- Help review pull requests from other contributors
- Answer questions in issues when you can
- Follow the project's code of conduct

Thank you for contributing to GitHub Version Sync! Your help makes this extension better for everyone.
