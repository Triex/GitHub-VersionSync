import * as vscode from 'vscode';
import * as util from 'util';
import * as child_process from 'child_process';

const execAsync = util.promisify(child_process.exec);

export const EXTENSION_NAME = 'github-versionsync';

/**
 * Escape special characters in strings used in git commands
 * This prevents issues with quotes in commit messages
 */
export function escapeGitString(str: string): string {
    // Escape double quotes with backslash
    return str.replace(/"/g, '\\"');
}

/**
 * Class to handle changelog generation functionality
 */
export class ChangelogGenerator {
    /**
     * Generate a fallback changelog when no commits are found
     * @param currentVersion Current version
     * @returns A simple fallback changelog
     */
    private generateFallbackChangelog(currentVersion: string): string {
        return `# Release ${currentVersion}\n\n## Changes\n\n- This release includes recent changes not captured in the commit history\n- You can add custom release notes here\n\nRelease date: ${new Date().toISOString().split('T')[0]}`;
    }
    /**
     * Generate a changelog from git commit history
     * 
     * @param showDate Include commit dates in the changelog
     * @param showAuthor Include commit authors in the changelog
     * @param includeMessageBody Include full commit message bodies in the changelog
     * @returns Formatted changelog as markdown string
     */
    public async generateChangelog(
        showDate: boolean = false, 
        showAuthor: boolean = false, 
        includeMessageBody: boolean = false
    ): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return '';
        }

        // Get changelog configuration
        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        
        // Use passed parameters instead if provided, otherwise fall back to config values
        const useShowDate = showDate !== undefined ? showDate : config.get('changelogShowDate', false);
        const useShowAuthor = showAuthor !== undefined ? showAuthor : config.get('changelogShowAuthor', false);
        const useIncludeMessageBody = includeMessageBody !== undefined ? includeMessageBody : config.get('changelogIncludeMessageBody', false);

        try {
            // Try to get the last tag
            let lastTag = '';
            try {
                // Get tag prefix from settings for consistency with tag creation
                const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                const tagPrefix = config.get('releasePrefix', 'v');
                
                // First try to get the most recent tag that matches our prefix pattern
                try {
                    const result = await execAsync(`git tag --sort=-creatordate | grep "^${tagPrefix}" | head -n 1`, { 
                        cwd: workspaceFolders[0].uri.fsPath 
                    });
                    lastTag = result.stdout.trim();
                    console.log(`Found most recent tag with prefix ${tagPrefix}: ${lastTag}`);
                } catch (prefixError) {
                    // If no tags with prefix are found, fall back to any tag
                    console.log(`No tags with prefix ${tagPrefix} found, falling back to any tag`);
                    const result = await execAsync('git describe --tags --abbrev=0', { 
                        cwd: workspaceFolders[0].uri.fsPath 
                    });
                    lastTag = result.stdout.trim();
                }
            } catch {
                console.log('No tags found at all, will include all commits in changelog');
                // No tags exist, will get all commits
            }

            // If we're including message bodies, we need to use a different approach
            if (useIncludeMessageBody) {
                return this.generateChangelogWithBodies(lastTag, useShowDate, useShowAuthor, workspaceFolders[0]);
            } else {
                return this.generateSimpleChangelog(lastTag, useShowDate, useShowAuthor, workspaceFolders[0]);
            }
        } catch (error: any) {
            console.error('Error getting commit history:', error);
            return '### Failed to get commit history';
        }
    }

    /**
     * Generate a changelog that includes full commit message bodies
     */
    private async generateChangelogWithBodies(
        lastTag: string, 
        showDate: boolean, 
        showAuthor: boolean, 
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<string> {
        // Get current version for comparison with last tag
        const currentVersion = await this.getCurrentVersion(workspaceFolder);
        // Use a format that includes a delimiter to separate entries
        const delimiter = '---COMMIT-DELIMITER---';
        
        let formatString = `${delimiter}%n`;
        
        if (showDate) {
            formatString += '%ad%n';
        }
        
        formatString += '%s';
        
        if (showAuthor) {
            formatString += '%n%an';
        }
        
        formatString += '%n%b';
        
        // Get the commit history with full message bodies
        // Properly escape formatString to prevent issues with quotes
        const escapedFormatString = escapeGitString(formatString);
        
        let gitLogCommand;
        if (!lastTag) {
            // If no tag exists, show all commits
            gitLogCommand = `git log --pretty=format:"${escapedFormatString}" --date=short`;
            console.log('No tags found, showing all commits');
        } else {
            // Check if the last tag matches the current version
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const tagPrefix = config.get('releasePrefix', 'v');
            const expectedTag = `${tagPrefix}${currentVersion}`;
            
            if (expectedTag === lastTag) {
                // If tag matches version, show commits since tag
                gitLogCommand = `git log ${lastTag}..HEAD --pretty=format:"${escapedFormatString}" --date=short`;
                console.log(`Using tagged version ${lastTag} for changelog`);
            } else {
                // If tag doesn't match version, show a reasonable number of recent commits
                gitLogCommand = `git log -30 --pretty=format:"${escapedFormatString}" --date=short`;
                console.log(`Version mismatch (tag=${lastTag}, version=${currentVersion}), showing last 30 commits`);
            }
        }
        
        let rawCommitLog = '';
        
        try {
            // First try the original command
            const result = await execAsync(gitLogCommand, { 
                cwd: workspaceFolder.uri.fsPath 
            });
            
            rawCommitLog = result.stdout;
            
            // If we got results, use them
            if (rawCommitLog && rawCommitLog.trim()) {
                console.log('Got commits using specific range command');
                // Continue with this result - will process below
            } else {
                // If no results, fall back to showing recent commits instead
                console.log('No commits found with range command, falling back to recent commits');
                const fallbackCmd = `git log -30 --pretty=format:"${escapedFormatString}" --date=short`;
                const fallbackResult = await execAsync(fallbackCmd, { 
                    cwd: workspaceFolder.uri.fsPath 
                });
                
                // Use the fallback results
                const fallbackLog = fallbackResult.stdout;
                if (fallbackLog && fallbackLog.trim()) {
                    console.log('Got commits using fallback command');
                    return this.processCommitLog(fallbackLog, delimiter, showDate, showAuthor, currentVersion, null);
                }
            }
        } catch (error: any) { // Explicitly type as any to access message property
            console.error('Error getting commits with specific range:', error);
            
            // Try fallback to recent commits
            try {
                console.log('Trying fallback to recent commits due to error');
                const fallbackCmd = `git log -30 --pretty=format:"${escapedFormatString}" --date=short`;
                const fallbackResult = await execAsync(fallbackCmd, { 
                    cwd: workspaceFolder.uri.fsPath 
                });
                
                const fallbackLog = fallbackResult.stdout;
                if (fallbackLog && fallbackLog.trim()) {
                    console.log('Got commits using fallback command after error');
                    return this.processCommitLog(fallbackLog, delimiter, showDate, showAuthor, currentVersion, null);
                }
            } catch (fallbackError) {
                console.error('Error getting commits with fallback:', fallbackError);
                const errorMsg = error && typeof error === 'object' && 'message' in error ? error.message : 'Unknown error';
                return `### Error generating changelog: ${errorMsg}`;
            }
            
            const errorMsg = error && typeof error === 'object' && 'message' in error ? error.message : 'Unknown error';
            return `### Error generating changelog: ${errorMsg}`;
        }
        
        // Process the raw commit log
        return this.processCommitLog(rawCommitLog, delimiter, showDate, showAuthor, currentVersion, lastTag);
    }
    
    /**
     * Process a raw commit log into a formatted changelog
     * @param rawCommitLog The raw commit log output
     * @param delimiter The delimiter used to separate commits
     * @param showDate Whether to show dates
     * @param showAuthor Whether to show authors
     * @param currentVersion The current version
     * @param lastTag The last tag or null if using fallback
     * @returns Formatted changelog
     */
    private processCommitLog(
        rawCommitLog: string,
        delimiter: string,
        showDate: boolean,
        showAuthor: boolean,
        currentVersion: string,
        lastTag: string | null
    ): string {
        // Split by delimiter and process each commit separately
        const commits = rawCommitLog.split(delimiter).filter(entry => entry.trim().length > 0);
        
        if (commits.length === 0) {
            // Force showing some commits if none were found
            return this.generateFallbackChangelog(currentVersion);
        }
        
        // Add a clear title with version info
        let formattedOutput = `# Release ${currentVersion}\n\n`;
        
        // Add a summary section showing what's changed since last tag
        if (lastTag && lastTag.trim()) {
            formattedOutput += `## Changes since ${lastTag.trim()}\n\n`;
        } else {
            formattedOutput += `## Recent Changes\n\n`;
        }
        
        // Process each commit to include both subject and body
        for (const commit of commits) {
            // Get the lines from the commit
            const lines = commit.trim().split('\n');
            let lineIndex = 0;
            
            // First line might be date if showDate is true
            let dateStr = '';
            if (showDate) {
                dateStr = lines[lineIndex++];
            }
            
            // Next line is always the subject
            const subject = lines[lineIndex++] || 'Unknown commit';
            
            // Author might be next if showAuthor is true
            let authorStr = '';
            if (showAuthor) {
                authorStr = lines[lineIndex++] || '';
            }
            
            // Remaining lines form the body
            const body = lines.slice(lineIndex).join('\n').trim();
            
            // Add formatted commit
            formattedOutput += `- `;
            
            if (showDate) {
                formattedOutput += `**${dateStr}** `;
            }
            
            formattedOutput += subject;
            
            if (showAuthor) {
                formattedOutput += ` _(by ${authorStr})_`;
            }
            
            if (body) {
                formattedOutput += `\n  ${body.replace(/\n/g, '\n  ')}`;
            }
            
            formattedOutput += '\n\n';
        }
        
        return formattedOutput;
    }

    /**
     * Generate a simple changelog with only commit subjects (first lines)
     */
    private async generateSimpleChangelog(
        lastTag: string, 
        showDate: boolean, 
        showAuthor: boolean, 
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<string> {
        // Get current version for comparison with last tag
        const currentVersion = await this.getCurrentVersion(workspaceFolder);
        // Build git log format based on user preferences
        let formatString = '"- ';
        if (showDate) {
            formatString += '**%ad** ';
        }
        
        formatString += '%s';
        
        if (showAuthor) {
            formatString += ' _(by %an)_';
        }
        
        formatString += '"';

        // Get commit history with format based on user preferences
        // Properly escape formatString to prevent issues with quotes
        const escapedFormatString = escapeGitString(formatString);
        
        let gitLogCommand;
        if (!lastTag) {
            // If no tag exists, show all commits
            gitLogCommand = `git log --pretty=format:${escapedFormatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`;
            console.log('No tags found, showing all commits');
        } else {
            // Check if the last tag matches the current version
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const tagPrefix = config.get('releasePrefix', 'v');
            const expectedTag = `${tagPrefix}${currentVersion}`;
            
            if (expectedTag === lastTag) {
                // If tag matches version, show commits since tag
                gitLogCommand = `git log ${lastTag}..HEAD --pretty=format:${escapedFormatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`;
                console.log(`Using tagged version ${lastTag} for changelog`);
            } else {
                // If tag doesn't match version, show a reasonable number of recent commits
                gitLogCommand = `git log -30 --pretty=format:${escapedFormatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`;
                console.log(`Version mismatch (tag=${lastTag}, version=${currentVersion}), showing last 30 commits`);
            }
        }

        let commitLog = '';
        
        try {
            // Try the original command first
            const result = await execAsync(gitLogCommand, { 
                cwd: workspaceFolder.uri.fsPath 
            });
            
            commitLog = result.stdout;

            // If we got results, use them
            if (commitLog && commitLog.trim()) {
                console.log('Got commits using specific range command (simple changelog)');
                // Pass through to continue normal processing
            } else {
                // If no results, fall back to showing recent commits instead
                console.log('No commits found with range command, falling back to recent commits (simple changelog)');
                const fallbackCmd = `git log -30 --pretty=format:${escapedFormatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`;
                const fallbackResult = await execAsync(fallbackCmd, { 
                    cwd: workspaceFolder.uri.fsPath 
                });
                
                const fallbackCommitLog = fallbackResult.stdout;
                if (fallbackCommitLog && fallbackCommitLog.trim()) {
                    console.log('Got commits using fallback command (simple changelog)');
                    const commits = fallbackCommitLog.split('\n');
                    return this.formatSimpleChangelog(commits, currentVersion, null);
                }
            }
        } catch (error: any) {
            console.error('Error getting commits with specific range (simple changelog):', error);
            
            // Try fallback to recent commits
            try {
                console.log('Trying fallback to recent commits due to error (simple changelog)');
                const fallbackCmd = `git log -30 --pretty=format:${escapedFormatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`;
                const fallbackResult = await execAsync(fallbackCmd, { 
                    cwd: workspaceFolder.uri.fsPath 
                });
                
                const fallbackCommitLog = fallbackResult.stdout;
                if (fallbackCommitLog && fallbackCommitLog.trim()) {
                    console.log('Got commits using fallback command after error (simple changelog)');
                    const commits = fallbackCommitLog.split('\n');
                    return this.formatSimpleChangelog(commits, currentVersion, null);
                }
            } catch (fallbackError) {
                console.error('Error getting commits with fallback (simple changelog):', fallbackError);
                const errorMsg = error && typeof error === 'object' && 'message' in error ? error.message : 'Unknown error';
                return `### Error generating changelog: ${errorMsg}`;
            }
            
            const errorMsg = error && typeof error === 'object' && 'message' in error ? error.message : 'Unknown error';
            return `### Error generating changelog: ${errorMsg}`;
        }

        // Group commits by date
        const commits = commitLog.split('\n');
        
        return this.formatSimpleChangelog(commits, currentVersion, lastTag);
    }
    
    /**
     * Format a simple changelog from a list of commit lines
     * @param commits Array of commit lines
     * @param currentVersion Current version
     * @param lastTag Last tag or null if fallback
     * @returns Formatted changelog
     */
    private formatSimpleChangelog(commits: string[], currentVersion: string, lastTag: string | null): string {
        if (commits.length === 0 || !commits[0].trim()) {
            return this.generateFallbackChangelog(currentVersion);
        }
        
        // Add a clear title with version info
        let formattedOutput = `# Release ${currentVersion}\n\n`;
        
        // Add a summary section showing what's changed since last tag
        if (lastTag && lastTag.trim()) {
            formattedOutput += `## Changes since ${lastTag.trim()}\n\n`;
        } else {
            formattedOutput += `## Recent Changes\n\n`;
        }

        // Add the commits, which are already formatted nicely
        formattedOutput += commits.join('\n');

        return formattedOutput;
    }

    /**
     * Get the current version from package.json
     */
    private async getCurrentVersion(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
        try {
            const packageJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
            const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
            const packageJson = JSON.parse(packageJsonContent.toString());
            return packageJson.version || 'Unknown';
        } catch (error) {
            console.error('Error reading package.json:', error);
            return 'Unknown';
        }
    }
}
