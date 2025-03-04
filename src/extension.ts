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
        const currentVersion = getCurrentVersion();
        
        // Only calculate next version if it hasn't been calculated or if version type changed
        if (!lastCalculatedVersion || nextVersion === '') {
            nextVersion = this.bumpVersion(currentVersion, currentVersionMode);
            lastCalculatedVersion = nextVersion;
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
            command: 'extension.selectVersionType',
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
            command: 'extension.createOneOffRelease',
            title: 'Create GitHub Release'
        };

        // Create Auto-Release Settings item
        const autoReleaseItem = new vscode.TreeItem('Auto-Release Settings', vscode.TreeItemCollapsibleState.None);
        autoReleaseItem.command = {
            command: 'extension.toggleGitHubRelease',
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

    getCurrentVersion(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return '0.0.1';
        }

        const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
        
        try {
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                return packageJson.version || '0.0.1';
            }
        } catch (error) {
            console.error('Error reading package.json:', error);
        }
        
        return '0.0.1';
    }

    bumpVersion(version: string, type: VersionType): string {
        if (type === 'none') {
            return version;
        }

        const [major, minor, patch] = version.split('.').map(Number);
        
        switch (type) {
            case 'major':
                return `${major + 1}.0.0`;
            case 'minor':
                return `${major}.${minor + 1}.0`;
            case 'patch':
                return `${major}.${minor}.${patch + 1}`;
            case 'custom':
                return customVersion || version;
            default:
                return version;
        }
    }
}

async function getGitHubToken(): Promise<string | undefined> {
    try {
        // Try to get the session
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        return session?.accessToken;
    } catch (error) {
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
            } catch (error: unknown) {
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
        } catch (error: unknown) {
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
                        } catch (error) {
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
        } catch (error) {
            console.error('Error getting commit history:', error);
            return '### Failed to get commit history';
        }
    }
}

