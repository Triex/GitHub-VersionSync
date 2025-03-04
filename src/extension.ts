import axios from 'axios';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_NAME = 'github-versionsync';
const PACKAGE_JSON = 'package.json';
let enableGitHubRelease = false;
let enableAutoTag = true;
type VersionType = 'major' | 'minor' | 'patch' | 'custom' | 'none';
let currentVersionMode: VersionType = 'patch';
let nextVersion: string = '';
let customVersion: string | undefined;

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
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.TreeItem[] {
        const currentVersion = this.getCurrentVersion();
        const nextVer = nextVersion || this.bumpVersion(currentVersion, currentVersionMode);

        const currentItem = new vscode.TreeItem(`Current: ${currentVersion}`);
        currentItem.iconPath = new vscode.ThemeIcon('tag');
        
        const nextItem = new vscode.TreeItem(`Next: ${nextVer}`, vscode.TreeItemCollapsibleState.None);
        nextItem.iconPath = new vscode.ThemeIcon('arrow-up');
        nextItem.command = {
            command: 'extension.selectVersionType',
            title: 'Select Version Type'
        };

        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        const releaseEnabled = config.get('enableGitHubRelease', false);
        const githubToken = config.get('githubToken', '');

        const githubItem = new vscode.TreeItem('GitHub Releases', vscode.TreeItemCollapsibleState.None);
        githubItem.iconPath = new vscode.ThemeIcon('github');
        githubItem.command = {
            command: 'extension.toggleGitHubRelease',
            title: 'Toggle GitHub Releases'
        };

        if (releaseEnabled) {
            if (!githubToken) {
                githubItem.description = '⚠️ Token Required';
                githubItem.tooltip = 'GitHub token is required. Click to configure.';
            } else {
                githubItem.description = '✓ Enabled';
                githubItem.tooltip = 'GitHub releases are enabled. Click to disable.';
            }
        } else {
            githubItem.description = 'Disabled';
            githubItem.tooltip = 'GitHub releases are disabled. Click to enable.';
        }

        return [currentItem, nextItem, githubItem];
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

export function activate(context: vscode.ExtensionContext) {
    console.log('Version Control extension is now active!');

    // Create the version provider
    const versionProvider = new VersionProvider();

    // Register the tree data provider
    const treeView = vscode.window.createTreeView('scm-version-selector', {
        treeDataProvider: versionProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);

    // Get formatted version type for display
    const getVersionTypeDisplay = (type: VersionType): string => {
        if (type === 'none') return 'No Change';
        return type === 'custom' ? 'Custom' : type.charAt(0).toUpperCase() + type.slice(1);
    };

    // Update title when versions change
    const updateTitle = () => {
        const currentVersion = versionProvider.getCurrentVersion();
        const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
        const versionDisplay = currentVersionMode === 'none' ? 
            `Version Control (${currentVersion}) [No Change]` :
            `Version Control (${currentVersion} → ${nextVer}) [${getVersionTypeDisplay(currentVersionMode)}]`;
        treeView.title = versionDisplay;
    };

    // Initial title update
    updateTitle();

    // Register version selection command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.selectVersionType', async () => {
            const items = [
                { label: '$(arrow-small-right) Patch', description: 'Increment patch version (default)', type: 'patch' as const },
                { label: '$(arrow-right) Minor', description: 'Increment minor version', type: 'minor' as const },
                { label: '$(arrow-up) Major', description: 'Increment major version', type: 'major' as const },
                { label: '$(pencil) Custom', description: 'Set custom version', type: 'custom' as const },
                { label: '$(x) No Change', description: 'Keep current version', type: 'none' as const }
            ];

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select version update type'
            });

            if (selected) {
                if (selected.type === 'custom') {
                    const currentVersion = versionProvider.getCurrentVersion();
                    const input = await vscode.window.showInputBox({
                        prompt: 'Enter custom version (e.g., 1.2.3)',
                        value: currentVersion,
                        validateInput: (value) => {
                            return /^\d+\.\d+\.\d+$/.test(value) ? null : 'Please enter a valid version (e.g., 1.2.3)';
                        }
                    });

                    if (input) {
                        currentVersionMode = 'custom';
                        customVersion = input;
                        nextVersion = input;
                        versionProvider.refresh();
                        updateTitle();
                    }
                } else {
                    currentVersionMode = selected.type;
                    const currentVersion = versionProvider.getCurrentVersion();
                    nextVersion = versionProvider.bumpVersion(currentVersion, selected.type);
                    versionProvider.refresh();
                    updateTitle();
                }
            }
        })
    );

    // Register settings command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openVersionSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:TriexDev.github-versionsync');
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

    // Update SCM input box when version changes
    const updateScmInputBox = () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (gitExtension) {
            const git = gitExtension.getAPI(1);
            if (git) {
                const repo = git.repositories[0];
                if (repo) {
                    const currentVersion = versionProvider.getCurrentVersion();
                    const nextVer = nextVersion || versionProvider.bumpVersion(currentVersion, currentVersionMode);
                    repo.inputBox.placeholder = `Commit message (Version: ${currentVersion} → ${nextVer})`;
                }
            }
        }
    };

    // Initial update
    updateScmInputBox();

    // Register the test button command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.testSourceControl', () => {
            versionProvider.refresh();
            vscode.window.showInformationMessage('Test button clicked - refreshing source control view!');
        })
    );

    // Add test button
    const testButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    testButton.text = "$(versions) Test Version Control";
    testButton.command = 'extension.testSourceControl';
    testButton.tooltip = 'Click to test version control view';
    testButton.show();
    context.subscriptions.push(testButton);

    // Register GitHub release toggle command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.toggleGitHubRelease', async () => {
            const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
            const currentEnabled = config.get('enableGitHubRelease', false);
            
            if (!currentEnabled) {
                const token = config.get('githubToken', '');
                if (!token) {
                    const input = await vscode.window.showInputBox({
                        prompt: 'Enter your GitHub Personal Access Token',
                        password: true,
                        placeHolder: 'ghp_...',
                        validateInput: (value) => {
                            return value && value.length > 0 ? null : 'Token is required for GitHub releases';
                        }
                    });

                    if (input) {
                        await config.update('githubToken', input, vscode.ConfigurationTarget.Global);
                    } else {
                        return; // User cancelled
                    }
                }
            }

            await config.update('enableGitHubRelease', !currentEnabled, vscode.ConfigurationTarget.Global);
            versionProvider.refresh();
        })
    );
}

