---
title: Troubleshooting
excerpt: Common issues and their solutions when using GitHub Version Sync
order: 2
---

# Troubleshooting

This guide addresses common issues you might encounter when using GitHub Version Sync and provides solutions to help you resolve them.

## Version Not Being Updated

### Issue: Version in package.json is not updated during commit

**Possible Causes:**
- The package.json file is not properly formatted
- The file is not in the root directory of your repository
- You might not have staging permissions for package.json

**Solutions:**
1. Check that your package.json is valid JSON
2. Ensure package.json is in the root of your repository
3. If using a custom version file, check the path in settings
4. Make sure the extension has permission to modify files

## GitHub Authentication Issues

### Issue: "Authentication failed" when creating a GitHub release

**Possible Causes:**
- Your GitHub token might be invalid or expired
- The token doesn't have the required permissions
- Network connectivity issues

**Solutions:**
1. Generate a new token in your [GitHub settings](https://github.com/settings/tokens)
2. Ensure the token has the `repo` scope
3. Check your internet connection
4. In VS Code, run "GitHub Version Sync: Clear Token" from the Command Palette, then try again

## Git Tag Problems

### Issue: Git tags are not being created or pushed

**Possible Causes:**
- Git tagging might be disabled in settings
- Push permissions might be restricted
- Git remote configuration issues

**Solutions:**
1. Check that `github-versionsync.enableAutoTag` is set to `true`
2. For pushing tags, ensure `github-versionsync.pushTags` is `true`
3. Verify you have proper Git credentials and permissions
4. Check your Git remote configuration with `git remote -v`

## Changelog Generation Issues

### Issue: Changelog is empty or incomplete

**Possible Causes:**
- No commits between the last version and current version
- Git history might be shallow
- Custom commit message formats might not be parsed correctly

**Solutions:**
1. Ensure you have commits between versions
2. If working with a shallow clone, fetch a complete history
3. Make sure commit messages follow conventional format for better changelog generation

## Performance Issues

### Issue: Extension causes VS Code to slow down

**Possible Causes:**
- Large Git history in repository
- Too many file patterns in `includePackageFiles`
- Resource-intensive pre-release commands

**Solutions:**
1. Optimize the glob patterns in `includePackageFiles`
2. Simplify pre-release commands
3. Consider using shallow Git history when not working with changelog generation

## Extension Conflicts

### Issue: Conflicts with other VS Code extensions

**Possible Causes:**
- Other Git extensions might interfere with version control features
- SCM providers might conflict

**Solutions:**
1. Temporarily disable other Git-related extensions to identify conflicts
2. Check extension logs for error messages
3. Update to the latest versions of all extensions

## Reset and Reload

If you're experiencing persistent issues that aren't resolved by the above solutions:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "GitHub Version Sync: Reset Extension"
3. Reload VS Code window (`Ctrl+R` or `Cmd+R` on Mac)

## Getting Support

If you're still experiencing issues:

1. Check the [GitHub repository issues](https://github.com/Triex/GitHub-VersionSync/issues) to see if your problem has been reported
2. Create a new issue with detailed information about your problem
3. Include your extension settings, VS Code version, and OS details
