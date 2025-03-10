import * as cp from 'child_process';
import * as fs from 'fs';
import { Octokit } from 'octokit';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_NAME = 'github-versionsync';
const PACKAGE_JSON = 'package.json';
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
let versionStatusBarItem: vscode.StatusBarItem;

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

            // Read the current package.json
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            // Only update if the version is actually different
            if (packageJson.version !== version) {
                // Store old version for comparison
                const oldVersion = packageJson.version;
                
                // Update version in package.json first
                packageJson.version = version;
                const updatedContent = JSON.stringify(packageJson, null, 2);
                fs.writeFileSync(packageJsonPath, updatedContent);
                
                // Reset the cached version to force recalculation
                this.lastCalculatedVersion = undefined;
                lastCalculatedVersion = undefined; // Reset global version cache too
                nextVersion = '';
                
                console.log(`Updated package.json version from ${oldVersion} to ${version}`);
                
                // Only set shouldUpdateVersion to true when we've actually updated the version
                shouldUpdateVersion = true;
                
                // Force a refresh of the UI after version update
                setTimeout(() => this.refresh(), 100);
            } else {
                console.log(`Version ${version} already set in package.json, no update needed`);
            }
        } catch (error: any) {
            console.error('Error updating version:', error);
            vscode.window.showErrorMessage(`Failed to update version: ${error.message || 'Unknown error'}`);
            throw error;
        } finally {
            isUpdatingVersion = false;
        }
    }

    refresh(): void {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
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
        // Try to get the session
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        return session?.accessToken;
    } catch (error: any) {
        console.error('GitHub Authentication Error:', error);
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

async function createGitHubRelease(version: string, message: string = '', title?: string) {
    // Prevent recursive releases
    if (isCreatingRelease) {
        console.log('Release creation already in progress, skipping to prevent recursion');
        return;
    }
    
    isCreatingRelease = true;
    try {
        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const prefix = config.get('releasePrefix', 'v');
        
        // Run pre-release commands
        const preReleaseCommands = config.get('preReleaseCommands', []) as string[];
        if (preReleaseCommands.length > 0) {
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (!workspaceRoot) {
                    throw new Error('No workspace folder found');
                }

                for (const cmd of preReleaseCommands) {
                    await new Promise<void>((resolve, reject) => {
                        cp.exec(cmd, { cwd: workspaceRoot }, (error, stdout, stderr) => {
                            if (error) {
                                reject(new Error(`Command failed: ${cmd}\n${stderr}`));
                                return;
                            }
                            console.log(`Command output: ${stdout}`);
                            resolve();
                        });
                    });
                }
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
        const includePatterns = config.get('includePackageFiles', ['*.vsix']) as string[];
        const assets: string[] = [];
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        
        if (workspaceRoot) {
            for (const pattern of includePatterns) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceRoot, pattern)
                );
                assets.push(...files.map(f => f.fsPath));
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

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    async show() {
        if (this._view) {
            this._view.reveal(vscode.ViewColumn.One);
            return;
        }

        const currentVersion = getCurrentVersion();
        if (!currentVersion) {
            vscode.window.showErrorMessage('Could not determine current version');
            return;
        }

        this._view = vscode.window.createWebviewPanel(
            ReleaseWebviewProvider.viewType,
            'Create GitHub Release',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Get commit history
        const commitHistory = await this.getCommitHistory();
        
        this._view.webview.html = this.getWebviewContent(currentVersion, commitHistory);

        this._view.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'createRelease':
                        try {
                            await vscode.window.withProgress({
                                location: vscode.ProgressLocation.Notification,
                                title: "Creating GitHub Release",
                                cancellable: false
                            }, async () => {
                                await createGitHubRelease(currentVersion, message.notes, message.title);
                            });
                            this._view?.dispose();
                        } catch (error: any) {
                            vscode.window.showErrorMessage(`Failed to create release: ${error}`);
                        }
                        break;
                    case 'cancel':
                        this._view?.dispose();
                        break;
                }
            },
            undefined,
            []
        );

        this._view.onDidDispose(() => {
            this._view = undefined;
        });
    }

    private getWebviewContent(version: string, commitHistory: string): string {
        const defaultTitle = `Release ${version}`;
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Create GitHub Release</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    color: var(--vscode-input-foreground);
                }
                input, textarea {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                }
                textarea {
                    min-height: 400px;
                    font-family: var(--vscode-editor-font-family);
                    line-height: 1.5;
                    tab-size: 2;
                }
                .button-container {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                button {
                    padding: 8px 16px;
                    border: none;
                    color: var(--vscode-button-foreground);
                    background-color: var(--vscode-button-background);
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                button.secondary {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                button.secondary:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                .toolbar {
                    margin-bottom: 10px;
                    display: flex;
                    gap: 10px;
                }
                .toolbar button {
                    font-size: 12px;
                    padding: 4px 8px;
                }
            </style>
        </head>
        <body>
            <form id="releaseForm">
                <div class="form-group">
                    <label for="title">Release Title</label>
                    <input type="text" id="title" value="${defaultTitle}" required>
                </div>
                <div class="form-group">
                    <label for="notes">Release Notes</label>
                    <div class="toolbar">
                        <button type="button" id="resetNotes" class="secondary">Reset to Commit History</button>
                        <button type="button" id="clearNotes" class="secondary">Clear</button>
                    </div>
                    <textarea id="notes" placeholder="Enter release notes...">${commitHistory}</textarea>
                </div>
                <div class="button-container">
                    <button type="button" class="secondary" id="cancel">Cancel</button>
                    <button type="submit">Create Release</button>
                </div>
            </form>
            <script>
                const vscode = acquireVsCodeApi();
                const commitHistory = ${JSON.stringify(commitHistory)};
                
                document.getElementById('releaseForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    vscode.postMessage({
                        command: 'createRelease',
                        title: document.getElementById('title').value,
                        notes: document.getElementById('notes').value
                    });
                });

                document.getElementById('cancel').addEventListener('click', () => {
                    vscode.postMessage({ command: 'cancel' });
                });

                document.getElementById('resetNotes').addEventListener('click', () => {
                    document.getElementById('notes').value = commitHistory;
                });

                document.getElementById('clearNotes').addEventListener('click', () => {
                    document.getElementById('notes').value = '';
                });
            </script>
        </body>
        </html>`;
    }

    private async getCommitHistory(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return '';
        }

        try {
            // Try to get the last tag
            let lastTag = '';
            try {
                lastTag = await execAsync('git describe --tags --abbrev=0', { 
                    cwd: workspaceFolders[0].uri.fsPath 
                }) as string;
            } catch {
                // No tags exist, will get all commits
            }

            // Get commit history with more details
            const gitLogCommand = lastTag
                ? `git log ${lastTag.trim()}..HEAD --pretty=format:"### %s%n%n**Author:** %an%n**Date:** %ci%n**Commit:** %H%n%n%b%n"`
                : 'git log --pretty=format:"### %s%n%n**Author:** %an%n**Date:** %ci%n**Commit:** %H%n%n%b%n"';

            const commitLog = await execAsync(gitLogCommand, { 
                cwd: workspaceFolders[0].uri.fsPath 
            }) as string;

            if (!commitLog) {
                return '### No new commits since last release.';
            }

            return `# Changelog\n\n${commitLog.trim()}`;
        } catch (error: any) {
            console.error('Error getting commit history:', error);
            return '### Failed to get commit history';
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

        const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, PACKAGE_JSON);
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
            
            // Update version in package.json
            packageJson.version = version;
            const updatedContent = JSON.stringify(packageJson, null, 2);
            fs.writeFileSync(packageJsonPath, updatedContent);
            console.log(`Updated package.json file with version ${version}`);

            try {
                // Get the git root directory
                const gitRoot = await execAsync('git rev-parse --show-toplevel', { cwd: workspaceFolders[0].uri.fsPath });
                const relativePath = path.relative(gitRoot.trim(), packageJsonPath);
                
                // Create a patch file for just the version change
                const patchFile = path.join(workspaceFolders[0].uri.fsPath, '.version-patch');
                
                // Get the line number for the version in package.json
                const originalLines = fs.readFileSync(packageJsonPath, 'utf-8').split('\n');
                const updatedLines = updatedContent.split('\n');
                let versionLineNumber = -1;
                
                for (let i = 0; i < originalLines.length; i++) {
                    if (originalLines[i].includes('"version"')) {
                        versionLineNumber = i + 1; // 1-based line numbers in patches
                        break;
                    }
                }
                
                if (versionLineNumber === -1) {
                    throw new Error('Could not find version line in package.json');
                }
                
                // Get the exact version lines from both files
                const oldVersionLine = originalLines[versionLineNumber - 1];
                const newVersionLine = updatedLines[versionLineNumber - 1];
                
                // Create a proper git patch with just the version line change
                const patch = `diff --git a/${relativePath} b/${relativePath}
index 0000000..0000000 100644
--- a/${relativePath}
+++ b/${relativePath}
@@ -${versionLineNumber},1 +${versionLineNumber},1 @@
-  "version": "${oldVersion}",
+  "version": "${version}"`;
                
                fs.writeFileSync(patchFile, patch);
                console.log('Patch file created:', patchFile);
                console.log('Patch content:', patch);
                
                try {
                    // Apply the patch to stage only the version change
                    await execAsync(`git apply --cached ${patchFile}`, { cwd: workspaceFolders[0].uri.fsPath });
                    console.log('Applied patch to stage only version change');
                    
                    // Amend the commit with the new message
                    await execAsync(`git commit --amend -m "${version}"`, { cwd: workspaceFolders[0].uri.fsPath });
                    
                    console.log('Updated version in package.json to:', version);
                    vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${version}`);
                } catch (error: any) {
                    console.error('Error applying patch:', error);
                    
                    // Fallback to staging the entire file
                    console.log('Falling back to staging entire file');
                    await execAsync('git add package.json', { cwd: workspaceFolders[0].uri.fsPath });
                    
                    // Amend the commit with the new message
                    await execAsync(`git commit --amend -m "${version}"`, { cwd: workspaceFolders[0].uri.fsPath });
                    
                    console.log('Updated version in package.json to:', version);
                    vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${version}`);
                } finally {
                    // Clean up the patch file
                    if (fs.existsSync(patchFile)) {
                        fs.unlinkSync(patchFile);
                        console.log('Cleaned up patch file');
                    }
                }
            } catch (error: any) {
                console.error('Error updating version:', error);
                vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
            }
        } else {
            console.log(`Version already at ${version}, no update needed`);
        }
        
        // Reset version state after update
        lastCalculatedVersion = undefined;
        nextVersion = '';
        
        // Force a refresh of the version provider
        const versionProvider = new VersionProvider();
        versionProvider.refresh();
    } catch (error: any) {
        console.error('Error updating version after commit:', error);
        vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
    } finally {
        isUpdatingVersion = false;
    }
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

    // Create the version provider and initialize state
    const versionProvider = new VersionProvider();
    console.log('Version provider created');

    // Load configuration once at the top
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    enableAutoTag = config.get('enableAutoTag', true);
    enableGitHubRelease = config.get('enableGitHubRelease', false);
    console.log('Configuration loaded:', { enableAutoTag, enableGitHubRelease });

    // Initialize version state
    currentVersionMode = 'patch'; // Default to patch
    let currentVersion = versionProvider.getCurrentVersion();
    nextVersion = versionProvider.bumpVersion(currentVersion, currentVersionMode);
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
            versionProvider.setCurrentRepo(currentRepo);

            // Watch for repository state changes with debouncing
            const debouncedStateChange = debounce(() => {
                const message = currentRepo.inputBox.value;
                if (message === lastProcessedMessage) {
                    return; // Skip if we've already processed this message
                }
                lastProcessedMessage = message;
                
                currentVersion = versionProvider.getCurrentVersion();
                console.log('Repository state changed, message:', message);
                console.log('Current version state:', {
                    currentVersion,
                    nextVersion,
                    currentVersionMode
                });
                
                // Only update input box if the message doesn't already contain a version
                if (!message.match(/v\d+\.\d+\.\d+/)) {
                    versionProvider.updateInputBox();
                }
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
                        const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
                        currentRepo.inputBox.value = `${message.trim()} v${nextVer}`;
                    }
                }
            });
            context.subscriptions.push(disposable);

            // Listen for commit events
            currentRepo.onDidCommit(async () => {
                try {
                    isCommitting = true;
                    const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
                    
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
                            
                            // Create a patch file for just the version change
                            const patchFile = path.join(workspaceFolders[0].uri.fsPath, '.version-patch');
                            
                            // Get the line number for the version in package.json
                            const originalLines = originalContent.split('\n');
                            const updatedLines = updatedContent.split('\n');
                            let versionLineNumber = -1;
                            
                            for (let i = 0; i < originalLines.length; i++) {
                                if (originalLines[i].includes('"version"')) {
                                    versionLineNumber = i + 1; // 1-based line numbers in patches
                                    break;
                                }
                            }
                            
                            if (versionLineNumber === -1) {
                                throw new Error('Could not find version line in package.json');
                            }
                            
                            // Get the exact version lines from both files
                            const oldVersionLine = originalLines[versionLineNumber - 1];
                            const newVersionLine = updatedLines[versionLineNumber - 1];
                            
                            // Create a proper git patch with just the version line change
                            const patch = `diff --git a/${relativePath} b/${relativePath}
index 0000000..0000000 100644
--- a/${relativePath}
+++ b/${relativePath}
@@ -${versionLineNumber},1 +${versionLineNumber},1 @@
-  "version": "${oldVersion}",
+  "version": "${nextVer}"`;
                            
                            fs.writeFileSync(patchFile, patch);
                            console.log('Patch file created:', patchFile);
                            console.log('Patch content:', patch);
                            
                            try {
                                // Apply the patch to stage only the version change
                                await execAsync(`git apply --cached ${patchFile}`, { cwd: workspaceFolders[0].uri.fsPath });
                                console.log('Applied patch to stage only version change');
                                
                                // Amend the commit with the new message
                                await execAsync(`git commit --amend -m "${newMessage}"`, { cwd: workspaceFolders[0].uri.fsPath });
                                
                                console.log('Updated version in package.json to:', nextVer);
                                vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${nextVer}`);
                            } catch (error: any) {
                                console.error('Error applying patch:', error);
                                
                                // Fallback to staging the entire file
                                console.log('Falling back to staging entire file');
                                await execAsync('git add package.json', { cwd: workspaceFolders[0].uri.fsPath });
                                
                                // Amend the commit with the new message
                                await execAsync(`git commit --amend -m "${newMessage}"`, { cwd: workspaceFolders[0].uri.fsPath });
                                
                                console.log('Updated version in package.json to:', nextVer);
                                vscode.window.showInformationMessage(`Version updated from v${oldVersion} to v${nextVer}`);
                            } finally {
                                // Clean up the patch file
                                if (fs.existsSync(patchFile)) {
                                    fs.unlinkSync(patchFile);
                                    console.log('Cleaned up patch file');
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
                    // We don't want to set shouldUpdateVersion to true here unconditionally
                    // as it might lead to unexpected behavior
                }
            });

            // Initial update
            versionProvider.updateInputBox();
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
        console.log('Current version:', versionProvider.getCurrentVersion());
        console.log('Next version:', nextVersion);
        console.log('Enable auto tag:', enableAutoTag);
        console.log('Enable GitHub release:', enableGitHubRelease);
        
        console.log('Refreshing version provider');
        versionProvider.refresh();
        vscode.window.showInformationMessage('Test command executed successfully!');
    });
    context.subscriptions.push(testCommand);

    // Get formatted version type for display
    const getVersionTypeDisplay = (type: VersionType): string => {
        if (type === 'none') return 'No Change';
        return type === 'custom' ? 'Custom' : type.charAt(0).toUpperCase() + type.slice(1);
    };

    // Update title when versions change
    const updateTitle = () => {
        const currentVersion = versionProvider.getCurrentVersion();
        nextVersion = customVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
        lastCalculatedVersion = nextVersion;
        
        // Keep the main title simple
        treeView.title = 'Version Control';
        
        // Show version details in the description
        treeView.description = currentVersionMode === 'none' ? 
            `${currentVersion} [No Change]` :
            `${currentVersion} → ${nextVersion} [${getVersionTypeDisplay(currentVersionMode)}]`;
        versionProvider.updateInputBox();
    };

    // Create and register the tree view
    const treeView = vscode.window.createTreeView('scm-version-selector', {
        treeDataProvider: versionProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);

    // Initial title update without triggering version change
    // const currentVersion = versionProvider.getCurrentVersion();
    nextVersion = customVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
    lastCalculatedVersion = nextVersion;
    updateTitle();

    // Create status bar item
    const versionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    versionStatusBarItem.command = 'github-versionsync.selectVersionType';
    context.subscriptions.push(versionStatusBarItem);

    // Update status bar with current version mode
    function updateVersionStatusBar() {
        const modeEmojis: Record<string, string> = {
            'patch': '🐛',
            'minor': '✨',
            'major': '💥',
            'none': '⛔',
            'custom': '✏️'
        };
        
        versionStatusBarItem.text = `$(versions) ${modeEmojis[currentVersionMode]} ${currentVersionMode}`;
        versionStatusBarItem.tooltip = `Version Mode: ${currentVersionMode}\nClick to change`;
        versionStatusBarItem.show();
    }

    // Initial status bar update
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
                    const currentVersion = versionProvider.getCurrentVersion();
                    nextVersion = type === 'none' ? currentVersion : versionProvider.bumpVersion(currentVersion, type);
                }
                
                console.log('Updating version status bar');
                updateVersionStatusBar();
                console.log('Updating title');
                updateTitle();
                console.log('Refreshing version provider');
                versionProvider.refresh();
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
            versionProvider.refresh();
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
    const releaseWebviewProvider = new ReleaseWebviewProvider(context.extensionUri);

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
