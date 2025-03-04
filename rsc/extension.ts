import axios from 'axios';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const VERSION_FILE = 'package.json';
let enableGitHubRelease = false; // Toggle flag

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.versionCommitPatch', () => updateVersionAndCommit('patch')),
        vscode.commands.registerCommand('extension.versionCommitMinor', () => updateVersionAndCommit('minor')),
        vscode.commands.registerCommand('extension.versionCommitMajor', () => updateVersionAndCommit('major')),
        vscode.commands.registerCommand('extension.toggleGitHubRelease', toggleGitHubRelease)
    );
}

function toggleGitHubRelease() {
    enableGitHubRelease = !enableGitHubRelease;
    vscode.window.showInformationMessage(`GitHub Release: ${enableGitHubRelease ? "Enabled" : "Disabled"}`);
}

async function updateVersionAndCommit(type: 'patch' | 'minor' | 'major') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace opened.");
        return;
    }

    const packagePath = path.join(workspaceFolders[0].uri.fsPath, VERSION_FILE);
    if (!fs.existsSync(packagePath)) {
        vscode.window.showErrorMessage(`${VERSION_FILE} not found in the workspace.`);
        return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const oldVersion = packageJson.version || '1.0.0';
    const newVersion = bumpVersion(oldVersion, type);

    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

    vscode.window.showInformationMessage(`Updated version to ${newVersion}`);

    cp.execSync(`git add ${VERSION_FILE}`);
    cp.execSync(`git commit -m "Bump ${type} version to ${newVersion}"`);

    if (enableGitHubRelease) {
        await createGitHubRelease(newVersion);
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

async function createGitHubRelease(newVersion: string) {
    const repoUrl = cp.execSync('git config --get remote.origin.url').toString().trim();
    const match = repoUrl.match(/github\.com[:\/](.+)\.git/);
    if (!match) {
        vscode.window.showErrorMessage("Not a GitHub repository.");
        return;
    }
    const repo = match[1];

    const lastTag = cp.execSync('git describe --tags --abbrev=0 || echo').toString().trim();
    const commitMessages = cp.execSync(`git log ${lastTag}..HEAD --pretty=format:"- %h %s (%ci)"`).toString().trim();

    const releaseNotes = await vscode.window.showInputBox({
        prompt: "Edit Release Notes",
        value: `### Changes in v${newVersion}\n\n${commitMessages}`,
    });

    if (!releaseNotes) {
        vscode.window.showWarningMessage("GitHub release cancelled.");
        return;
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        vscode.window.showErrorMessage("GitHub token missing! Set GITHUB_TOKEN in your environment.");
        return;
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
