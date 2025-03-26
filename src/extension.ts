import * as cp from 'child_process';
import * as fs from 'fs';
import { Octokit } from 'octokit';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChangelogGenerator, EXTENSION_NAME } from './changelog';
import { extensionState } from './extensionState';

const EXTENSION_NAME_OLD = 'github-versionsync';
let enableGitHubRelease = false;
let enableAutoTag = true;
type VersionType = 'major' | 'minor' | 'patch' | 'custom' | 'none';
let currentVersionMode: VersionType = 'patch';  // Keep patch as default for version bumping
let nextVersion: string = '';
let customVersion: string | undefined;
let isCreatingRelease = false;  // Add flag to prevent recursive releases
let isUpdatingVersion = false;  // Add flag to prevent recursive version updates
let shouldUpdateVersion = false; // Flag to control version updates during commit
let lastCalculatedVersion: string | undefined;  // Track last calculated version
let isRefreshing = false;

// Add back the execAsync function
async function execAsync(command: string, options: cp.ExecOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

// Get formatted version type for display
function getVersionTypeDisplay(type: VersionType): string {
    if (type === 'none') return 'No Change';
    return type === 'custom' ? 'Custom' : type.charAt(0).toUpperCase() + type.slice(1);
}

// Update title when versions change
function updateTitle() {
    if (!extensionState.treeView || !extensionState.versionProvider) return;
    
    const currentVersion = extensionState.versionProvider.getCurrentVersion();
    nextVersion = customVersion || extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
    lastCalculatedVersion = currentVersion;
    
    // Keep the main title simple
    extensionState.treeView.title = 'Version Control';
    
    // Show version details in the description
    extensionState.treeView.description = currentVersionMode === 'none' ? 
        `${currentVersion} [No Change]` :
        `${currentVersion} → ${nextVersion} [${getVersionTypeDisplay(currentVersionMode)}]`;
    
    if (extensionState.versionProvider) {
        extensionState.versionProvider.updateInputBox();
    }
    
    // Force a refresh by calling the refresh method directly
    if (extensionState.versionProvider) {
        extensionState.versionProvider.refresh();
    }
}

// Update status bar with current version mode
function updateVersionStatusBar() {
    if (!extensionState.versionStatusBarItem) return;
    
    const modeEmojis: Record<string, string> = {
        'patch': '🐛',
        'minor': '✨',
        'major': '💥',
        'none': '⛔',
        'custom': '✏️'
    };
    
    extensionState.versionStatusBarItem.text = `$(versions) ${modeEmojis[currentVersionMode]} ${currentVersionMode}`;
    extensionState.versionStatusBarItem.tooltip = `Version Mode: ${currentVersionMode}\nClick to change`;
    extensionState.versionStatusBarItem.show();
}

class VersionQuickPickItem implements vscode.QuickPickItem {
    constructor(
        public label: string,
        public description: string,
        public type: VersionType
    ) {}
}

class VersionProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private lastCalculatedVersion?: string;
    private currentRepo?: any;

    constructor() {
        this.lastCalculatedVersion = undefined;
    }

    setCurrentRepo(repo: any) {
        this.currentRepo = repo;
    }

    getCurrentVersion(): string {
        // Always read the current version from package.json to ensure we have the latest
        const version = getCurrentVersion();
        if (!version) {
            return '0.1.0';
        }
        // Update the cached version
        this.lastCalculatedVersion = version;
        return version;
    }

    bumpVersion(version: string, type: VersionType = 'patch'): string {
        const [major, minor, patch] = version.split('.').map(Number);
        
        switch (type) {
            case 'major':
                return `${major + 1}.0.0`;
            case 'minor':
                return `${major}.${minor + 1}.0`;
            case 'patch':
                return `${major}.${minor}.${patch + 1}`;
            default:
                return version;
        }
    }

    updateInputBox() {
        console.log('Updating SCM input box');
        if (this.currentRepo) {
            const currentVersion = this.getCurrentVersion();
            // Don't trigger version updates, just show the potential next version
            const nextVer = nextVersion || this.bumpVersion(currentVersion, currentVersionMode);
            const currentMessage = this.currentRepo.inputBox.value;
            
            // Only update placeholder if version change is needed and message doesn't have version
            if (currentVersionMode !== 'none' && currentVersion !== nextVer && !currentMessage.includes(`v${nextVer}`)) {
                this.currentRepo.inputBox.placeholder = `Commit message v${nextVer} (e.g., feat: Add new feature v${nextVer})`;
            }
        }
    }

    async updateVersion(version: string): Promise<void> {
        if (isUpdatingVersion) {
            console.log('Version update already in progress, skipping to prevent recursion');
            return;
        }

        isUpdatingVersion = true;
        try {
            if (!this.currentRepo) {
                throw new Error('No repository initialized');
            }

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.currentRepo.rootUri);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found for repository');
            }

            const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error('package.json not found');
            }

            try {
                // First check if there are any other changes to package.json
                // If so, we need to stash them first so we only commit version changes
                const hasChanges = await execAsync(`git diff --quiet -- "${packageJsonPath}" || echo "changes"`, { 
                    cwd: workspaceFolder.uri.fsPath 
                });
                
                let needsStash = hasChanges.trim() === "changes";
                let stashCreated = false;
                
                if (needsStash) {
                    console.log('Detected other changes to package.json, stashing before version update');
                    // Stash only the package.json changes
                    await execAsync(`git stash push -m "temp stash for version change" -- "${packageJsonPath}"`, { 
                        cwd: workspaceFolder.uri.fsPath 
                    });
                    stashCreated = true;
                    console.log('Stashed other changes to package.json');
                }
                
                try {
                    // Read the current package.json
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    
                    // Only update if the version is actually different
                    if (packageJson.version !== version) {
                        // Store old version for comparison
                        const oldVersion = packageJson.version;
                        
                        // Update version in package.json
                        packageJson.version = version;
                        const updatedContent = JSON.stringify(packageJson, null, 2);
                        fs.writeFileSync(packageJsonPath, updatedContent);
                        
                        console.log(`Updated package.json with only version change from ${oldVersion} to ${version}`);
                        
                        // Reset the cached version to force recalculation
                        this.lastCalculatedVersion = undefined;
                        lastCalculatedVersion = undefined; // Reset global version cache too
                        nextVersion = '';
                        
                        // Only set shouldUpdateVersion to true when we've actually updated the version
                        shouldUpdateVersion = true;
                        
                        // Force a refresh of the UI after version update with a small delay
                        setTimeout(() => {
                            this.refresh();
                            
                            // Update UI components after refresh
                            setTimeout(() => {
                                updateVersionStatusBar();
                            }, 100);
                        }, 200);
                        
                        vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${version}`);
                    } else {
                        console.log(`Version already set to ${version}, no update needed`);
                    }
                } finally {
                    // If we stashed changes, pop them back
                    if (stashCreated) {
                        console.log('Restoring stashed changes to package.json');
                        try {
                            await execAsync('git stash pop', { cwd: workspaceFolder.uri.fsPath });
                            console.log('Successfully restored stashed changes');
                        } catch (stashError) {
                            console.error('Failed to restore stashed changes - may need manual intervention:', stashError);
                            vscode.window.showWarningMessage(
                                'Version update succeeded, but there were conflicts restoring other package.json changes. ' +
                                'You may need to resolve these manually with `git stash pop`.'
                            );
                        }
                    }
                }
            } catch (error: any) {
                console.error('Error updating version:', error);
                vscode.window.showErrorMessage(`Failed to update version: ${error.message || error}`);
            }
        } finally {
            isUpdatingVersion = false;
        }
    }

    refresh(): void {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
            console.log('Refreshing version provider tree view');
            this._onDidChangeTreeData.fire();
        } finally {
            isRefreshing = false;
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<vscode.TreeItem[]> {
        // Always get the current version directly to ensure it's up-to-date
        const currentVersion = this.getCurrentVersion();
        
        // Calculate next version if needed
        if (!lastCalculatedVersion || nextVersion === '' || lastCalculatedVersion !== currentVersion) {
            nextVersion = this.bumpVersion(currentVersion, currentVersionMode);
            lastCalculatedVersion = currentVersion;
        }

        // Reset shouldUpdateVersion flag after tree refresh
        shouldUpdateVersion = false;

        const currentItem = new vscode.TreeItem(`Current: ${currentVersion}`);
        currentItem.iconPath = new vscode.ThemeIcon('tag');
        currentItem.contextValue = 'current';
        
        // Enhanced version mode visibility in tree view
        const modeIcons = {
            'patch': 'bug',
            'minor': 'package',
            'major': 'versions',
            'none': 'close',
            'custom': 'edit'
        };
        
        const modeDescriptions = {
            'patch': '(bug fixes)',
            'minor': '(new features)',
            'major': '(breaking changes)',
            'none': '(no version change)',
            'custom': '(custom version)'
        };
        
        const nextItem = new vscode.TreeItem(
            `Next: ${nextVersion} [${currentVersionMode} ${modeDescriptions[currentVersionMode]}]`, 
            vscode.TreeItemCollapsibleState.None
        );
        nextItem.iconPath = new vscode.ThemeIcon(modeIcons[currentVersionMode]);
        nextItem.command = {
            command: 'github-versionsync.selectVersionType',
            title: 'Select Version Type'
        };
        nextItem.contextValue = 'next';

        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const releaseEnabled = config.get('enableGitHubRelease', false);
        const releaseOn = config.get<string[]>('releaseOn', ['major', 'minor', 'patch']);
        
        // Check GitHub authentication status
        const token = await getGitHubToken();

        // Create GitHub Release item
        const githubItem = new vscode.TreeItem('Create GitHub Release', vscode.TreeItemCollapsibleState.None);
        githubItem.iconPath = new vscode.ThemeIcon('github');
        githubItem.command = {
            command: 'github-versionsync.createOneOffRelease',
            title: 'Create GitHub Release'
        };

        // Create Auto-Release Settings item
        const autoReleaseItem = new vscode.TreeItem('Auto-Release Settings', vscode.TreeItemCollapsibleState.None);
        autoReleaseItem.command = {
            command: 'github-versionsync.toggleGitHubRelease',
            title: 'Toggle Automatic GitHub Releases'
        };

        if (!token) {
            githubItem.description = '⚠️ Sign in Required';
            githubItem.tooltip = 'Click to sign in to GitHub';
            autoReleaseItem.description = '⚠️ Sign in Required';
        } else {
            githubItem.tooltip = 'Create a GitHub release for the current version';
            if (releaseEnabled) {
                autoReleaseItem.description = `Auto: ${releaseOn.join('/')}`;
                autoReleaseItem.tooltip = `Automatic releases enabled for ${releaseOn.join('/')} versions`;
            } else {
                autoReleaseItem.description = 'Auto: Off';
                autoReleaseItem.tooltip = 'Automatic releases are disabled';
            }
        }

        return [currentItem, nextItem, githubItem, autoReleaseItem];
    }
}

async function getGitHubToken(): Promise<string | undefined> {
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

async function getRepoUrl(): Promise<string> {
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

// Add this helper function to get workspace-specific settings
function getWorkspaceConfig<T>(section: string, defaultValue: T): T {
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

// Add this helper function to get the latest version of each file type
function getLatestVersionFiles(files: vscode.Uri[]): vscode.Uri[] {
    // Group files by their base name (without version)
    const fileGroups: Record<string, vscode.Uri[]> = {};
    
    for (const file of files) {
        const filename = path.basename(file.fsPath);
        // Extract the base name (everything before the last version-like pattern)
        // This regex matches patterns like name-1.2.3.ext or name_v1.2.3.ext
        const baseNameMatch = filename.match(/^(.*?)[-_]v?(\d+\.\d+\.\d+|\d+\.\d+|\d+)/i);
        
        const baseName = baseNameMatch ? baseNameMatch[1] : filename;
        
        if (!fileGroups[baseName]) {
            fileGroups[baseName] = [];
        }
        fileGroups[baseName].push(file);
    }
    
    // For each group, sort by modification time and get the most recent
    const latestFiles: vscode.Uri[] = [];
    for (const baseName in fileGroups) {
        if (fileGroups[baseName].length === 1) {
            // Only one file of this type, just include it
            latestFiles.push(fileGroups[baseName][0]);
        } else {
            // Multiple files, get stats for each and sort by modification time
            const sortedFiles = fileGroups[baseName].sort((a, b) => {
                try {
                    const statsA = fs.statSync(a.fsPath);
                    const statsB = fs.statSync(b.fsPath);
                    return statsB.mtime.getTime() - statsA.mtime.getTime(); // Descending order (newest first)
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

async function createGitHubRelease(version: string, message: string = '', title?: string) {
    // Prevent recursive releases
    if (isCreatingRelease) {
        console.log('Release creation already in progress, skipping to prevent recursion');
        return;
    }
    
    isCreatingRelease = true;
    try {
        // Use workspace-specific settings with user settings as fallback
        const prefix = getWorkspaceConfig('releasePrefix', 'v');
        
        // Run pre-release commands - use workspace-specific commands
        const preReleaseCommands = getWorkspaceConfig<string[]>('preReleaseCommands', []);
        if (preReleaseCommands.length > 0) {
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (!workspaceRoot) {
                    throw new Error('No workspace folder found');
                }

                // Use VS Code's Terminal API instead of direct cp.exec
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
                        setTimeout(() => terminal.dispose(), 2000); // Give user time to see final output
                    }
                });
            } catch (error: any) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                vscode.window.showErrorMessage(`Pre-release command failed: ${errorMessage}`);
                return;
            }
        }
        
        // Get token from VS Code's GitHub authentication
        const token = await getGitHubToken();
        
        if (!token) {
            const action = await vscode.window.showErrorMessage(
                'GitHub authentication required for creating releases.',
                'Sign in to GitHub'
            );
            
            if (action === 'Sign in to GitHub') {
                // Try to get the token again, this time forcing the login prompt
                const newToken = await getGitHubToken();
                if (!newToken) {
                    vscode.window.showErrorMessage('GitHub authentication failed.');
                    return;
                }
            } else {
                return;
            }
        }

        // Find release assets
        const includePatterns = getWorkspaceConfig('includePackageFiles', ['*.vsix']) as string[];
        const assets: string[] = [];
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        
        if (workspaceRoot) {
            for (const pattern of includePatterns) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceRoot, pattern)
                );
                
                // Filter to only include the latest version of each file type
                const latestFiles = getLatestVersionFiles(files);
                assets.push(...latestFiles.map(f => f.fsPath));
            }
        }

        try {
            // Create the release
            const octokit = new Octokit({ auth: token });
            const repoUrl = await getRepoUrl();
            const [owner, repo] = repoUrl.split('/').slice(-2);
            
            const releaseResponse = await octokit.rest.repos.createRelease({
                owner,
                repo,
                tag_name: `${prefix}${version}`,
                name: title || `Release ${prefix}${version}`,
                body: message,
                draft: false,
                prerelease: false
            });

            // Upload assets if any
            for (const asset of assets) {
                const content = await fs.promises.readFile(asset);
                await octokit.rest.repos.uploadReleaseAsset({
                    owner,
                    repo,
                    release_id: releaseResponse.data.id,
                    name: path.basename(asset),
                    data: content as any
                });
            }

            vscode.window.showInformationMessage(`Release ${prefix}${version} created successfully!`);
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to create release: ${errorMessage}`);
        }
    } finally {
        isCreatingRelease = false;  // Reset the flag when done, even if there was an error
    }
}

