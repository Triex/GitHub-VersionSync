import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from 'octokit';
import * as vscode from 'vscode';
import { extensionState } from './extensionState';
import { EXTENSION_NAME } from './changelog';

/**
 * GitHubApi class - encapsulates all GitHub API operations
 */
export class GitHubApi {
    private octokit: Octokit | null = null;
    private isCreatingRelease = false;
    private repository: any = null;

    /**
     * Gets a GitHub access token using VS Code's built-in GitHub authentication
     * @returns Promise resolving to the GitHub token or undefined if not available
     */
    public async getToken(): Promise<string | undefined> {
        try {
            // Check if the extension is in a healthy state
            if (!extensionState.isHealthy) {
                console.log('Extension in unhealthy state, skipping GitHub auth');
                return undefined;
            }
            
            // Try to get the session without forcing creation
            const session = await vscode.authentication.getSession('github', ['repo'], { 
                createIfNone: false,
                silent: true // Don't show any UI to avoid blocking
            });
            
            if (session) {
                // If we successfully get a token, reset our error state
                extensionState.recover();
                return session.accessToken;
            } else {
                console.log('No GitHub session available');
                return undefined;
            }
        } catch (error: any) {
            console.error('GitHub Authentication Error:', error);
            
            // Mark extension as unhealthy and recommend window reload
            if (!extensionState.hasShownError) {
                extensionState.showStateWarning('GitHub authentication failed. This may be due to an extension host issue');
            }
            
            return undefined;
        }
    }

    /**
     * Alias for getToken to maintain compatibility with previous code
     * @returns Promise resolving to the GitHub token or undefined if not available
     */
    public async getGitHubToken(): Promise<string | undefined> {
        return this.getToken();
    }

    /**
     * Gets the GitHub repository URL from git config
     * @returns Promise resolving to the GitHub repository URL in format "owner/repo"
     */
    public async getRepoUrl(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace opened');
        }

        // Get repository info from git config
        const gitConfigPath = path.join(workspaceFolders[0].uri.fsPath, '.git', 'config');
        if (!fs.existsSync(gitConfigPath)) {
            throw new Error('No git config found');
        }

        const gitConfig = fs.readFileSync(gitConfigPath, 'utf8');
        const repoUrlMatch = gitConfig.match(/url = .*github\.com[:/](.+\/.+)\.git/);
        
        if (!repoUrlMatch) {
            throw new Error('Could not find GitHub repository URL in git config');
        }

