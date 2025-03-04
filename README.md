# GitHub Version Sync

A VS Code extension that simplifies version management and GitHub releases. It automatically updates version numbers in both `package.json` and a dedicated `VERSION` file, creates git tags, and optionally creates GitHub releases when committing changes.

## Features

- **Version Management**: Supports semantic versioning with patch, minor, and major version bumps
- **Dual Version Tracking**: Maintains versions in both `VERSION` file and `package.json` (if present)
- **Auto-tagging**: Automatically creates and pushes git tags for version commits
- **GitHub Release Integration**: Optional automatic creation of GitHub releases
- **Configurable Settings**: Customize behavior through VS Code settings

## Installation

1. Install the extension from the VS Code marketplace
2. Configure your GitHub token if you plan to use the GitHub release feature:
   - Generate a GitHub Personal Access Token with `repo` scope
   - Set it as an environment variable: `GITHUB_TOKEN=your_token`

## Usage

### Version Control Buttons

The extension adds three buttons to your Source Control panel:
- **Patch Version**: Bump patch version (e.g., 1.0.0 → 1.0.1)
- **Minor Version**: Bump minor version (e.g., 1.0.0 → 1.1.0)
- **Major Version**: Bump major version (e.g., 1.0.0 → 2.0.0)

### Settings

Configure the extension through VS Code settings:
- `githubVersionSync.enableAutoTag`: Enable/disable automatic git tag creation
- `githubVersionSync.enableGitHubRelease`: Enable/disable automatic GitHub release creation
- `githubVersionSync.versionFile`: Specify the name of the version file (default: "VERSION")

## Development

To build and run the extension locally:

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm run build
   ```
4. Press F5 in VS Code to launch the extension in debug mode

## License

MIT License - see LICENSE file for details