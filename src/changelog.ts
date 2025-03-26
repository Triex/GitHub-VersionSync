import * as vscode from 'vscode';
import * as util from 'util';
import * as child_process from 'child_process';

const execAsync = util.promisify(child_process.exec);

export const EXTENSION_NAME = 'github-versionsync';

/**
 * Class to handle changelog generation functionality
 */
export class ChangelogGenerator {
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
                const result = await execAsync('git describe --tags --abbrev=0', { 
                    cwd: workspaceFolders[0].uri.fsPath 
                });
                lastTag = result.stdout.trim();
            } catch {
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
        const gitLogCommand = lastTag
            ? `git log ${lastTag}..HEAD --pretty=format:"${formatString}" --date=short`
            : `git log --pretty=format:"${formatString}" --date=short`;
        
        const result = await execAsync(gitLogCommand, { 
            cwd: workspaceFolder.uri.fsPath 
        });
        
        const rawCommitLog = result.stdout;
        
        if (!rawCommitLog) {
            return '### No new commits since last release.';
        }
        
        // Split by delimiter and process each commit separately
        const commits = rawCommitLog.split(delimiter).filter(entry => entry.trim().length > 0);
        
        // Get version from package.json
        const currentVersion = await this.getCurrentVersion(workspaceFolder);
        
        // Add a clear title with version info
        let formattedOutput = `# Release ${currentVersion}\n\n`;
        
        // Add a summary section showing what's changed since last tag
        if (lastTag && lastTag.trim()) {
            formattedOutput += `## Changes since ${lastTag.trim()}\n\n`;
        } else {
            formattedOutput += `## All Changes\n\n`;
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
            const subject = lines[lineIndex++];
            
            // Author might be next if showAuthor is true
            let authorStr = '';
            if (showAuthor) {
                authorStr = lines[lineIndex++];
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
        const gitLogCommand = lastTag
            ? `git log ${lastTag}..HEAD --pretty=format:${formatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`
            : `git log --pretty=format:${formatString} --date=short | sed -E 's/v([0-9]+\\.[0-9]+\\.[0-9]+)/[\\1]/g'`;

        const result = await execAsync(gitLogCommand, { 
            cwd: workspaceFolder.uri.fsPath 
        });
        
        const commitLog = result.stdout;

        if (!commitLog) {
            return '### No new commits since last release.';
        }

        // Group commits by date
        const commits = commitLog.split('\n');
        
        // Get version from package.json
        const currentVersion = await this.getCurrentVersion(workspaceFolder);
        
        // Add a clear title with version info
        let formattedOutput = `# Release ${currentVersion}\n\n`;
        
        // Add a summary section showing what's changed since last tag
        if (lastTag && lastTag.trim()) {
            formattedOutput += `## Changes since ${lastTag.trim()}\n\n`;
        } else {
            formattedOutput += `## All Changes\n\n`;
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
