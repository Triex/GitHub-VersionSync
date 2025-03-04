import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const VERSION_FILE = 'package.json'; // Adjust this if we want another file

export function activate(context: vscode.ExtensionContext) {
    let disposablePatch = vscode.commands.registerCommand('extension.versionCommitPatch', () => {
        updateVersionAndCommit('patch');
    });

    let disposableMinor = vscode.commands.registerCommand('extension.versionCommitMinor', () => {
        updateVersionAndCommit('minor');
    });

    let disposableMajor = vscode.commands.registerCommand('extension.versionCommitMajor', () => {
        updateVersionAndCommit('major');
    });

    context.subscriptions.push(disposablePatch, disposableMinor, disposableMajor);
}

function updateVersionAndCommit(type: 'patch' | 'minor' | 'major') {
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

    // Read the package.json and update version
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const oldVersion = packageJson.version || '1.0.0';
    const newVersion = bumpVersion(oldVersion, type);

    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

    vscode.window.showInformationMessage(`Updated version to ${newVersion}`);

    // Stage the version file and commit
    cp.execSync(`git add ${VERSION_FILE}`);
    cp.execSync(`git commit -m "Bump ${type} version to ${newVersion}"`);
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

export function deactivate() {}
