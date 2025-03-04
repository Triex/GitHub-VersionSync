import axios from 'axios';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const VERSION_FILE = 'VERSION';
const PACKAGE_JSON = 'package.json';
let enableGitHubRelease = false; // Toggle flag
let enableAutoTag = true; // Default to true for auto-tagging

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.versionCommitPatch', () => updateVersionAndCommit('patch')),
        vscode.commands.registerCommand('extension.versionCommitMinor', () => updateVersionAndCommit('minor')),
        vscode.commands.registerCommand('extension.versionCommitMajor', () => updateVersionAndCommit('major')),
        vscode.commands.registerCommand('extension.toggleGitHubRelease', toggleGitHubRelease),
        vscode.commands.registerCommand('extension.toggleAutoTag', toggleAutoTag)
    );
}

function toggleGitHubRelease() {
    enableGitHubRelease = !enableGitHubRelease;
    vscode.window.showInformationMessage(`GitHub Release: ${enableGitHubRelease ? "Enabled" : "Disabled"}`);
}

function toggleAutoTag() {
    enableAutoTag = !enableAutoTag;
    vscode.window.showInformationMessage(`Auto-tagging: ${enableAutoTag ? "Enabled" : "Disabled"}`);
}

async function updateVersionAndCommit(type: 'patch' | 'minor' | 'major') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace opened.");
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const versionPath = path.join(rootPath, VERSION_FILE);
    const packagePath = path.join(rootPath, PACKAGE_JSON);
    
    // Read current version from VERSION file if it exists, otherwise from package.json
    let currentVersion = '1.0.0';
    if (fs.existsSync(versionPath)) {
        currentVersion = fs.readFileSync(versionPath, 'utf-8').trim();
    } else if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        currentVersion = packageJson.version || '1.0.0';
    }

    const newVersion = bumpVersion(currentVersion, type);

    // Update VERSION file
    fs.writeFileSync(versionPath, newVersion);

    // Update package.json if it exists
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        packageJson.version = newVersion;
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 4));
    }

    vscode.window.showInformationMessage(`Updated version to ${newVersion}`);

    cp.execSync(`git add ${VERSION_FILE} ${PACKAGE_JSON}`);
    cp.execSync(`git commit -m "Bump ${type} version to ${newVersion}"`);

    // After successful commit, create tag if auto-tagging is enabled
    if (enableAutoTag) {
        try {
            cp.execSync(`git tag -a v${newVersion} -m "Version ${newVersion}"`, { cwd: rootPath });
            cp.execSync('git push --tags', { cwd: rootPath });
            vscode.window.showInformationMessage(`Created and pushed tag v${newVersion}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create/push tag: ${error}`);
        }
    }

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
