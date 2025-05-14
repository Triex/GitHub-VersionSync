# GitHub Version Sync Extension - Marketplace Submission

## About this Extension

This extension performs version management and GitHub release automation for VS Code users. It requires the following functionality:

1. **Git Integration**: The extension needs to execute git commands to:
   - Track version changes
   - Create git tags
   - Manage version history

2. **GitHub API Integration**: The extension uses GitHub's APIs to:
   - Create GitHub releases
   - Generate changelogs from commits
   - Automate versioning workflows

All of these operations are essential for the extension's core functionality and are performed with explicit user permission through the VS Code UI.

## Security Considerations

- The extension does not execute arbitrary code
- All Git operations are standard version control workflows
- GitHub API access is secured using standard VS Code authentication
- Command executions are limited to git operations and versioning tasks only

We have declared our use of execProcess in the package.json under "restrictedSecurityExecution" to be transparent about what our extension does.

Thank you for reviewing our extension.
