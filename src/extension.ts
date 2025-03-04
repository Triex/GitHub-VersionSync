import axios from 'axios';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_NAME = 'github-versionsync';
const PACKAGE_JSON = 'package.json';
let enableGitHubRelease = false;
let enableAutoTag = true;
let currentVersionMode: 'major' | 'minor' | 'patch' | 'custom' = 'patch';
let customVersion: string | undefined;
let nextVersion: string = '';

class VersionQuickPickItem implements vscode.QuickPickItem {
    constructor(
        public label: string,
        public description: string,
        public type: 'major' | 'minor' | 'patch' | 'custom'
    ) {}
}

class VersionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = 'Click to change version';
        this.iconPath = new vscode.ThemeIcon('versions');
        this.contextValue = 'versionItem';
    }
}

class VersionSelectorProvider implements vscode.TreeDataProvider<VersionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<VersionTreeItem | undefined | null | void> = new vscode.EventEmitter<VersionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<VersionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: VersionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: VersionTreeItem): Promise<VersionTreeItem[]> {
        if (element) {
            return [];
        }

        const currentVersion = getCurrentVersion();
        const nextVer = nextVersion || bumpVersion(currentVersion, currentVersionMode);
        
        return [
            new VersionTreeItem(
                'Current Version',
                currentVersion,
                vscode.TreeItemCollapsibleState.None
            ),
            new VersionTreeItem(
                'Next Version',
                nextVer,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'extension.selectVersionType',
                    title: 'Select Version Type',
                    arguments: []
                }
            )
        ];
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('GitHub Version Sync is now active!');

    // Load configuration
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    enableAutoTag = config.get('enableAutoTag', true);
    enableGitHubRelease = config.get('enableGitHubRelease', false);

    // Register configuration change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(EXTENSION_NAME)) {
                const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
                enableAutoTag = config.get('enableAutoTag', true);
                enableGitHubRelease = config.get('enableGitHubRelease', false);
                console.log(`Configuration updated - AutoTag: ${enableAutoTag}, GitHubRelease: ${enableGitHubRelease}`);
            }
        })
    );

    // Create and register the version selector provider
    const versionSelectorProvider = new VersionSelectorProvider();
    
    // Register the tree data provider and create the view
    const treeView = vscode.window.createTreeView('scm-version-selector', {
        treeDataProvider: versionSelectorProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);

    // Register the version selection command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.selectVersionType', async () => {
            const currentVersion = getCurrentVersion();
            const items: VersionQuickPickItem[] = [
                new VersionQuickPickItem(
                    'Major',
                    `${currentVersion} → ${bumpVersion(currentVersion, 'major')}`,
                    'major'
                ),
                new VersionQuickPickItem(
                    'Minor',
                    `${currentVersion} → ${bumpVersion(currentVersion, 'minor')}`,
                    'minor'
                ),
                new VersionQuickPickItem(
                    'Patch',
                    `${currentVersion} → ${bumpVersion(currentVersion, 'patch')}`,
                    'patch'
                ),
                new VersionQuickPickItem(
                    'Custom',
                    'Enter custom version',
                    'custom'
                )
            ];

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select version update type'
            });

            if (selected) {
                if (selected.type === 'custom') {
                    const input = await vscode.window.showInputBox({
                        prompt: "Enter custom version (e.g., 1.2.3)",
                        value: currentVersion,
                        validateInput: (value) => {
                            return /^\d+\.\d+\.\d+$/.test(value) ? null : 'Please enter a valid version (e.g., 1.2.3)';
                        }
                    });

                    if (input) {
                        currentVersionMode = 'custom';
                        customVersion = input;
                        nextVersion = input;
                        versionSelectorProvider.refresh();
                        updateScmInputBox();
                    }
                } else {
                    currentVersionMode = selected.type;
                    nextVersion = bumpVersion(currentVersion, selected.type);
                    versionSelectorProvider.refresh();
                    updateScmInputBox();
                }
            }
        })
    );

    // Register settings command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openVersionSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'github-versionsync');
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
                    const currentVersion = getCurrentVersion();
                    const nextVer = nextVersion || bumpVersion(currentVersion, currentVersionMode);
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
            const versionSelectorProvider = new VersionSelectorProvider();
            versionSelectorProvider.refresh();
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
}