        return repoUrlMatch[1].replace(':', '/');
    }

    /**
     * Gets the Octokit instance, initializing it if necessary
     * @returns Promise resolving to an Octokit instance
     */
    public async getOctokit(): Promise<Octokit> {
        if (!this.octokit) {
            const token = await this.getToken();
            if (!token) {
                throw new Error('GitHub authentication required');
            }
            this.octokit = new Octokit({ auth: token });
        }
        return this.octokit;
    }

    /**
     * Gets workspace-specific settings with user settings as fallback
     * @param section Setting name
     * @param defaultValue Default value if setting is not found
     * @returns The setting value
     */
    public getWorkspaceConfig<T>(section: string, defaultValue: T): T {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return vscode.workspace.getConfiguration(EXTENSION_NAME).get(section, defaultValue);
        }
        
        // Try to get workspace setting first
        const workspaceValue = vscode.workspace.getConfiguration(
            EXTENSION_NAME, workspaceFolder.uri
        ).get<T>(section);
        
        // If workspace setting exists, return it
        if (workspaceValue !== undefined) {
            return workspaceValue;
        }
        
        // Otherwise fall back to user setting
        return vscode.workspace.getConfiguration(EXTENSION_NAME).get(section, defaultValue);
    }

    /**
     * Creates a GitHub release
     * @param version Version number
     * @param message Release message/description
     * @param title Optional release title
     * @param assets Optional asset files to include
     * @returns Promise resolving to true if successful
     */
    public async createRelease(
        version: string, 
        message: string = '', 
        title?: string, 
        assets: string[] = []
    ): Promise<boolean> {
        // Prevent recursive releases
        if (this.isCreatingRelease) {
            console.log('Release creation already in progress, skipping to prevent recursion');
            return false;
        }
        
        this.isCreatingRelease = true;
        try {
            // Use workspace-specific settings with user settings as fallback
            const prefix = this.getWorkspaceConfig('releasePrefix', 'v');
            
            // Run pre-release commands if specified
            if (!await this.runPreReleaseCommands()) {
                return false;
            }
            
            // Get token and ensure user is authenticated
            const token = await this.getToken();
            
            if (!token) {
                const action = await vscode.window.showErrorMessage(
                    'GitHub authentication required for creating releases.',
                    'Sign in to GitHub'
                );
                
                if (action === 'Sign in to GitHub') {
                    // Try to get the token again, this time forcing the login prompt
                    const session = await vscode.authentication.getSession('github', ['repo'], { 
                        createIfNone: true,
                        silent: false
                    });
                    
                    if (!session) {
                        vscode.window.showErrorMessage('GitHub authentication failed.');
                        return false;
                    }
                } else {
                    return false;
                }
            }

            try {
                // Create the release
                const octokit = new Octokit({ auth: token });
                const repoUrl = await this.getRepoUrl();
                const [owner, repo] = repoUrl.split('/').slice(-2);
                
                const releaseResponse = await octokit.rest.repos.createRelease({
                    owner,
                    repo,
                    tag_name: `${prefix}${version}`,
                    name: title || `Release ${prefix}${version}`,
                    body: message,
                    draft: this.getWorkspaceConfig('createDraftRelease', false),
                    prerelease: this.getWorkspaceConfig('markAsPrerelease', false)
                });
                
                // If we have assets, upload them
                if (assets.length > 0) {
                    await this.uploadReleaseAssets(
                        octokit, 
                        owner, 
                        repo, 
                        releaseResponse.data.id, 
                        assets
                    );
                }
                
                // Open the release in the browser
                const releaseUrl = releaseResponse.data.html_url;
                vscode.window.showInformationMessage(
                    `GitHub release created for v${version}!`,
                    'Open in Browser'
                ).then(selection => {
                    if (selection === 'Open in Browser') {
                        vscode.env.openExternal(vscode.Uri.parse(releaseUrl));
                    }
                });
                
                return true;
            } catch (error: any) {
                console.error('Error creating GitHub release:', error);
                vscode.window.showErrorMessage(`Failed to create release: ${error.message}`);
                return false;
            }
        } finally {
            this.isCreatingRelease = false;
        }
    }

    /**
     * Uploads assets to a GitHub release
     * @param octokit Octokit instance
     * @param owner Repository owner
     * @param repo Repository name
     * @param releaseId Release ID
     * @param assets Asset file paths
     */
    private async uploadReleaseAssets(
        octokit: Octokit, 
        owner: string, 
        repo: string, 
        releaseId: number, 
        assets: string[]
    ): Promise<void> {
        // Upload each asset
        for (const assetPath of assets) {
            const fileName = path.basename(assetPath);
            
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Uploading ${fileName}`,
                cancellable: false
            }, async (progress) => {
                try {
                    // Read file content
                    const fileContent = fs.readFileSync(assetPath);
                    const fileSize = fs.statSync(assetPath).size;
                    
                    // Determine content type based on extension
                    const contentType = this.getContentType(assetPath);
                    
                    // Upload to GitHub
                    await octokit.rest.repos.uploadReleaseAsset({
                        owner,
                        repo,
                        release_id: releaseId,
                        name: fileName,
                        data: fileContent as any,
                        headers: {
                            'content-type': contentType,
                            'content-length': fileSize
                        }
                    });
                    
                    progress.report({ increment: 100 });
                } catch (error: any) {
                    console.error(`Error uploading asset ${fileName}:`, error);
                    vscode.window.showWarningMessage(`Failed to upload ${fileName}: ${error.message}`);
                }
            });
        }
    }

    /**
     * Runs pre-release commands from configuration
     * @returns Promise resolving to true if successful or no commands to run
     */
    private async runPreReleaseCommands(): Promise<boolean> {
        // Run pre-release commands - use workspace-specific commands
        const preReleaseCommands = this.getWorkspaceConfig<string[]>('preReleaseCommands', []);
        if (preReleaseCommands.length === 0) {
            return true;
        }
        
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace folder found');
            }

            // Use VS Code's Terminal API
            const terminal = vscode.window.createTerminal(`Version Sync Pre-release`);
            terminal.show();
            
            // Run each command sequentially
            const terminal_output = await new Promise<boolean>(async (resolve, reject) => {
                // Add a disposable for terminal close event
                const disposable = vscode.window.onDidCloseTerminal(closedTerminal => {
                    if (closedTerminal === terminal) {
                        // Terminal was closed by user
                        disposable.dispose();
                        reject(new Error('Pre-release command terminal was closed before completion'));
                    }
                });
                
                try {
                    // Create a progress indicator while commands are running
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "Running pre-release commands",
                        cancellable: true
                    }, async (progress, token) => {
                        token.onCancellationRequested(() => {
                            terminal.dispose();
                            reject(new Error('Pre-release commands were canceled'));
                        });
                        
                        for (let i = 0; i < preReleaseCommands.length; i++) {
                            const cmd = preReleaseCommands[i];
                            progress.report({ 
                                message: `Running command ${i + 1}/${preReleaseCommands.length}: ${cmd.length > 30 ? cmd.substring(0, 30) + '...' : cmd}`,
                                increment: (100 / preReleaseCommands.length) 
                            });
                            
                            // Send the command to the terminal
                            terminal.sendText(cmd, true);
                            
                            // Wait for a moment to let the command start
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // Simple check - this doesn't guarantee command success
                            // but gives time for the command to complete
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                        
                        // All commands were sent and given time to execute
                        resolve(true);
                    });
                } catch (e) {
                    reject(e);
                } finally {
                    // Clean up
                    disposable.dispose();
                    setTimeout(() => terminal.dispose(), 2000);
                }
            });
            
            return true;
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Pre-release command failed: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Helper function to find latest version files from a collection
     * @param files Array of file URIs
     * @returns Array of latest version file URIs
     */
    public getLatestVersionFiles(files: vscode.Uri[]): vscode.Uri[] {
        // Group files by base name (without version numbers)
        const fileGroups: Record<string, vscode.Uri[]> = {};
        
        for (const file of files) {
            const fileName = path.basename(file.fsPath);
            
            // Extract the base name (everything before the last version-like pattern)
            // This regex matches patterns like name-1.2.3.ext or name_v1.2.3.ext
            const baseNameMatch = fileName.match(/^(.*?)[-_]v?(\d+\.\d+\.\d+|\d+\.\d+|\d+)/i);
            const baseName = baseNameMatch ? baseNameMatch[1] : fileName;
            
            if (!fileGroups[baseName]) {
                fileGroups[baseName] = [];
            }
            fileGroups[baseName].push(file);
        }
        
        // For each group, find the file with the latest modified time
        const latestFiles: vscode.Uri[] = [];
        for (const baseName in fileGroups) {
            if (fileGroups[baseName].length === 1) {
                // Only one file in this group
                latestFiles.push(fileGroups[baseName][0]);
            } else {
                // Multiple files, sort by modification time
                const sortedFiles = fileGroups[baseName].sort((a, b) => {
                    try {
                        const statsA = fs.statSync(a.fsPath);
                        const statsB = fs.statSync(b.fsPath);
                        return statsB.mtime.getTime() - statsA.mtime.getTime(); // Newest first
                    } catch (e) {
                        return 0; // If we can't get stats, don't change order
                    }
                });
                
                // Add the newest file (first after sorting)
                latestFiles.push(sortedFiles[0]);
            }
        }
        
        return latestFiles;
    }

    /**
     * Gets the content type based on file extension
     * @param filePath Path to the file
     * @returns Content type string
     */
    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        
        const contentTypes: Record<string, string> = {
            '.vsix': 'application/octet-stream',
            '.zip': 'application/zip',
            '.tar': 'application/x-tar',
            '.gz': 'application/gzip',
            '.json': 'application/json',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.exe': 'application/vnd.microsoft.portable-executable'
        };
        
        return contentTypes[ext] || 'application/octet-stream';
    }

    /**
     * Set the Git repository for this instance to use
     * @param repository VS Code Git extension repository instance
     */
    public setRepository(repository: any): void {
        this.repository = repository;
        console.log('Repository set in GitHubApi');
    }
}

// Export a singleton instance for use throughout the extension
export const githubApi = new GitHubApi();
