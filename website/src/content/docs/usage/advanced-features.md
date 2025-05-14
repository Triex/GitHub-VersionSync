---
title: Advanced Features
excerpt: Learn about the advanced features and customization options in GitHub Version Sync
order: 3
---

# Advanced Features

GitHub Version Sync offers several advanced features to customize version management for your specific workflow needs.

## Custom Version Types

In addition to the standard semantic versioning types (patch, minor, major), GitHub Version Sync supports:

### Custom Versions

You can specify a custom version rather than using automatic semantic versioning:

1. Select "Custom" from the version type dropdown
2. Enter your desired version in the format input box
3. The extension will use your exact specified version

### No Change Option

If you want to commit without changing the version:

1. Select "No Change" from the version type dropdown
2. Your commit will use the existing version without incrementing it

## Version Files Support

GitHub Version Sync can work with different version file formats:

- **package.json** (default) - Standard for JavaScript/Node.js projects
- **VERSION file** - A simple text file containing only the version number
- **Custom file pattern** - Configure the extension to look for version in other files

To configure which files to watch:

```json
"github-versionsync.versionFiles": [
  "package.json",
  "VERSION",
  "app/build.gradle"
]
```

## Extended Settings

### Git Tag Customization

Customize how Git tags are created:

- **Tag Prefix**: Change the prefix for tags (default: "v")
  ```json
  "github-versionsync.tagPrefix": "release-"
  ```

- **Auto Tag Creation**: Enable/disable automatic tag creation
  ```json
  "github-versionsync.autoTag": false
  ```

- **Tag Push Behavior**: Control if tags are automatically pushed
  ```json
  "github-versionsync.tagPushBehavior": "always"
  ```

### Commit Message Formatting

Customize how versions appear in commit messages:

```json
"github-versionsync.versionFormat": "release"
```

Options include:
- **arrow**: → v1.2.3
- **bump**: ⇧ v1.2.3
- **simple**: v1.2.3
- **release**: 📦 v1.2.3
- **brackets**: (v1.2.3)

### Commit Message Templates

Define templates for version commit messages:

```json
"github-versionsync.commitTemplate": "chore(release): bump to version ${version}"
```

The `${version}` placeholder will be replaced with the actual version.

## Integration with CI/CD

GitHub Version Sync works well with CI/CD pipelines:

1. **Pre-commit hooks**: Use with tools like Husky to validate versions before commits
2. **GitHub Actions**: Trigger workflows on new tags or releases
3. **Build pipelines**: Use the extension's pre-release commands to build artifacts

Example GitHub Action trigger:
```yaml
on:
  push:
    tags:
      - 'v*' # Triggered by any tag matching v*
```

## Workspace-Specific Settings

You can configure different settings for different workspaces:

1. Create a `.vscode/settings.json` file in your project
2. Add GitHub Version Sync settings with workspace-specific values
3. The extension will use these settings over global preferences

This allows different projects to have their own version management strategy.
