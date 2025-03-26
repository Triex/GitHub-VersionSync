import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChangelogGenerator, EXTENSION_NAME } from './changelog';
import { extensionState } from './extensionState';
import { githubApi } from './githubApi';

const EXTENSION_NAME_OLD = 'github-versionsync';
const GITHUB_RELEASE_KEY = 'enableGitHubRelease';
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

// Helper function to get the current GitHub release setting
function getGitHubReleaseEnabled(): boolean {
    // Get all configuration levels
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    
    // Check if we have a workspace-specific override
    const workspaceValue = config.inspect(GITHUB_RELEASE_KEY)?.workspaceValue;
    const workspaceFolderValue = config.inspect(GITHUB_RELEASE_KEY)?.workspaceFolderValue;
    const globalValue = config.inspect(GITHUB_RELEASE_KEY)?.globalValue;
    
    console.log(`GitHub release setting values - Workspace: ${workspaceValue}, WorkspaceFolder: ${workspaceFolderValue}, Global: ${globalValue}`);
    
    // Workspace folder has highest precedence, then workspace, then global
    if (workspaceFolderValue !== undefined) {
        return !!workspaceFolderValue;
    }
    
    if (workspaceValue !== undefined) {
        return !!workspaceValue;
    }
    
    // Fall back to global, or default false if not set
    return !!globalValue;
}