async function updateVersionAndCommit(type: VersionType) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace opened.");
        return;
    }

    const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const versionFilePath = path.join(workspaceFolders[0].uri.fsPath, config.get('versionFile', ''));

    if (!fs.existsSync(packageJsonPath)) {
        vscode.window.showErrorMessage("package.json not found in workspace root.");
        return;
    }

    const currentVersion = getCurrentVersion();
    const newVersion = type === 'none' ? currentVersion : 
                      type === 'custom' ? (customVersion || currentVersion) : 
                      bumpVersion(currentVersion, type);

    // Update package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    // Update VERSION file if it exists and is configured
    const versionFile = config.get('versionFile', '');
    if (versionFile && fs.existsSync(versionFilePath)) {
        fs.writeFileSync(versionFilePath, newVersion + '\n');
    }

    // Create git commit and tag
    if (type !== 'none') {
        try {
            const message = `chore: bump version to ${newVersion}`;
            
            // Stage files
            await execAsync(`git add ${packageJsonPath}${versionFile ? ` ${versionFilePath}` : ''}`, { cwd: workspaceFolders[0].uri.fsPath });
            
            // Create commit
            await execAsync(`git commit -m "${message}"`, { cwd: workspaceFolders[0].uri.fsPath });

            // Create and push tag if enabled
            if (config.get('enableAutoTag', true)) {
                const prefix = config.get('releasePrefix', 'v');
                const tagName = `${prefix}${newVersion}`;
                await execAsync(`git tag ${tagName}`, { cwd: workspaceFolders[0].uri.fsPath });
                await execAsync('git push --tags', { cwd: workspaceFolders[0].uri.fsPath });
            }

            // Create GitHub release if enabled
            if (config.get('enableGitHubRelease', false)) {
                await createGitHubRelease(newVersion, message);
            }

            vscode.window.showInformationMessage(`Version updated to ${newVersion}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to update version: ${error.message}`);
            console.error('Version Update Error:', error);
        }
    }
}