function getCurrentVersion(): string {
    const versionFilePath = getVersionFilePath();
    if (!versionFilePath) {
        return '1.0.0';
    }

    if (fs.existsSync(versionFilePath)) {
        if (path.basename(versionFilePath) === PACKAGE_JSON) {
            const packageJson = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
            return packageJson.version || '1.0.0';
        }
        return fs.readFileSync(versionFilePath, 'utf-8').trim() || '1.0.0';
    }

    return '1.0.0';
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

function bumpVersion(version: string, type: 'patch' | 'minor' | 'major' | 'custom'): string {
    if (type === 'custom' && customVersion) {
        return customVersion;
    }

    const parts = version.split('.').map(Number);

    if (type === 'major') {
        parts[0] += 1;
        parts[1] = 0;
        parts[2] = 0;
    } else if (type === 'minor') {
        parts[1] += 1;
        parts[2] = 0;
    } else {
        parts[2] += 1;
    }

    return parts.join('.');
}

async function updateVersionAndCommit(type: 'patch' | 'minor' | 'major' | 'custom') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace opened.");
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const versionFilePath = getVersionFilePath();
    if (!versionFilePath) {
        return;
    }

    const currentVersion = getCurrentVersion();
    const newVersion = type === 'custom' ? (customVersion || currentVersion) : bumpVersion(currentVersion, type);

    // Update VERSION file if it exists
    if (fs.existsSync(versionFilePath)) {
        if (path.basename(versionFilePath) === PACKAGE_JSON) {
            const packageJson = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
            packageJson.version = newVersion;
            fs.writeFileSync(versionFilePath, JSON.stringify(packageJson, null, 4));
        } else {
            fs.writeFileSync(versionFilePath, newVersion);
        }
    }

    vscode.window.showInformationMessage(`Updated version to ${newVersion}`);

    try {
        const filesToCommit: string[] = [];
        if (fs.existsSync(versionFilePath)) filesToCommit.push(versionFilePath);

        if (filesToCommit.length > 0) {
            cp.execSync(`git add ${filesToCommit.join(' ')}`, { cwd: rootPath });
            cp.execSync(`git commit -m "Bump ${type} version to ${newVersion}"`, { cwd: rootPath });
        }

        // After successful commit, create tag if auto-tagging is enabled
        if (enableAutoTag) {
            try {
                const existingTags = cp.execSync('git tag', { cwd: rootPath }).toString().trim();
                if (existingTags) {
                    cp.execSync(`git push --tags`, { cwd: rootPath });
                    vscode.window.showInformationMessage(`Created and pushed tag v${newVersion}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to push tags: ${error}`);
            }
        }

        if (enableGitHubRelease) {
            await createGitHubRelease(newVersion, rootPath);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Git operation failed: ${error}`);
        return;
    }
}

async function createGitHubRelease(newVersion: string, rootPath: string) {
    const repoUrl = cp.execSync('git config --get remote.origin.url', { cwd: rootPath }).toString().trim();
    const match = repoUrl.match(/github\.com[:\/](.+)\.git/);
    if (!match) {
        vscode.window.showErrorMessage("Not a GitHub repository.");
        return;
    }
    const repo = match[1];

    // Get the last tag safely, handling the case where no tags exist
    let commitMessages = '';
    try {
        const lastTag = cp.execSync('git describe --tags --abbrev=0', { cwd: rootPath }).toString().trim();
        commitMessages = cp.execSync(`git log ${lastTag}..HEAD --pretty=format:"- %h %s (%ci)"`, { cwd: rootPath }).toString().trim();
    } catch (error) {
        // If no tags exist, get all commits
        commitMessages = cp.execSync('git log --pretty=format:"- %h %s (%ci)"', { cwd: rootPath }).toString().trim();
    }
    // If no commit messages, default to "No new commits since last release."
    if (!commitMessages.trim()) {
        commitMessages = "No new commits since last release.";
    }

    const releaseNotes = await vscode.window.showInputBox({
        prompt: "Edit Release Notes",
        value: `### Changes in v${newVersion}\n\n${commitMessages}`,
    });

    if (!releaseNotes) {
        vscode.window.showWarningMessage("GitHub release cancelled.");
        return;
    }

    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    let githubToken = process.env.GITHUB_TOKEN || config.get<string>('githubToken');

    if (!githubToken) {
        const inputToken = await vscode.window.showInputBox({ 
            prompt: "Enter your GitHub Token (with 'repo' permissions)", 
            password: true 
        });

        if (!inputToken) {
            vscode.window.showErrorMessage("GitHub release cancelled due to missing token.");
            return;
        }

        // Store token in VS Code settings
        await config.update('githubToken', inputToken, vscode.ConfigurationTarget.Global);
        githubToken = inputToken;
    }

    try {
        await axios.post(`https://api.github.com/repos/${repo}/releases`, {
            tag_name: `v${newVersion}`,
            name: `Version ${newVersion}`,
            body: releaseNotes,
            draft: false,
            prerelease: false
        }, {
            headers: {
                Authorization: `token ${githubToken}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });

        vscode.window.showInformationMessage(`GitHub release v${newVersion} created!`);
    } catch (error) {
        vscode.window.showErrorMessage("Failed to create GitHub release: " + error);
    }
}

export function deactivate() {}