// Helper function to set the GitHub release setting
async function setGitHubReleaseEnabled(value: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const inspection = config.inspect(GITHUB_RELEASE_KEY);
    
    console.log('SETTINGS INSPECTION:', JSON.stringify(inspection, null, 2));
    
    // First, clear the setting at all scopes to avoid conflicts
    // We'll remove workspace and workspace folder settings completely
    try {
        // Clear workspace folder level setting (if it exists)
        if (inspection?.workspaceFolderValue !== undefined) {
            console.log('Clearing workspace folder level setting');
            await config.update(GITHUB_RELEASE_KEY, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
        }
        
        // Clear workspace level setting (if it exists)
        if (inspection?.workspaceValue !== undefined) {
            console.log('Clearing workspace level setting');
            await config.update(GITHUB_RELEASE_KEY, undefined, vscode.ConfigurationTarget.Workspace);
        }
        
        // Now set at global level only
        console.log(`Setting global value to ${value}`);
        await config.update(GITHUB_RELEASE_KEY, value, vscode.ConfigurationTarget.Global);
        
        // Update the global variable to match
        enableGitHubRelease = value;
        
        // Verify the setting was applied correctly
        const newConfig = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const newEnabled = getGitHubReleaseEnabled();
        console.log(`After update, getGitHubReleaseEnabled() returns: ${newEnabled}`);
        console.log('NEW SETTINGS INSPECTION:', JSON.stringify(newConfig.inspect(GITHUB_RELEASE_KEY), null, 2));
    } catch (error) {
        console.error('Error updating settings:', error);
        throw error;
    }
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
    private initialized = false;

    constructor() {
        this.lastCalculatedVersion = undefined;
        
        // Add a delayed initialization to handle extension host reload scenarios
        setTimeout(() => {
            this.initialized = true;
            console.log('VersionProvider delayed initialization complete');
            this.refresh();
        }, 200);
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
                    // Now read the current package.json without other pending changes
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    
                    // Update only the version
                    packageJson.version = version;
                    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                    console.log(`Updated package.json with only version change to ${version}`);
                    
                    // Stage only the package.json file
                    await execAsync(`git add "${packageJsonPath}"`, { cwd: workspaceFolder.uri.fsPath });
                    console.log(`Staged ${packageJsonPath} with version change only`);
                    
                    // Show what's staged
                    const diffCachedCmd = 'git diff --cached';
                    const stagedChanges = await execAsync(diffCachedCmd, { cwd: workspaceFolder.uri.fsPath });
                    console.log('Staged changes:', stagedChanges);
                    
                    // Get the current commit message
                    const commitMsg = await execAsync('git log -1 --pretty=%B', { cwd: workspaceFolder.uri.fsPath });
                    const trimmedMsg = commitMsg.trim();
                    
                    // Create updated commit message with version info if not already present
                    let newMessage = trimmedMsg;
                    if (!newMessage.includes(`v${version}`)) {
                        // Split the commit message into lines to modify only the first line
                        const messageLines = newMessage.split('\n');
                        const firstLine = messageLines[0];
                        
                        // Format options for the first line only
                        const firstLineFormats = {
                            'arrow': `${firstLine} → v${version}`,
                            'bump': `${firstLine} ⇧ v${version}`,
                            'simple': `${firstLine} v${version}`,
                            'release': `${firstLine} 📦 v${version}`,
                            'brackets': `${firstLine} (v${version})`
                        };
                        
                        // Apply the selected format to only the first line
                        const format = vscode.workspace.getConfiguration(EXTENSION_NAME).get('versionFormat', 'arrow');
                        messageLines[0] = firstLineFormats[format] || firstLineFormats.simple;
                        
                        // Keep the rest of the commit message unchanged
                        newMessage = messageLines.join('\n');
                    }
                    
                    console.log('Amending commit with message:', newMessage);
                    // Amend the commit with the updated message
                    await execAsync(`git commit --amend -m "${escapeCommitMessage(newMessage)}"`, { 
                        cwd: workspaceFolder.uri.fsPath 
                    });
                    
                    // Reset the cached version to force recalculation
                    this.lastCalculatedVersion = undefined;
                    lastCalculatedVersion = undefined; // Reset global version cache too
                    nextVersion = '';
                    
                    // Only set shouldUpdateVersion to true when we've actually updated the version
                    shouldUpdateVersion = true;
                    
                    console.log('Updated version in package.json to:', version);
                    vscode.window.showInformationMessage(`Version updated from ${packageJson.version} to ${version}`);
                    
                    // Create GitHub release if enabled
                    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                    if (getGitHubReleaseEnabled()) {
                        console.log(`GitHub releases are enabled, creating release for v${version}`);
                        try {
                            // Create the GitHub release with the commit message
                            await createGitHubRelease(version, newMessage);
                        } catch (releaseError: any) {
                            console.error('Failed to create GitHub release:', releaseError);
                            vscode.window.showErrorMessage(`Failed to create GitHub release: ${releaseError.message || releaseError}`);
                        }
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
        } catch (error: any) {
            console.error('Error updating version:', error);
            vscode.window.showErrorMessage(`Failed to update version: ${error.message || error}`);
        } finally {
            isUpdatingVersion = false;
        }
    }

    refresh(): void {
        if (isRefreshing) {
            return; // Prevent recursive refreshes
        }
        
        try {
            isRefreshing = true;
            
            // Force refresh of global enableGitHubRelease variable
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            enableGitHubRelease = getGitHubReleaseEnabled();
            console.log(`Tree refresh: GitHub releases setting refreshed to: ${enableGitHubRelease}`);
            
            // Trigger UI update
            this._onDidChangeTreeData.fire();
            
            // Update UI components after refresh
            updateVersionStatusBar();
            updateTitle();
        } catch (error) {
            console.error('Error refreshing tree view:', error);
        } finally {
            isRefreshing = false;
        }
    }

    async getChildren(): Promise<vscode.TreeItem[]> {
        try {
            // Skip if the extension isn't in a healthy state
            if (!extensionState.isHealthy) {
                return [
                    createErrorTreeItem('Extension is in an error state', 'Try reloading the window')
                ];
            }
            
            // Get workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return [
                    createErrorTreeItem('No workspace open', 'Open a workspace to use this extension')
                ];
            }
            
            // Create header items
            const headerItem = new vscode.TreeItem('Version Control', vscode.TreeItemCollapsibleState.None);
            headerItem.contextValue = 'header';
            
            // Create current version item
            let currentItem: vscode.TreeItem;
            
            try {
                // Always read the current version fresh
                const version = await getCurrentVersion();
                currentItem = new vscode.TreeItem(`Current: v${version}`, vscode.TreeItemCollapsibleState.None);
                this.lastCalculatedVersion = version;
            } catch (error: any) {
                console.error('Error getting current version:', error);
                currentItem = createErrorTreeItem('Failed to get version', error.message);
            }
            
            // Create next version item
            const modeIcons: Record<string, string> = {
                'patch': 'bug',
                'minor': 'package',
                'major': 'versions',
                'none': 'close',
                'custom': 'edit'
            };
            
            const modeDescriptions: Record<string, string> = {
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
    
            // IMPORTANT: ALWAYS get the current configuration directly 
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            
            // Use our helper function to get the current GitHub release setting
            const releaseEnabled = getGitHubReleaseEnabled();
            const releaseOn = config.get<string[]>('releaseOn', ['major', 'minor', 'patch']);
            
            console.log(`getChildren() - GitHub releases currently ${releaseEnabled ? 'enabled' : 'disabled'}`);
            
            // Create GitHub Release item
            const githubItem = new vscode.TreeItem('Create GitHub Release', vscode.TreeItemCollapsibleState.None);
            githubItem.iconPath = new vscode.ThemeIcon('github');
            githubItem.command = {
                command: 'github-versionsync.createOneOffRelease',
                title: 'Create GitHub Release'
            };
    
            // Create Auto-Release Settings item with clear ON/OFF indicator
            const autoReleaseItem = new vscode.TreeItem(
                `Auto-Release: ${releaseEnabled ? 'ON' : 'OFF'}`, 
                vscode.TreeItemCollapsibleState.None
            );
            
            // Check GitHub authentication status
            let token: any;
            try {
                token = await githubApi.getGitHubToken();
            } catch (error) {
                console.error('Failed to get GitHub token during tree view refresh:', error);
                // Continue without the token - we'll handle this in the UI
            }
    
            if (!token) {
                githubItem.description = '⚠️ Sign in Required';
                githubItem.tooltip = 'Click to sign in to GitHub';
                autoReleaseItem.description = '⚠️ Sign in Required';
            } else {
                githubItem.tooltip = 'Create a GitHub release for the current version';
                if (releaseEnabled) {
                    // Green icon when enabled
                    autoReleaseItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
                    autoReleaseItem.description = `Auto: ${releaseOn.join('/')}`;
                    autoReleaseItem.tooltip = `Automatic releases enabled for ${releaseOn.join('/')} versions`;
                } else {
                    // Red icon when disabled
                    autoReleaseItem.iconPath = new vscode.ThemeIcon('x', new vscode.ThemeColor('terminal.ansiRed'));
                    autoReleaseItem.description = 'Auto: Off';
                    autoReleaseItem.tooltip = 'Automatic releases are disabled';
                }
            }
            
            autoReleaseItem.command = {
                command: 'github-versionsync.toggleGitHubRelease',
                title: 'Toggle Automatic GitHub Releases'
            };
    
            // Log what we're actually displaying
            console.log(`Auto-release tree item created with state: ${releaseEnabled ? 'ON' : 'OFF'}`);
    
            return [headerItem, currentItem, nextItem, githubItem, autoReleaseItem];
        } catch (error) {
            console.error('Error in getChildren:', error);
            
            // Provide basic items even in error case to prevent UI from being empty
            const errorItem = new vscode.TreeItem('Error loading version info');
            errorItem.tooltip = 'Click to refresh';
            errorItem.command = {
                command: 'github-versionsync.refreshTreeView',
                title: 'Refresh Tree View'
            };
            
            const selectItem = new vscode.TreeItem('Select version type');
            selectItem.tooltip = 'Choose version increment type';
            selectItem.command = {
                command: 'github-versionsync.selectVersionType',
                title: 'Select Version Type'
            };
            
            return [errorItem, selectItem];
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }
}

async function getGitHubToken(): Promise<string | undefined> {
    return githubApi.getGitHubToken();
}

async function getRepoUrl(): Promise<string> {
    return githubApi.getRepoUrl();
}

// Helper function to get workspace configuration using the githubApi component
function getWorkspaceConfig<T>(section: string, defaultValue: T): T {
    return githubApi.getWorkspaceConfig(section, defaultValue);
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
    console.log(`createGitHubRelease called for version ${version}`);
    
    // ALWAYS check the current setting directly from configuration to ensure accuracy
    const releaseEnabled = getGitHubReleaseEnabled();
    if (!releaseEnabled) {
        console.log('Automatic GitHub releases are disabled, skipping release creation');
        return;
    }
    
    console.log(`Creating GitHub release for version ${version}`);
    
    // Prevent recursive releases
    if (isCreatingRelease) {
        console.log('Release creation already in progress, skipping to prevent recursion');
        return;
    }
    
    isCreatingRelease = true;
    try {
        // Show information message to indicate the release creation has started
        vscode.window.showInformationMessage(`Creating GitHub release for v${version}...`);

        // NOTE: All this commented out code is now handled by the githubApi class
        // The githubApi.createRelease method handles:
        // 1. Running pre-release commands
        // 2. GitHub authentication  
        // 3. Creating the release with proper tag
        // 4. Uploading assets
        
        // Find release assets
        const includePatterns = githubApi.getWorkspaceConfig('includePackageFiles', ['*.vsix']) as string[];
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

        // Call the GitHub API to handle the release creation
        const success = await githubApi.createRelease(version, message, title, assets);
        
        if (success) {
            console.log(`Successfully created GitHub release for v${version}`);
        } else {
            console.error(`Failed to create GitHub release for v${version}`);
            vscode.window.showErrorMessage(`Failed to create GitHub release for v${version}.`);
        }
    } catch (error: any) {
        console.error('Error creating GitHub release:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to create GitHub release: ${errorMessage}`);
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
            console.log('Reading version from VERSION file: ' + versionFilePath);
            return fs.readFileSync(versionFilePath, 'utf-8').trim();
        }

        // Then try package.json
        if (fs.existsSync(packageJsonPath)) {
            console.log('Reading version from package.json: ' + packageJsonPath);
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

    isUpdatingVersion = true;
    console.log(`Starting version update to ${version} (type: ${type})`);
    
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        
        const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            vscode.window.showErrorMessage('No package.json found in workspace root');
            return;
        }
        
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const oldVersion = packageJson.version;
        
        if (oldVersion === version) {
            console.log(`Version is already ${version}, no update needed`);
            return;
        }
        
        // Store stash result to check if we created a stash
        let stashCreated = false;
        
        try {
            // Check if git is available and initialized
            const gitStatusResult = await execAsync('git rev-parse --is-inside-work-tree', { cwd: workspaceFolders[0].uri.fsPath }).catch(() => '');
            
            if (gitStatusResult.trim() === 'true') {
                // We're in a git repo
                
                // Check if there are changes to package.json first
                const gitStatus = await execAsync('git status --porcelain package.json', { cwd: workspaceFolders[0].uri.fsPath });
                
                if (gitStatus.trim() !== '') {
                    // There are changes, stash them first
                    console.log('Found uncommitted changes to package.json, stashing first');
                    
                    try {
                        await execAsync('git stash push -m "Stashed by GitHub-Version-Sync extension" package.json', { cwd: workspaceFolders[0].uri.fsPath });
                        stashCreated = true;
                        console.log('Successfully stashed changes to package.json');
                    } catch (stashError: any) {
                        console.error('Failed to stash changes:', stashError);
                        vscode.window.showErrorMessage(`Failed to stash changes: ${stashError.message}`);
                        // Continue anyway, we'll try to update the version
                    }
                }
                
                // Update version in package.json
                packageJson.version = version;
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                console.log(`Updated package.json with only version change from ${oldVersion} to ${version}`);
                
                // Reset the cached version to force recalculation
                if (extensionState.versionProvider) {
                    extensionState.versionProvider.lastCalculatedVersion = undefined;
                }
                lastCalculatedVersion = undefined; // Reset global version cache too
                nextVersion = '';
                
                // Only set shouldUpdateVersion to true when we've actually updated the version
                shouldUpdateVersion = true;
                
                console.log('Updated version in package.json to:', version);
                vscode.window.showInformationMessage(`Version updated from ${packageJson.version} to ${version}`);
                
                // Create GitHub release if enabled
                const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                if (getGitHubReleaseEnabled()) {
                    console.log(`GitHub releases are enabled, creating release for v${version}`);
                    try {
                        // Create the GitHub release with the commit message
                        await createGitHubRelease(version, '', undefined);
                    } catch (releaseError: any) {
                        console.error('Failed to create GitHub release:', releaseError);
                        vscode.window.showErrorMessage(`Failed to create GitHub release: ${releaseError.message || releaseError}`);
                    }
                }
            } else {
                // Not in a git repo, just update package.json
                packageJson.version = version;
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                console.log(`Updated package.json with only version change to ${version}`);
                
                // Reset the cached version to force recalculation
                if (extensionState.versionProvider) {
                    extensionState.versionProvider.lastCalculatedVersion = undefined;
                }
                lastCalculatedVersion = undefined; // Reset global version cache too
                nextVersion = '';
                
                // Only set shouldUpdateVersion to true when we've actually updated the version
                shouldUpdateVersion = true;
                
                console.log('Updated version in package.json to:', version);
                vscode.window.showInformationMessage(`Version updated from ${packageJson.version} to ${version}`);
            }
        } finally {
            // If we stashed changes, pop them back
            if (stashCreated) {
                try {
                    console.log('Popping stashed changes back');
                    await execAsync('git stash pop', { cwd: workspaceFolders[0].uri.fsPath });
                    console.log('Successfully restored stashed changes');
                } catch (popError: any) {
                    console.error('Failed to pop stashed changes:', popError);
                    vscode.window.showErrorMessage(`Failed to restore your stashed changes: ${popError.message}. You may need to manually run 'git stash pop'.`);
                }
            }
        }
    } catch (error: any) {
        console.error('Error updating version:', error);
        vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
    } finally {
        isUpdatingVersion = false;
    }
}

// Add a helper function to escape backticks in commit messages
function escapeCommitMessage(message: string): string {
    // Replace backticks with escaped backticks for shell execution
    return message.replace(/`/g, '\\`');
}

let debounce = function(func: Function, wait: number) {
    let timeout: NodeJS.Timeout | null = null;
    return function(...args: any[]) {
        clearTimeout(timeout!);
        timeout = setTimeout(() => {
            timeout = null;
            func(...args);
        }, wait);
    };
};

// Helper function to create error tree items
function createErrorTreeItem(label: string, description?: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('error');
    item.contextValue = 'error';
    if (description) {
        item.description = description;
        item.tooltip = description;
    }
    return item;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Activating github-versionsync extension');

    // Initialize extension state with context
    extensionState.initialize(context);

    // Create the version provider and initialize state
    extensionState.versionProvider = new VersionProvider();
    
    // Load configuration once at the top - use direct access for GitHub release setting
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    
    // IMPORTANT: Use the helper function to ensure consistent access to settings
    enableGitHubRelease = getGitHubReleaseEnabled();
    enableAutoTag = config.get('enableAutoTag', true);

    // Initialize version state
    currentVersionMode = 'patch'; // Default to patch
    let currentVersion = extensionState.versionProvider.getCurrentVersion();
    nextVersion = extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
    
    // Create and register the tree view early to ensure UI is populated quickly
    extensionState.treeView = vscode.window.createTreeView('scm-version-selector', {
        treeDataProvider: extensionState.versionProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(extensionState.treeView);

    // Create status bar item early
    extensionState.versionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    extensionState.versionStatusBarItem.command = 'github-versionsync.selectVersionType';
    context.subscriptions.push(extensionState.versionStatusBarItem);
    
    // Initial UI updates
    updateVersionStatusBar();
    updateTitle();
    
    // Multi-stage refresh to ensure proper initialization even after extension host reload
    // First refresh immediately
    extensionState.versionProvider.refresh();
    
    // Second refresh after a short delay
    setTimeout(() => {
        console.log('First delayed refresh (100ms)');
        if (extensionState.versionProvider) {
            extensionState.versionProvider.refresh();
        }
    }, 100);
    
    // Third refresh after a longer delay to ensure everything is loaded
    setTimeout(() => {
        console.log('Second delayed refresh (500ms)');
        if (extensionState.versionProvider) {
            extensionState.versionProvider.refresh();
            updateVersionStatusBar();
            updateTitle();
        }
    }, 500);

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
                        console.log(`Updating version from ${oldVersion} to ${nextVer}`);
                        
                        // Update version in package.json
                        packageJson.version = nextVer;
                        const updatedContent = JSON.stringify(packageJson, null, 2);
                        fs.writeFileSync(packageJsonPath, updatedContent);
                        console.log(`Updated package.json file with version ${nextVer}`);

                        try {
                            // Get the git root directory
                            const gitRoot = await execAsync('git rev-parse --show-toplevel', { cwd: workspaceFolder.uri.fsPath });
                            const relativePath = path.relative(gitRoot.trim(), packageJsonPath);
                            
                            console.log('Updating version in git repo:', gitRoot.trim());
                            console.log('Relative path to package.json:', relativePath);
                            
                            // First check if there are any other changes to package.json
                            // If so, we need to stash them first so we only commit version changes
                            const hasChanges = await execAsync(`git diff --quiet -- "${relativePath}" || echo "changes"`, { 
                                cwd: workspaceFolder.uri.fsPath 
                            });
                            
                            let needsStash = hasChanges.trim() === "changes";
                            let stashCreated = false;
                            
                            if (needsStash) {
                                console.log('Detected other changes to package.json, stashing before version update');
                                // Stash only the package.json changes
                                await execAsync(`git stash push -m "temp stash for version change" -- "${relativePath}"`, { 
                                    cwd: workspaceFolder.uri.fsPath 
                                });
                                stashCreated = true;
                                console.log('Stashed other changes to package.json');
                            }
                            
                            try {
                                // Now read the current package.json without other pending changes
                                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                                
                                // Update only the version
                                packageJson.version = nextVer;
                                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
                                console.log(`Updated package.json with only version change to ${nextVer}`);
                                
                                // Stage only the package.json file
                                await execAsync(`git add "${relativePath}"`, { cwd: workspaceFolder.uri.fsPath });
                                console.log(`Staged ${relativePath} with version change only`);
                                
                                // Show what's staged
                                const diffCachedCmd = 'git diff --cached';
                                const stagedChanges = await execAsync(diffCachedCmd, { cwd: workspaceFolder.uri.fsPath });
                                console.log('Staged changes:', stagedChanges);
                                
                                // Get the current commit message
                                const commitMsg = await execAsync('git log -1 --pretty=%B', { cwd: workspaceFolder.uri.fsPath });
                                const trimmedMsg = commitMsg.trim();
                                
                                // Create updated commit message with version info if not already present
                                let newMessage = trimmedMsg;
                                if (!newMessage.includes(`v${nextVer}`)) {
                                    // Split the commit message into lines to modify only the first line
                                    const messageLines = newMessage.split('\n');
                                    const firstLine = messageLines[0];
                                    
                                    // Format options for the first line only
                                    const firstLineFormats = {
                                        'arrow': `${firstLine} → v${nextVer}`,
                                        'bump': `${firstLine} ⇧ v${nextVer}`,
                                        'simple': `${firstLine} v${nextVer}`,
                                        'release': `${firstLine} 📦 v${nextVer}`,
                                        'brackets': `${firstLine} (v${nextVer})`
                                    };
                                    
                                    // Apply the selected format to only the first line
                                    const format = vscode.workspace.getConfiguration(EXTENSION_NAME).get('versionFormat', 'arrow');
                                    messageLines[0] = firstLineFormats[format] || firstLineFormats.simple;
                                    
                                    // Keep the rest of the commit message unchanged
                                    newMessage = messageLines.join('\n');
                                }
                                
                                console.log('Amending commit with message:', newMessage);
                                // Amend the commit with the updated message
                                await execAsync(`git commit --amend -m "${escapeCommitMessage(newMessage)}"`, { 
                                    cwd: workspaceFolder.uri.fsPath 
                                });
                                
                                // Reset the cached version to force recalculation
                                extensionState.versionProvider.lastCalculatedVersion = undefined;
                                lastCalculatedVersion = undefined; // Reset global version cache too
                                nextVersion = '';
                                
                                // Only set shouldUpdateVersion to true when we've actually updated the version
                                shouldUpdateVersion = true;
                                
                                console.log('Updated version in package.json to:', nextVer);
                                vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${nextVer}`);
                                
                                // Create GitHub release if enabled
                                if (getGitHubReleaseEnabled()) {
                                    console.log(`GitHub releases are enabled, creating release for v${nextVer}`);
                                    try {
                                        // Create the GitHub release with the commit message
                                        await createGitHubRelease(nextVer, '', undefined);
                                        // newMessage is undefined
                                    } catch (releaseError: any) {
                                        console.error('Failed to create GitHub release:', releaseError);
                                        vscode.window.showErrorMessage(`Failed to create GitHub release: ${releaseError.message || releaseError}`);
                                    }
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
                        
                        // Force a refresh of the UI after version update
                        setTimeout(() => {
                            extensionState.versionProvider.refresh();
                            
                            // Update UI components after refresh
                            setTimeout(() => {
                                updateVersionStatusBar();
                            }, 100);
                        }, 200);
                    } else {
                        console.log(`Version is already ${nextVer}, no update needed`);
                    }
                } catch (error: any) {
                    console.error('Error updating version:', error);
                    vscode.window.showErrorMessage(`Failed to update version: ${error.message || error}`);
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
            
            try {
                // Get the current value from all configuration scopes
                const currentValue = getGitHubReleaseEnabled();
                console.log(`Current GitHub release setting using getGitHubReleaseEnabled(): ${currentValue}`);
                
                // Toggle to the opposite value
                const newValue = !currentValue;
                console.log(`Toggling GitHub release setting from ${currentValue} to ${newValue}`);
                
                // Show a quick notification during update
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `${newValue ? 'Enabling' : 'Disabling'} automatic GitHub releases...`,
                    cancellable: false
                }, async (progress) => {
                    try {
                        // Update the setting at all configuration levels
                        await setGitHubReleaseEnabled(newValue);
                        
                        // Update global variable
                        enableGitHubRelease = newValue;
                        
                        console.log(`GitHub release setting toggled to: ${newValue}`);
                        
                        // Show a confirmation message
                        vscode.window.showInformationMessage(
                            `Automatic GitHub releases ${newValue ? 'ENABLED' : 'DISABLED'}`,
                            ...(newValue ? ['Configure Versions'] : [])
                        ).then(selection => {
                            if (selection === 'Configure Versions') {
                                vscode.commands.executeCommand('workbench.action.openSettings', 'github-versionsync.releaseOn');
                            }
                        });
                        
                        // Force immediate refresh of the UI after config change
                        if (extensionState.versionProvider) {
                            console.log('Performing immediate tree view refresh after toggle');
                            extensionState.versionProvider.refresh();
                        }
                    } catch (error) {
                        console.error('Error toggling GitHub release setting:', error);
                        vscode.window.showErrorMessage(`Failed to toggle GitHub release setting: ${error}`);
                    }
                    
                    return Promise.resolve();
                });
            } catch (error) {
                console.error('Error in toggleGitHubRelease command:', error);
                vscode.window.showErrorMessage(`Failed to toggle GitHub release setting: ${error}`);
            }
        })
    );

    // Create one-off GitHub release command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.createOneOffRelease', async () => {
            console.log('Create one-off release command triggered');
            try {
                // Try to get GitHub token first
                const token = await githubApi.getGitHubToken();
                if (!token) {
                    const action = await vscode.window.showInformationMessage(
                        'GitHub authentication required for creating releases.',
                        'Sign in to GitHub');
                    
                    if (action === 'Sign in to GitHub') {
                        // Try to authenticate with GitHub
                        await vscode.commands.executeCommand('github-versionsync.githubAuth');
                        // Check if we now have a token
                        const newToken = await githubApi.getGitHubToken();
                        if (!newToken) {
                            vscode.window.showErrorMessage('GitHub authentication failed.');
                            return;
                        }
                    } else {
                        return;
                    }
                }
            
                // Get current version
                const currentVersion = getCurrentVersion();
                if (!currentVersion) {
                    vscode.window.showErrorMessage('Could not determine current version.');
                    return;
                }
                
                // Create a release webview
                const releaseProvider = new ReleaseWebviewProvider(context);
                releaseProvider.show();
            } catch (error: any) {
                console.error('Error creating one-off release:', error);
                vscode.window.showErrorMessage(`Failed to create release: ${error.message}`);
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
                
                // Check if GitHub release setting was changed
                if (e.affectsConfiguration(`${EXTENSION_NAME}.${GITHUB_RELEASE_KEY}`)) {
                    const newValue = config.get(GITHUB_RELEASE_KEY, false);
                    console.log(`${GITHUB_RELEASE_KEY} changed in settings to: ${newValue}`);
                    
                    // Update the global variable to match
                    enableGitHubRelease = newValue;
                    console.log(`Updated global enableGitHubRelease to: ${enableGitHubRelease}`);
                }
                
                // Update other settings
                enableAutoTag = config.get('enableAutoTag', true);
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
                
                // Always refresh tree view to ensure UI stays in sync with settings
                if (extensionState.versionProvider) {
                    console.log('Refreshing tree view due to configuration change');
                    extensionState.versionProvider.refresh();
                }
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

    // Add explicit refresh command
    const refreshCommand = vscode.commands.registerCommand('github-versionsync.refreshTreeView', () => {
        console.log('Manual refresh requested');
        if (extensionState.versionProvider) {
            extensionState.versionProvider.refresh();
            // Also update the current version and next version
            currentVersion = extensionState.versionProvider.getCurrentVersion();
            nextVersion = extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
            // Update UI components
            updateVersionStatusBar();
            updateTitle();
            vscode.window.showInformationMessage('Version tree view refreshed');
        }
    });
    context.subscriptions.push(refreshCommand);

    // Register GitHub authentication command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.githubAuth', async () => {
            console.log('GitHub authentication command triggered');
            
            try {
                // First check if we already have a valid token
                const token = await githubApi.getGitHubToken();
                
                if (token) {
                    vscode.window.showInformationMessage('Already authenticated with GitHub!');
                    return;
                }
                
                // No token, try to get one with UI
                const session = await vscode.authentication.getSession('github', ['repo'], { 
                    createIfNone: true
                });
                
                if (session) {
                    vscode.window.showInformationMessage('Successfully authenticated with GitHub!');
                    
                    // Refresh the UI
                    if (extensionState.versionProvider) {
                        extensionState.versionProvider.refresh();
                    }
                } else {
                    vscode.window.showErrorMessage('Failed to authenticate with GitHub.');
                }
            } catch (error: any) {
                console.error('GitHub authentication error:', error);
                vscode.window.showErrorMessage(`GitHub authentication failed: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.commit', async (uri: vscode.Uri) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            try {
                // Check for staged version changes first
                const stagedChanges = await checkStagedVersionChanges();
                console.log('Checked for staged version changes:', JSON.stringify(stagedChanges));
                
                // If there are already staged version changes, we should respect them
                if (stagedChanges.hasVersionChanges && stagedChanges.stagedVersion) {
                    const proceed = await vscode.window.showInformationMessage(
                        `Detected version change already staged: ${stagedChanges.stagedVersion}. Proceed with this version?`,
                        { modal: true },
                        'Yes', 'No (Use Extension Version)'
                    );
                    
                    if (proceed === 'Yes') {
                        console.log(`Using staged version: ${stagedChanges.stagedVersion}`);
                        nextVersion = stagedChanges.stagedVersion;
                        // Update the mode to match what's staged
                        if (stagedChanges.currentVersion) {
                            // Determine what kind of version bump this was
                            const versionParts = stagedChanges.currentVersion.split('.');
                            const stagedParts = stagedChanges.stagedVersion.split('.');
                            
                            if (versionParts.length >= 3 && stagedParts.length >= 3) {
                                if (versionParts[0] !== stagedParts[0]) {
                                    currentVersionMode = 'major';
                                } else if (versionParts[1] !== stagedParts[1]) {
                                    currentVersionMode = 'minor';
                                } else if (versionParts[2] !== stagedParts[2]) {
                                    currentVersionMode = 'patch';
                                } else {
                                    currentVersionMode = 'custom';
                                }
                            }
                        }
                    } else {
                        // User chose to use the extension's version instead
                        // Always re-read current version from disk (not cache) to prevent stale data
                        const currentVersion = getCurrentVersion();
                        console.log(`Using extension's version logic. Current version on disk: ${currentVersion}`);
                        if (currentVersion) {
                            nextVersion = extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
                        }
                    }
                } else {
                    // No staged version changes - ensure we're using the actual current version
                    // Always re-read current version from disk (not cache) to prevent stale data after git operations
                    const currentVersion = getCurrentVersion();
                    console.log(`No staged version changes. Current version on disk: ${currentVersion}`);
                    if (currentVersion) {
                        nextVersion = extensionState.versionProvider.bumpVersion(currentVersion, currentVersionMode);
                    }
                }
                
                console.log(`Version for commit: ${nextVersion} (${currentVersionMode} mode)`);
                
                // Continue with the normal commit flow
                const selectedFiles = uri ? [uri] : undefined;
                const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
                
                if (!gitExtension) {
                    vscode.window.showErrorMessage('Git extension not found');
                    return;
                }
                
                const gitApi = gitExtension.getAPI(1);
                
                if (!gitApi) {
                    vscode.window.showErrorMessage('Git API not available');
                    return;
                }
                
                // Get workspace folder
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('No workspace is open');
                    return;
                }
                
                // Find repository for current workspace
                const repository = gitApi.repositories.find((repo: any) => 
                    repo.rootUri.fsPath === workspaceFolders[0].uri.fsPath
                );
                
                if (!repository) {
                    vscode.window.showErrorMessage('No Git repository found in the current workspace');
                    return;
                }
                
                // Execute the git.commit command with the selected files
                vscode.commands.executeCommand('git.commit', repository, { all: !selectedFiles, files: selectedFiles });
            } catch (error: any) {
                console.error('Error in commit command:', error);
                vscode.window.showErrorMessage(`Error in commit command: ${error.message}`);
            }
        })
    );

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

    /**
     * Checks for staged version changes in the git repository
     * @returns Object containing info about staged changes
     */
    async function checkStagedVersionChanges(): Promise<{
        hasVersionChanges: boolean;
        stagedVersion?: string;
        currentVersion?: string;
    }> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return { hasVersionChanges: false };
            }
            
            const cwd = workspaceFolders[0].uri.fsPath;
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const useVersionFile = !!config.get('versionFile', '');
            
            // Command to check if there are staged version changes
            let command;
            if (useVersionFile) {
                const versionFile = config.get('versionFile', '');
                command = `git diff --cached -- "${versionFile}"`;
            } else {
                command = `git diff --cached -- package.json`;
            }
            
            // Run git command to get staged changes
            const diffOutput = await execAsync(command, { cwd });
            
            if (!diffOutput) {
                return { hasVersionChanges: false };
            }
            
            // Check if the diff contains version changes
            const versionRegex = useVersionFile 
                ? /^[-+](.*?)$/gm                    // For VERSION file: entire content
                : /["-+]\s*"version"\s*:\s*"([^"]+)"/ // For package.json: version field
            
            let hasChanges = false;
            let stagedVersion;
            
            // Extract staged version from diff
            const lines = diffOutput.split('\n');
            for (const line of lines) {
                if (line.startsWith('+') && line.includes('version')) {
                    const match = line.match(versionRegex);
                    if (match && match[1]) {
                        hasChanges = true;
                        stagedVersion = useVersionFile ? match[1].trim() : match[1];
                        break;
                    }
                }
            }
            
            // Get the current version from the actual file (not cache)
            const currentVersion = getCurrentVersion();
            
            return {
                hasVersionChanges: hasChanges,
                stagedVersion,
                currentVersion
            };
        } catch (error) {
            console.error('Error checking staged version changes:', error);
            return { hasVersionChanges: false };
        }
    }

    // Setup Git repository watcher to detect changes like resets, pulls, checkouts, etc.
    function setupGitRepositoryWatcher() {
        try {
            const repos = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1).repositories;
            
            if (repos && repos.length > 0) {
                for (const repo of repos) {
                    // Debounce the handler to avoid multiple rapid refreshes
                    const debouncedHandler = debounce(async () => {
                        // Only clear caches if package.json has changed
                        const packageJsonPath = path.join(repo.rootUri.fsPath, 'package.json');
                        
                        try {
                            // Get the current version from file system directly
                            const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
                            const packageJson = JSON.parse(packageJsonContent);
                            const fileVersion = packageJson.version;
                            
                            // Compare with our cached version
                            if (lastCalculatedVersion !== fileVersion) {
                                console.log('package.json version changed, refreshing cache');
                                lastCalculatedVersion = undefined;
                                nextVersion = '';
                                
                                if (extensionState.versionProvider) {
                                    extensionState.versionProvider.lastCalculatedVersion = undefined;
                                    extensionState.versionProvider.refresh();
                                }
                                
                                updateTitle();
                                updateVersionStatusBar();
                            }
                        } catch (err) {
                            // If we can't read package.json, play it safe and refresh
                            console.log('Error checking package.json, refreshing cache as precaution');
                            lastCalculatedVersion = undefined;
                        }
                    }, 500); // 500ms debounce
                    
                    repo.state.onDidChange(debouncedHandler);
                }
            }
        } catch (error) {
            console.error('Failed to setup Git repository watcher:', error);
        }
    }
    
    // Run this after a short delay to ensure Git extension is fully loaded
    setTimeout(setupGitRepositoryWatcher, 2000);
}

export function deactivate() {}