function getCurrentVersion(): string {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!rootPath) {
        vscode.window.showErrorMessage("No workspace opened.");
        return "";
    }

    let versionFile = config.get<string>('versionFile', 'VERSION');
    const versionPath = path.join(rootPath, versionFile);
    const packagePath = path.join(rootPath, 'package.json');

    if (fs.existsSync(versionPath)) {
        if (path.basename(versionPath) === PACKAGE_JSON) {
            const packageJson = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
            return packageJson.version || '1.0.0';
        }
        return fs.readFileSync(versionPath, 'utf-8').trim() || '1.0.0';
    }
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return packageJson.version || '1.0.0';
    }

    vscode.window.showErrorMessage("No version file found (expected VERSION or package.json).");
    return "";
}

function getVersionFilePath(): string {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!rootPath) {
        vscode.window.showErrorMessage("No workspace opened.");
        return "";
    }

    let versionFile = config.get<string>('versionFile', 'VERSION');
    const versionPath = path.join(rootPath, versionFile);
    const packagePath = path.join(rootPath, 'package.json');

    if (fs.existsSync(versionPath)) return versionPath;
    if (fs.existsSync(packagePath)) return packagePath;

    vscode.window.showErrorMessage("No version file found (expected VERSION or package.json).");
    return "";
}

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch' | 'none'): string {
    if (type === 'none') {
        return version;
    }

    const parts = version.split('.').map(Number);

    if (type === 'major') {
        return `${parts[0] + 1}.0.0`;
    } else if (type === 'minor') {
        return `${parts[0]}.${parts[1] + 1}.0`;
    } else if (type === 'patch') {
        return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }

    return version;
}

async function createGitHubRelease(version: string, message: string = '') {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const token = config.get('githubToken', '');
    const prefix = config.get('releasePrefix', 'v');
    
    if (!token) {
        vscode.window.showErrorMessage('GitHub token is required for creating releases. Please configure it in settings.');
        return;
    }

    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace opened');
        }

        // Get repository info from git config
        const gitConfigPath = path.join(workspaceFolders[0].uri.fsPath, '.git', 'config');
        const gitConfig = fs.readFileSync(gitConfigPath, 'utf8');
        const repoUrlMatch = gitConfig.match(/url = .*github\.com[:/](.+\/.+)\.git/);
        
        if (!repoUrlMatch) {
            throw new Error('Could not find GitHub repository URL in git config');
        }

        const repoFullName = repoUrlMatch[1].replace(':', '/');
        const tagName = `${prefix}${version}`;
        
        // Create release using GitHub API
        const response = await axios.post(
            `https://api.github.com/repos/${repoFullName}/releases`,
            {
                tag_name: tagName,
                name: tagName,
                body: message || `Release ${tagName}`,
                draft: false,
                prerelease: false
            },
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (response.status === 201) {
            vscode.window.showInformationMessage(`GitHub release ${tagName} created successfully!`);
        }
    } catch (error: any) {
        let errorMessage = 'Failed to create GitHub release';
        if (error.response?.data?.message) {
            errorMessage += `: ${error.response.data.message}`;
        } else if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        vscode.window.showErrorMessage(errorMessage);
        console.error('GitHub Release Error:', error);
    }
}

async function execAsync(command: string, options: cp.ExecOptions) {
    return new Promise((resolve, reject) => {
        cp.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

export function deactivate() {}
