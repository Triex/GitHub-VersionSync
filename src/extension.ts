import axios from 'axios';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const PACKAGE_JSON = 'package.json';
let enableGitHubRelease = false;
let enableAutoTag = true;
let versionStatusBarItem: vscode.StatusBarItem;
let currentVersionMode: 'major' | 'minor' | 'patch' | 'custom' = 'patch';
let customVersion: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    // Create status bar item
    versionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    versionStatusBarItem.command = 'extension.customVersion';
    context.subscriptions.push(versionStatusBarItem);
    updateVersionDisplay();

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.versionCommitPatch', () => {
            currentVersionMode = 'patch';
            updateVersionDisplay();
            updateVersionAndCommit('patch');
        }),
        vscode.commands.registerCommand('extension.versionCommitMinor', () => {
            currentVersionMode = 'minor';
            updateVersionDisplay();
            updateVersionAndCommit('minor');
        }),
        vscode.commands.registerCommand('extension.versionCommitMajor', () => {
            currentVersionMode = 'major';
            updateVersionDisplay();
            updateVersionAndCommit('major');
        }),
        vscode.commands.registerCommand('extension.customVersion', async () => {
            const currentVersion = getCurrentVersion();
            const input = await vscode.window.showInputBox({
                prompt: "Enter custom version (e.g., 1.2.3)",
                value: customVersion || currentVersion,
                validateInput: (value) => {
                    return /^\d+\.\d+\.\d+$/.test(value) ? null : 'Please enter a valid version (e.g., 1.2.3)';
                }
            });

            if (input) {
                currentVersionMode = 'custom';
                customVersion = input;
                updateVersionDisplay();
                updateVersionAndCommit('custom');
            }
        }),
        vscode.commands.registerCommand('extension.toggleGitHubRelease', toggleGitHubRelease),
        vscode.commands.registerCommand('extension.toggleAutoTag', toggleAutoTag)
    );
}

function updateVersionDisplay() {
    const currentVersion = getCurrentVersion();
    if (!currentVersion) {
        versionStatusBarItem.hide();
        return;
    }

    let nextVersion: string;
    if (currentVersionMode === 'custom') {
        nextVersion = customVersion || currentVersion;
    } else {
        nextVersion = bumpVersion(currentVersion, currentVersionMode);
    }

    versionStatusBarItem.text = `$(versions) ${nextVersion}`;
    versionStatusBarItem.tooltip = `Click to enter custom version\nCurrent: ${currentVersion}\nNext: ${nextVersion} (${currentVersionMode})`;
    versionStatusBarItem.show();
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

function toggleGitHubRelease() {
    enableGitHubRelease = !enableGitHubRelease;
    vscode.window.showInformationMessage(`GitHub Release: ${enableGitHubRelease ? "Enabled" : "Disabled"}`);
}

function toggleAutoTag() {
    enableAutoTag = !enableAutoTag;
    vscode.window.showInformationMessage(`Auto-tagging: ${enableAutoTag ? "Enabled" : "Disabled"}`);
}

function getVersionFilePath(): string {
    const config = vscode.workspace.getConfiguration('githubVersionSync');
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
    updateVersionDisplay();

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

function bumpVersion(version: string, type: 'patch' | 'minor' | 'major'): string {
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

    const config = vscode.workspace.getConfiguration('githubVersionSync');
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