class ReleaseWebviewProvider {
    private static readonly viewType = 'github-versionsync.createRelease';
    private readonly _extensionUri: vscode.Uri;
    private _view?: vscode.WebviewPanel;
    private changelogGenerator: ChangelogGenerator;

    constructor(private context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        this.changelogGenerator = new ChangelogGenerator();
    }

    async show() {
        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        
        // Get current version
        let currentVersion = '';
        try {
            currentVersion = getCurrentVersion();
        } catch (e) {
            return;
        }

        this._view = vscode.window.createWebviewPanel(
            ReleaseWebviewProvider.viewType,
            'Create GitHub Release',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'media')
                ]
            }
        );

        // Get commit history
        const commitHistory = await this.getCommitHistory();
        
        if (this._view) {
            this._view.webview.html = this.getWebviewContent(currentVersion, commitHistory);

            this._view.webview.onDidReceiveMessage(
                async (message) => {
                    this._onDidReceiveMessage(message);
                },
                undefined,
                []
            );
        }
    }

    private getWebviewContent(version: string, commitHistory: string): string {
        // Get configuration
        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const showDate = config.get('changelogShowDate', false);
        const showAuthor = config.get('changelogShowAuthor', false);
        const includeMessageBody = config.get('changelogIncludeMessageBody', false);
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Create GitHub Release</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 15px;
                    color: var(--vscode-foreground);
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                }
                input, textarea {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                textarea {
                    min-height: 200px;
                    font-family: var(--vscode-editor-font-family);
                }
                button {
                    padding: 8px 12px;
                    margin-right: 8px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .checkbox-container {
                    display: flex;
                    gap: 15px;
                    margin-bottom: 10px;
                }
                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                }
                .checkbox-label input {
                    width: auto;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div>
                    <label for="version">Version</label>
                    <input type="text" id="version" value="${version}" readonly>
                </div>
                <div>
                    <label for="title">Release Title (optional)</label>
                    <input type="text" id="title" placeholder="Release ${version}">
                </div>
                <div>
                    <label for="notes">Release Notes</label>
                    <div class="checkbox-container">
                        <label class="checkbox-label">
                            <input type="checkbox" id="showDate" ${showDate ? 'checked' : ''}>
                            Show Date
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="showAuthor" ${showAuthor ? 'checked' : ''}>
                            Show Author
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="includeMessageBody" ${includeMessageBody ? 'checked' : ''}>
                            Include Message Body
                        </label>
                    </div>
                    <textarea id="notes" placeholder="Enter release notes...">${commitHistory}</textarea>
                </div>
                <div>
                    <button id="create">Create Release</button>
                    <button id="cancel">Cancel</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('create').addEventListener('click', () => {
                    const version = document.getElementById('version').value;
                    const notes = document.getElementById('notes').value;
                    const title = document.getElementById('title').value || undefined;
                    
                    vscode.postMessage({
                        command: 'createRelease',
                        version,
                        notes,
                        title
                    });
                });
                
                document.getElementById('cancel').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'cancel'
                    });
                });
                
                // Handle changelog preference changes
                document.getElementById('showDate').addEventListener('change', () => {
                    refreshChangelog();
                });
                
                document.getElementById('showAuthor').addEventListener('change', () => {
                    refreshChangelog();
                });
                
                document.getElementById('includeMessageBody').addEventListener('change', () => {
                    refreshChangelog();
                });
                
                function refreshChangelog() {
                    const showDate = document.getElementById('showDate').checked;
                    const showAuthor = document.getElementById('showAuthor').checked;
                    const includeMessageBody = document.getElementById('includeMessageBody').checked;
                    
                    vscode.postMessage({
                        command: 'refreshChangelog',
                        showDate: showDate,
                        showAuthor: showAuthor,
                        includeMessageBody: includeMessageBody
                    });
                }
                
                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.command === 'updateChangelog') {
                        document.getElementById('notes').value = message.changelog;
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private async getCommitHistory(showDate: boolean = false, showAuthor: boolean = false, includeMessageBody: boolean = false): Promise<string> {
        return this.changelogGenerator.generateChangelog(showDate, showAuthor, includeMessageBody);
    }

    private _onDidReceiveMessage(message: any) {
        switch (message.command) {
            case 'createRelease':
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Creating GitHub Release",
                    cancellable: false
                }, async () => {
                    try {
                        await createGitHubRelease(message.version, message.notes, message.title);
                        this._view?.dispose();
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Failed to create release: ${error}`);
                    }
                });
                break;
            case 'cancel':
                this._view?.dispose();
                break;
            case 'refreshChangelog':
                // Update config with user selections
                vscode.workspace.getConfiguration(EXTENSION_NAME).update('changelogShowDate', message.showDate, vscode.ConfigurationTarget.Global);
                vscode.workspace.getConfiguration(EXTENSION_NAME).update('changelogShowAuthor', message.showAuthor, vscode.ConfigurationTarget.Global);
                vscode.workspace.getConfiguration(EXTENSION_NAME).update('changelogIncludeMessageBody', message.includeMessageBody, vscode.ConfigurationTarget.Global);
                
                // Regenerate the changelog with the new preferences
                this.changelogGenerator.generateChangelog(
                    message.showDate, 
                    message.showAuthor,
                    message.includeMessageBody
                ).then(newCommitHistory => {
                    if (this._view) {
                        this._view.webview.postMessage({ command: 'updateChangelog', changelog: newCommitHistory });
                    }
                });
                break;
        }
    }
}

function getCurrentVersion(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace opened.");
        return "";
    }

    const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const versionFilePath = path.join(workspaceFolders[0].uri.fsPath, config.get('versionFile', ''));

    try {
        // First try VERSION file if configured
        if (config.get('versionFile', '') && fs.existsSync(versionFilePath)) {
            return fs.readFileSync(versionFilePath, 'utf-8').trim();
        }

        // Then try package.json
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            return packageJson.version || '1.0.0';
        }

        vscode.window.showErrorMessage("No version file found (expected VERSION or package.json).");
        return "";
    } catch (error: any) {
        console.error('Error reading version:', error);
        vscode.window.showErrorMessage(`Failed to read version: ${error}`);
        return "";
    }
}

async function updateVersion(version: string, type: VersionType = 'patch') {
    if (isUpdatingVersion) {
        console.log('Version update already in progress, skipping to prevent recursion');
        return;
    }

    // We'll remove this check since we're going to manage the flag more carefully
    // if (!shouldUpdateVersion) {
    //     console.log('Version update not requested, skipping');
    //     return;
    // }

    isUpdatingVersion = true;
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error('package.json not found');
        }

        // Read the current package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        
        // Only update if the version is actually different
        if (packageJson.version !== version) {
            // Store old version for comparison
            const oldVersion = packageJson.version;
            
            // Create git tag if enabled and this is a new version
            if (enableAutoTag && version !== oldVersion) {
                try {
                    // Check if remote exists first
                    const remotes = await execAsync('git remote', { cwd: workspaceFolders[0].uri.fsPath });
                    const hasOrigin = remotes.split('\n').some(remote => remote.trim() === 'origin');
                    
                    // Check if tag already exists
                    try {
                        await execAsync(`git rev-parse v${version}`, { cwd: workspaceFolders[0].uri.fsPath });
                        // If we get here, tag exists
                        console.log(`Tag v${version} already exists, skipping tag creation`);
                        vscode.window.showInformationMessage(`Tag v${version} already exists`);
                    } catch {
                        // Tag doesn't exist, create it
                        await execAsync(`git tag v${version}`, { cwd: workspaceFolders[0].uri.fsPath });
                        
                        // Only try to push if we have a remote origin
                        if (hasOrigin) {
                            try {
                                await execAsync('git push origin --tags', { cwd: workspaceFolders[0].uri.fsPath });
                            } catch (error: any) {
                                console.error('Failed to push tags:', error);
                                vscode.window.showWarningMessage(`Created local tag but failed to push to remote: ${error.message || 'Unknown error'}`);
                            }
                        } else {
                            vscode.window.showInformationMessage('Created local tag. No remote "origin" configured for pushing tags.');
                        }
                    }
                } catch (error: any) {
                    console.error('Failed to create tag:', error);
                    vscode.window.showErrorMessage(`Failed to create tag v${version}: ${error.message}`);
                }
            }
            
            console.log('Updating version in git repo:', workspaceFolders[0].uri.fsPath);
            console.log('Relative path to package.json:', packageJsonPath);
            
            try {
                // First check if there are any other changes to package.json
                // If so, we need to stash them first so we only commit version changes
                const hasChanges = await execAsync(`git diff --quiet -- "${packageJsonPath}" || echo "changes"`, { 
                    cwd: workspaceFolders[0].uri.fsPath 
                });
                
                let needsStash = hasChanges.trim() === "changes";
                let stashCreated = false;
                
                if (needsStash) {
                    console.log('Detected other changes to package.json, stashing before version update');
                    // Stash only the package.json changes
                    await execAsync(`git stash push -m "temp stash for version change" -- "${packageJsonPath}"`, { 
                        cwd: workspaceFolders[0].uri.fsPath 
                    });
                    stashCreated = true;
                    console.log('Stashed other changes to package.json');
                }
                
                try {
                    // Now read the current package.json without other pending changes
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    const oldVersion = packageJson.version;
                    
                    // Update only the version
                    packageJson.version = version;
                    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                    console.log(`Updated package.json with only version change to ${version}`);
                    
                    // Stage only the package.json file
                    await execAsync(`git add "${packageJsonPath}"`, { cwd: workspaceFolders[0].uri.fsPath });
                    console.log(`Staged ${packageJsonPath} with version change only`);
                    
                    // Show what's staged
                    const diffCachedCmd = 'git diff --cached';
                    const stagedChanges = await execAsync(diffCachedCmd, { cwd: workspaceFolders[0].uri.fsPath });
                    console.log('Staged changes:', stagedChanges);
                    
                    // Get the current commit message
                    const commitMsg = await execAsync('git log -1 --pretty=%B', { cwd: workspaceFolders[0].uri.fsPath });
                    
                    // Create updated commit message with version info if not already present
                    let newMessage = commitMsg.trim();
                    if (!newMessage.includes(`v${version}`)) {
                        // Add version to commit message using a clean format
                        const versionFormats = {
                            'arrow': `${newMessage} → v${version}`,
                            'bump': `${newMessage} ⇧ v${version}`,
                            'simple': `${newMessage} v${version}`,
                            'release': `${newMessage} 📦 v${version}`,
                            'brackets': `${newMessage} (v${version})`
                        };
                        
                        const format = vscode.workspace.getConfiguration(EXTENSION_NAME).get('versionFormat', 'arrow');
                        newMessage = versionFormats[format] || versionFormats.simple;
                    }
                    
                    console.log('Amending commit with message:', newMessage);
                    // Amend the commit with the updated message
                    await execAsync(`git commit --amend -m "${escapeCommitMessage(newMessage)}"`, { 
                        cwd: workspaceFolders[0].uri.fsPath 
                    });
                    
                    console.log('Updated version in package.json to:', version);
                    vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${version}`);
                    
                } finally {
                    // If we stashed changes, pop them back
                    if (stashCreated) {
                        console.log('Restoring stashed changes to package.json');
                        try {
                            await execAsync('git stash pop', { cwd: workspaceFolders[0].uri.fsPath });
                            console.log('Successfully restored stashed changes');
                        } catch (stashError) {
                            console.error('Failed to restore stashed changes - may need manual intervention:', stashError);
                            vscode.window.showWarningMessage(
                                'Version update succeeded, but there were conflicts restoring other package.json changes. ' +
                                'You may need to resolve these manually with `git stash pop`.'
                            );
                        }
                    }
                }
            } catch (error: any) {
                console.error('Error updating version:', error);
                vscode.window.showErrorMessage(`Failed to update version: ${error.message || error}`);
            }
        }
    } catch (error: any) {
        console.error('Error updating version after commit:', error);
        vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
    } finally {
        isUpdatingVersion = false;
        // Force a refresh after commit is complete
        setTimeout(() => {
            extensionState.versionProvider.refresh();
            updateVersionStatusBar();
            updateTitle();
        }, 150);
    }
}