function getCurrentVersion(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
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
    } catch (error) {
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

    // Only proceed if explicitly requested through commit
    if (!shouldUpdateVersion) {
        console.log('Version update not requested, skipping');
        return;
    }

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
            
            // Update version in package.json
            packageJson.version = version;
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            
            // Reset the cached version to force recalculation
            lastCalculatedVersion = undefined;
            nextVersion = '';
            
            // Create git tag if enabled and this is a new version
            if (enableAutoTag && version !== oldVersion) {
                const prefix = vscode.workspace.getConfiguration(EXTENSION_NAME).get('releasePrefix', 'v');
                await execAsync(`git tag ${prefix}${version}`, { cwd: workspaceFolders[0].uri.fsPath });
                await execAsync('git push origin --tags', { cwd: workspaceFolders[0].uri.fsPath });
            }
        }
    } catch (error) {
        console.error('Error updating version:', error);
        vscode.window.showErrorMessage(`Failed to update version: ${error}`);
    } finally {
        isUpdatingVersion = false;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Version Control extension is now active!');

    // Create the version provider
    const versionProvider = new VersionProvider();

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
        updateScmInputBox();
    };

    // Create and register the tree view
    const treeView = vscode.window.createTreeView('scm-version-selector', {
        treeDataProvider: versionProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);

    // Initial title update without triggering version change
    const currentVersion = versionProvider.getCurrentVersion();
    nextVersion = customVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
    lastCalculatedVersion = nextVersion;
    updateTitle();

    // Create status bar item
    const versionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    versionStatusBarItem.command = 'extension.selectVersionType';
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
        vscode.commands.registerCommand('extension.selectVersionType', async () => {
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
                        currentVersionMode = type;
                        customVersion = input;
                        nextVersion = input;
                    }
                } else {
                    currentVersionMode = type;
                    customVersion = undefined;
                    const currentVersion = versionProvider.getCurrentVersion();
                    nextVersion = type === 'none' ? currentVersion : versionProvider.bumpVersion(currentVersion, type);
                }
                
                updateVersionStatusBar();
                updateTitle();
                versionProvider.refresh();
            }
        })
    );

    // Register settings command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openVersionSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:TriexDev.github-versionsync');
        })
    );

    // Add updateScmInputBox function
    function updateScmInputBox() {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (!gitExtension) {
            return;
        }

        const git = gitExtension.getAPI(1);
        const repo = git.repositories[0];
        if (!repo) {
            return;
        }

        const currentText = repo.inputBox.value;
        
        // Only update if there's a version change
        if (currentVersionMode !== 'none' && nextVersion !== lastCalculatedVersion) {
            // Extract the version from the commit message if it exists
            const versionMatch = currentText.match(/v\d+\.\d+\.\d+/);
            if (versionMatch) {
                // Replace existing version
                repo.inputBox.value = currentText.replace(versionMatch[0], `v${nextVersion}`);
            } else {
                // Add version to the end if not present
                repo.inputBox.value = currentText.trim() + ` v${nextVersion}`;
            }
            lastCalculatedVersion = nextVersion;
        }
    }

    // Register GitHub release toggle command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.toggleGitHubRelease', async () => {
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const currentEnabled = config.get('enableGitHubRelease', false);
            await config.update('enableGitHubRelease', !currentEnabled, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Automatic GitHub releases ${!currentEnabled ? 'enabled' : 'disabled'}`);
            versionProvider.refresh();
        })
    );

    // Register create one-off release command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.createOneOffRelease', async () => {
            try {
                // Try to get GitHub token first
                const token = await getGitHubToken();
                if (!token) {
                    const action = await vscode.window.showInformationMessage(
                        'GitHub authentication required for creating releases.',
                        'Sign in to GitHub'
                    );
                    
                    if (action === 'Sign in to GitHub') {
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
            } catch (error) {
                console.error('Create Release Error:', error);
                vscode.window.showErrorMessage(`Failed to create release: ${error}`);
            }
        })
    );

    // Create and register the webview provider
    const releaseWebviewProvider = new ReleaseWebviewProvider(context.extensionUri);

    // Register the title click command
    context.subscriptions.push(
        vscode.commands.registerCommand('scm-version-selector.titleClick', () => {
            vscode.commands.executeCommand('extension.selectVersionType');
        })
    );

    // Load configuration
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
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
            if (e.affectsConfiguration(EXTENSION_NAME)) {
                const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                enableAutoTag = config.get('enableAutoTag', true);
                enableGitHubRelease = config.get('enableGitHubRelease', false);
                const newVersionFile = config.get('versionFile', '');
                
                // Update status bar if version file changes
                if (newVersionFile !== versionFile) {
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

    // // Update SCM input box when version changes
    // const updateScmInputBox = () => {
    //     const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    //     if (gitExtension) {
    //         const git = gitExtension.getAPI(1);
    //         if (git) {
    //             const repo = git.repositories[0];
    //             if (repo) {
    //                 const currentVersion = versionProvider.getCurrentVersion();
    //                 // Don't trigger version updates, just show the potential next version
    //                 const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
    //                 const versionChanged = currentVersion !== nextVer && currentVersionMode !== 'none';
    //                 const currentMessage = repo.inputBox.value;
                    
    //                 // Only update if there's no message or if it doesn't already contain version info
    //                 if (currentMessage && !currentMessage.includes(nextVer)) {
    //                     repo.inputBox.placeholder = `Commit message v${nextVer} (e.g., feat: Add new feature v${nextVer})`;
    //                 }
    //             }
    //         }
    //     }
    // };

    // Initial update
    updateScmInputBox();

    // Register the test button command
    context.subscriptions.push(
        vscode.commands.registerCommand('github-versionsync.testSourceControl', () => {
            versionProvider.refresh();
            vscode.window.showInformationMessage('Test button clicked - refreshing source control view!');
        })
    );

    // Add test button
    const testButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    testButton.text = "$(versions) Test Version Control";
    testButton.command = 'github-versionsync.testSourceControl';
    testButton.tooltip = 'Click to test version control view';
    testButton.show();
    context.subscriptions.push(testButton);

    // Get the git extension
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (gitExtension) {
        const git = gitExtension.getAPI(1);
        
        // Register our pre-commit command
        context.subscriptions.push(
            vscode.commands.registerCommand('github-versionsync.preCommit', async () => {
                const repo = git.repositories[0];
                if (!repo) return;

                try {
                    // Get current message and version info
                    const currentMessage = repo.inputBox.value;
                    if (!currentMessage.trim()) {
                        vscode.window.showErrorMessage('Please enter a commit message');
                        return;
                    }

                    // Check if there are staged changes
                    const hasStagedChanges = repo.state.indexChanges.length > 0;
                    const hasNonPackageChanges = repo.state.indexChanges.some((change: any) => 
                        !change.uri.path.endsWith('package.json')
                    );

                    if (!hasStagedChanges) {
                        vscode.window.showInformationMessage('No changes staged for commit');
                        return;
                    }

                    const currentVersion = versionProvider.getCurrentVersion();
                    const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);

                    // Only proceed with version update if we have changes and version mode is not 'none'
                    if (hasStagedChanges && currentVersionMode !== 'none') {
                        // Set flag before version update
                        shouldUpdateVersion = true;

                        // Update version in package.json if needed
                        if (currentVersion !== nextVer) {
                            // Update version first
                            await updateVersion(nextVer, currentVersionMode);
                            
                            // Stage package.json after version update
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            if (workspaceFolders) {
                                const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
                                await repo.add([packageJsonPath]);

                                // Update commit message with version if not already present
                                if (!currentMessage.includes(`v${nextVer}`)) {
                                    repo.inputBox.value = `${currentMessage} v${nextVer}`;
                                }
                            }
                        }

                        // Execute the commit command
                        await vscode.commands.executeCommand('git.commit');

                        // Create and push git tag immediately after commit if needed
                        if (enableAutoTag && currentVersion !== nextVer) {
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            if (workspaceFolders) {
                                try {
                                    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                                    const prefix = config.get('releasePrefix', 'v');
                                    await execAsync(`git tag ${prefix}${nextVer}`, { cwd: workspaceFolders[0].uri.fsPath });
                                    await execAsync('git push origin --tags', { cwd: workspaceFolders[0].uri.fsPath });
                                    
                                    // Reset version mode after successful update
                                    currentVersionMode = 'patch'; // Reset to patch instead of none
                                    const newCurrentVersion = versionProvider.getCurrentVersion();
                                    nextVersion = versionProvider.bumpVersion(newCurrentVersion, currentVersionMode);
                                    lastCalculatedVersion = nextVersion;
                                    versionProvider.refresh();
                                    updateVersionStatusBar();
                                    updateTitle();
                                } catch (error) {
                                    console.error('Error creating/pushing git tag:', error);
                                    vscode.window.showErrorMessage(`Failed to create/push git tag: ${error}`);
                                }
                            }
                        }
                    } else {
                        // If no version update needed, just commit
                        await vscode.commands.executeCommand('git.commit');
                    }
                } catch (error) {
                    console.error('Error in pre-commit:', error);
                    vscode.window.showErrorMessage(`Failed to prepare commit: ${error}`);
                } finally {
                    // Always reset the flag
                    shouldUpdateVersion = false;
                }
            })
        );

        // Watch for repository changes
        context.subscriptions.push(
            git.onDidChangeState(() => {
                const repo = git.repositories[0];
                if (repo) {
                    // Watch for changes to the commit message
                    repo.inputBox.onDidChange(() => {
                        const currentMessage = repo.inputBox.value;
                        const currentVersion = versionProvider.getCurrentVersion();
                        const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
                        
                        // Only update placeholder if version change is needed and message doesn't have version
                        if (currentVersionMode !== 'none' && currentVersion !== nextVer && !currentMessage.includes(`v${nextVer}`)) {
                            repo.inputBox.placeholder = `Commit message (version v${nextVer} will be auto-appended)`;
                        }
                    });
                }
            })
        );
    }

    // Register GitHub release toggle command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.toggleGitHubRelease', async () => {
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const currentEnabled = config.get('enableGitHubRelease', false);
            await config.update('enableGitHubRelease', !currentEnabled, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Automatic GitHub releases ${!currentEnabled ? 'enabled' : 'disabled'}`);
            versionProvider.refresh();
        })
    );

    // Register create one-off release command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.createOneOffRelease', async () => {
            try {
                // Try to get GitHub token first
                const token = await getGitHubToken();
                if (!token) {
                    const action = await vscode.window.showInformationMessage(
                        'GitHub authentication required for creating releases.',
                        'Sign in to GitHub'
                    );
                    
                    if (action === 'Sign in to GitHub') {
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
            } catch (error) {
                console.error('Create Release Error:', error);
                vscode.window.showErrorMessage(`Failed to create release: ${error}`);
            }
        })
    );

    // Register the tree view click handler
    context.subscriptions.push(
        vscode.commands.registerCommand('scm-version-selector.titleClick', () => {
            vscode.commands.executeCommand('extension.selectVersionType');
        })
    );
}

export function deactivate() {}