// Add a helper function to escape backticks in commit messages
function escapeCommitMessage(message: string): string {
    // Replace backticks with escaped backticks for shell execution
    return message.replace(/`/g, '\\`');
}

function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Activating github-versionsync extension');

    // Initialize extension state with context
    extensionState.initialize(context);
    console.log('Extension state initialized');

    // Create the version provider and initialize state
    extensionState.versionProvider = new VersionProvider();
    console.log('Version provider created');

    // Load configuration once at the top
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    enableAutoTag = config.get('enableAutoTag', true);
    enableGitHubRelease = config.get('enableGitHubRelease', false);
    console.log('Configuration loaded:', { enableAutoTag, enableGitHubRelease });

    // Initialize version state
    currentVersionMode = 'patch'; // Default to patch
    let currentVersion = extensionState.versionProvider.getCurrentVersion();
    nextVersion = extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
    console.log('Version state initialized:', { currentVersion, nextVersion, currentVersionMode });

    // Get the git extension and API once
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    let gitApi: any = null;

    if (gitExtension) {
        console.log('Found git extension');
        gitApi = gitExtension.getAPI(1);
        
        if (gitApi) {
            console.log('Got git API');
            console.log('Number of repositories:', gitApi.repositories.length);

            // Get current workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                console.error('No workspace folder found');
                return;
            }
            console.log('Current workspace:', workspaceFolders[0].uri.fsPath);

            // Find the repository for the current workspace
            const currentRepo = gitApi.repositories.find((repo: any) => 
                repo.rootUri.fsPath === workspaceFolders[0].uri.fsPath
            );

            if (!currentRepo) {
                console.error('No repository found for current workspace');
                return;
            }
            console.log('Found repository for current workspace:', currentRepo.rootUri.fsPath);

            // Set the current repo in the version provider
            extensionState.versionProvider.setCurrentRepo(currentRepo);

            // Watch for repository state changes with debouncing
            const debouncedStateChange = debounce(() => {
                const message = currentRepo.inputBox.value;
                if (message === lastProcessedMessage) {
                    return; // Skip if we've already processed this message
                }
                lastProcessedMessage = message;
                
                currentVersion = extensionState.versionProvider.getCurrentVersion();
                console.log('Repository state changed, message:', message);
                console.log('Current version state:', {
                    currentVersion,
                    nextVersion,
                    currentVersionMode
                });
                
                // Only update input box if the message doesn't already contain a version
                if (currentVersionMode !== 'none' && currentVersion !== nextVersion && !message.includes(`v${nextVersion}`)) {
                    extensionState.versionProvider.updateInputBox();
                }
                
                // Force UI refresh
                updateVersionStatusBar();
                updateTitle();
                extensionState.versionProvider.refresh();
            }, 300);

            // Track last processed message to prevent duplicate processing
            let lastProcessedMessage = '';
            let isCommitting = false;
            
            currentRepo.state.onDidChange(() => {
                // Only process if not currently committing
                if (!isCommitting) {
                    debouncedStateChange();
                }
            });

            // Watch for changes to the input box value
            const disposable = vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document === vscode.window.activeTextEditor?.document && 
                    event.document.uri.scheme === 'git' && 
                    event.document.uri.path === 'scm/input') {
                    
                    const message = currentRepo.inputBox.value;
                    if (!message.match(/v\d+\.\d+\.\d+/) && !isCommitting) {
                        const nextVer = nextVersion || extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
                        currentRepo.inputBox.value = `${message.trim()} v${nextVer}`;
                    }
                }
            });
            context.subscriptions.push(disposable);

            // Listen for commit events
            currentRepo.onDidCommit(async () => {
                try {
                    isCommitting = true;
                    const nextVer = nextVersion || extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
                    
                    // Get the workspace folder for this repository
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(currentRepo.rootUri);
                    if (!workspaceFolder) {
                        throw new Error('No workspace folder found for repository');
                    }

                    // Store the current package.json content
                    const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
                    const originalContent = fs.readFileSync(packageJsonPath, 'utf-8');
                    const packageJson = JSON.parse(originalContent);
                    // Store the original version before any changes
                    const oldVersion = packageJson.version;
                    
                    if (oldVersion !== nextVer) {
                        // Get the current commit message
                        const commitMsg = await execAsync('git log -1 --pretty=%B', { cwd: workspaceFolder.uri.fsPath });
                        const trimmedMsg = commitMsg.trim();
                        
                        // Add version to commit message using a clean format
                        const versionFormats = {
                            'arrow': `${trimmedMsg} → v${nextVer}`,
                            'bump': `${trimmedMsg} ⇧ v${nextVer}`,
                            'simple': `${trimmedMsg} v${nextVer}`,
                            'release': `${trimmedMsg} 📦 v${nextVer}`,
                            'brackets': `${trimmedMsg} (v${nextVer})`
                        };
                        
                        const format = vscode.workspace.getConfiguration(EXTENSION_NAME).get('versionFormat', 'arrow');
                        const newMessage = trimmedMsg.includes(`v${nextVer}`) ? 
                            trimmedMsg : 
                            (versionFormats[format] || versionFormats.simple);
                        
                        console.log(`Updating version from ${oldVersion} to ${nextVer}`);
                        console.log(`Commit message will be: "${newMessage}"`);
                        
                        // Update version in package.json
                        packageJson.version = nextVer;
                        const updatedContent = JSON.stringify(packageJson, null, 2);
                        fs.writeFileSync(packageJsonPath, updatedContent);
                        console.log(`Updated package.json file with version ${nextVer}`);

                        try {
                            // Get the git root directory
                            const gitRoot = await execAsync('git rev-parse --show-toplevel', { cwd: workspaceFolders[0].uri.fsPath });
                            const relativePath = path.relative(gitRoot.trim(), packageJsonPath);
                            
                            console.log('Updating version in git repo:', gitRoot.trim());
                            console.log('Relative path to package.json:', relativePath);
                            
                            // First check if there are any other changes to package.json
                            // If so, we need to stash them first so we only commit version changes
                            const hasChanges = await execAsync(`git diff --quiet -- "${relativePath}" || echo "changes"`, { 
                                cwd: workspaceFolders[0].uri.fsPath 
                            });
                            
                            let needsStash = hasChanges.trim() === "changes";
                            let stashCreated = false;
                            
                            if (needsStash) {
                                console.log('Detected other changes to package.json, stashing before version update');
                                // Stash only the package.json changes
                                await execAsync(`git stash push -m "temp stash for version change" -- "${relativePath}"`, { 
                                    cwd: workspaceFolders[0].uri.fsPath 
                                });
                                stashCreated = true;
                                console.log('Stashed other changes to package.json');
                            }
                            
                            try {
                                // Now read the current package.json without other pending changes
                                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                                const oldVersion = packageJson.version;
                                
                                // Update only the version
                                packageJson.version = nextVer;
                                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                                console.log(`Updated package.json with only version change to ${nextVer}`);
                                
                                // Stage only the package.json file
                                await execAsync(`git add "${relativePath}"`, { cwd: workspaceFolders[0].uri.fsPath });
                                console.log(`Staged ${relativePath} with version change only`);
                                
                                // Show what's staged
                                const diffCachedCmd = 'git diff --cached';
                                const stagedChanges = await execAsync(diffCachedCmd, { cwd: workspaceFolders[0].uri.fsPath });
                                console.log('Staged changes:', stagedChanges);
                                
                                // Get the current commit message
                                const commitMsg = await execAsync('git log -1 --pretty=%B', { cwd: workspaceFolders[0].uri.fsPath });
                                
                                // Create updated commit message with version info if not already present
                                let newMessage = commitMsg.trim();
                                if (!newMessage.includes(`v${nextVer}`)) {
                                    const versionFormats = {
                                        'arrow': `${newMessage} → v${nextVer}`,
                                        'bump': `${newMessage} ⇧ v${nextVer}`,
                                        'simple': `${newMessage} v${nextVer}`,
                                        'release': `${newMessage} 📦 v${nextVer}`,
                                        'brackets': `${newMessage} (v${nextVer})`
                                    };
                                    
                                    const format = vscode.workspace.getConfiguration(EXTENSION_NAME).get('versionFormat', 'arrow');
                                    newMessage = versionFormats[format] || versionFormats.simple;
                                }
                                
                                console.log('Amending commit with message:', newMessage);
                                // Amend the commit with the updated message
                                await execAsync(`git commit --amend -m "${escapeCommitMessage(newMessage)}"`, { 
                                    cwd: workspaceFolders[0].uri.fsPath 
                                });
                                
                                console.log('Updated version in package.json to:', nextVer);
                                vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${nextVer}`);
                            } finally {
                                // If we stashed changes, pop them back
                                if (stashCreated) {
                                    console.log('Restoring stashed changes to package.json');
                                    try {
                                        await execAsync('git stash pop', { cwd: workspaceFolders[0].uri.fsPath });
                                        console.log('Successfully restored stashed changes');
                                    } catch (stashError) {
                                        console.error('Failed to restore stashed changes - may need manual intervention:', stashError);
                                        vscode.window.showWarningMessage(
                                            'Version update succeeded, but there were conflicts restoring other package.json changes. ' +
                                            'You may need to resolve these manually with `git stash pop`.'
                                        );
                                    }
                                }
                            }
                        } catch (error: any) {
                            console.error('Error updating version:', error);
                            vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
                        }
                    }
                } catch (error: any) {
                    console.error('Error updating version after commit:', error);
                    vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
                } finally {
                    isCommitting = false;
                    // Force a refresh after commit is complete
                    setTimeout(() => {
                        extensionState.versionProvider.refresh();
                        updateVersionStatusBar();
                        updateTitle();
                    }, 150);
                }
            });

            // Initial update
            extensionState.versionProvider.updateInputBox();
        }
    }

    // Register test command
    const testCommand = vscode.commands.registerCommand('github-versionsync.testSourceControl', async () => {
        console.log('Test command triggered');
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.error('No workspace folder found');
            return;
        }
        
        // Test git extension access
        if (gitExtension && gitApi) {
            const repo = gitApi.repositories.find((repo: any) => 
                repo.rootUri.fsPath === workspaceFolders[0].uri.fsPath
            );

            if (repo) {
                console.log('Git repo found:', repo.rootUri.fsPath);
                console.log('Current commit message:', repo.inputBox.value);
                console.log('Staged changes:', repo.state.indexChanges.length);

                // Try to read package.json from the repo
                const workspaceRoot = repo.rootUri.fsPath;
                const packageJsonPath = path.join(workspaceRoot, 'package.json');
                try {
                    const packageJson = require(packageJsonPath);
                    console.log('Found package.json version:', packageJson.version);
                } catch (error: any) {
                    console.log('Error reading package.json:', error.message);
                }
            }
        }

        console.log('Current version mode:', currentVersionMode);
        console.log('Current version:', extensionState.versionProvider.getCurrentVersion());
        console.log('Next version:', nextVersion);
        console.log('Enable auto tag:', enableAutoTag);
        console.log('Enable GitHub release:', enableGitHubRelease);
        
        console.log('Refreshing version provider');
        extensionState.versionProvider.refresh();
        vscode.window.showInformationMessage('Test command executed successfully!');
    });
    context.subscriptions.push(testCommand);

    // Create and register the tree view
    extensionState.treeView = vscode.window.createTreeView('scm-version-selector', {
        treeDataProvider: extensionState.versionProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(extensionState.treeView);

    // Force refresh the tree view to ensure it initializes properly after reload
    setTimeout(() => {
        if (extensionState.versionProvider) {
            extensionState.versionProvider.refresh();
            updateTitle();
        }
    }, 500);

    // Initial title update without triggering version change
    // const currentVersion = extensionState.versionProvider.getCurrentVersion();
    nextVersion = customVersion || extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
    lastCalculatedVersion = nextVersion;
    updateTitle();

    // Create status bar item
    extensionState.versionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    extensionState.versionStatusBarItem.command = 'github-versionsync.selectVersionType';
    context.subscriptions.push(extensionState.versionStatusBarItem);

    // Update status bar with current version mode
    updateVersionStatusBar();

    // Register version selection command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.selectVersionType', async () => {
            console.log('Select version type command triggered');
            const items: vscode.QuickPickItem[] = [
                { label: '$(bug) Patch', description: 'Bug fixes (0.0.X)', detail: 'For backwards-compatible bug fixes' },
                { label: '$(package) Minor', description: 'New features (0.X.0)', detail: 'For backwards-compatible features' },
                { label: '$(versions) Major', description: 'Breaking changes (X.0.0)', detail: 'For incompatible API changes' },
                { label: '$(close) None', description: 'No version change', detail: 'Skip version bump for this commit' },
                { label: '$(edit) Custom', description: 'Set custom version', detail: 'Manually specify version number' }
            ];

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select version type for next commit',
                title: 'Version Type'
            });

            if (selected) {
                console.log('Selected version type:', selected.label);
                const type = selected.label.toLowerCase().includes('patch') ? 'patch' :
                            selected.label.toLowerCase().includes('minor') ? 'minor' :
                            selected.label.toLowerCase().includes('major') ? 'major' :
                            selected.label.toLowerCase().includes('none') ? 'none' :
                            'custom';

                if (type === 'custom') {
                    const input = await vscode.window.showInputBox({
                        prompt: 'Enter custom version number (e.g., 1.2.3)',
                        validateInput: (value) => {
                            return /^\d+\.\d+\.\d+$/.test(value) ? null : 'Please enter a valid version number (e.g., 1.2.3)';
                        }
                    });
                    if (input) {
                        console.log('Custom version entered:', input);
                        currentVersionMode = type;
                        customVersion = input;
                        nextVersion = input;
                    }
                } else {
                    console.log('Version type selected:', type);
                    currentVersionMode = type;
                    customVersion = undefined;
                    const currentVersion = extensionState.versionProvider.getCurrentVersion();
                    nextVersion = type === 'none' ? currentVersion : extensionState.versionProvider.bumpVersion(currentVersion, type);
                }
                
                console.log('Updating version status bar');
                updateVersionStatusBar();
                console.log('Updating title');
                updateTitle();
                console.log('Refreshing version provider');
                
                // Add a delay before refreshing to ensure all state changes are processed
                setTimeout(() => {
                    extensionState.versionProvider.refresh();
                }, 100);
            }
        })
    );

    // Register settings command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.openVersionSettings', () => {
            console.log('Open version settings command triggered');
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:TriexDev.github-versionsync');
        })
    );

    // Register GitHub release toggle command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.toggleGitHubRelease', async () => {
            console.log('Toggle GitHub release command triggered');
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const currentEnabled = config.get('enableGitHubRelease', false);
            await config.update('enableGitHubRelease', !currentEnabled, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Automatic GitHub releases ${!currentEnabled ? 'enabled' : 'disabled'}`);
            console.log('Refreshing version provider');
            extensionState.versionProvider.refresh();
        })
    );

    // Register create one-off release command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.createOneOffRelease', async () => {
            console.log('Create one-off release command triggered');
            try {
                // Try to get GitHub token first
                const token = await getGitHubToken();
                if (!token) {
                    const action = await vscode.window.showInformationMessage(
                        'GitHub authentication required for creating releases.',
                        'Sign in to GitHub'
                    );
                    
                    if (action === 'Sign in to GitHub') {
                        // Try to get the token again, this time forcing the login prompt
                        const newToken = await getGitHubToken();
                        if (!newToken) {
                            vscode.window.showErrorMessage('GitHub authentication failed.');
                            return;
                        }
                    } else {
                        return;
                    }
                }

                // Show the webview
                await releaseWebviewProvider.show();
            } catch (error: any) {
                console.error('Create Release Error:', error);
                vscode.window.showErrorMessage(`Failed to create release: ${error}`);
            }
        })
    );

    // Create and register the webview provider
    const releaseWebviewProvider = new ReleaseWebviewProvider(context);

    // Load configuration
    // const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    enableAutoTag = config.get('enableAutoTag', true);
    enableGitHubRelease = config.get('enableGitHubRelease', false);
    const versionFile = config.get('versionFile', '');

    // Show version file status in status bar
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = versionFile ? 
        `$(file) Using VERSION file: ${versionFile}` : 
        `$(package) Using package.json only`;
    statusBarItem.tooltip = versionFile ? 
        `Version is managed in both ${versionFile} and package.json` : 
        'Version is managed in package.json only';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register configuration change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            console.log('Configuration change detected');
            if (e.affectsConfiguration(EXTENSION_NAME)) {
                const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                enableAutoTag = config.get('enableAutoTag', true);
                enableGitHubRelease = config.get('enableGitHubRelease', false);
                const newVersionFile = config.get('versionFile', '');
                
                // Update status bar if version file changes
                if (newVersionFile !== versionFile) {
                    console.log('Updating version file status bar');
                    statusBarItem.text = newVersionFile ? 
                        `$(file) Using VERSION file: ${newVersionFile}` : 
                        `$(package) Using package.json only`;
                    statusBarItem.tooltip = newVersionFile ? 
                        `Version is managed in both ${newVersionFile} and package.json` : 
                        'Version is managed in package.json only';
                }
                
                console.log(`Configuration updated - AutoTag: ${enableAutoTag}, GitHubRelease: ${enableGitHubRelease}, VersionFile: ${newVersionFile || 'none'}`);
            }
        })
    );

    // Add test button
    const testButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    testButton.text = "$(versions) Test Version Control";
    testButton.command = 'github-versionsync.testSourceControl';
    testButton.tooltip = 'Click to test version control view';
    testButton.show();
    context.subscriptions.push(testButton);
}

export function deactivate() {}

/**
 * Check if a tag already exists
 * @param cwd Working directory
 * @param version Version to check
 * @returns True if tag exists, false otherwise
 */
async function checkTagExists(cwd: string, version: string): Promise<boolean> {
    try {
        await execAsync(`git rev-parse v${version}`, { cwd });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Check if a remote repository exists
 * @param cwd Working directory
 * @returns True if remote exists, false otherwise
 */
async function checkRemoteExists(cwd: string): Promise<boolean> {
    try {
        const result = await execAsync('git remote', { cwd });
        return result.trim().includes('origin');
    } catch (error) {
        return false;
    }
}

function showExtensionStateWarning(message: string) {
    extensionState.showStateWarning(message);
}
