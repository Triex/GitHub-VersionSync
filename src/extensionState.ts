import * as vscode from 'vscode';

/**
 * ExtensionState class for managing extension state across reloads
 * This helps prevent issues with extension host reloads
 */
export class ExtensionState {
    private static _instance: ExtensionState;
    private _context: vscode.ExtensionContext | undefined;
    private _isHealthy: boolean = true;
    private _hasShownError: boolean = false;
    private _isInitialized: boolean = false;
    
    // UI Components
    public versionProvider: any;
    public treeView: vscode.TreeView<vscode.TreeItem> | undefined;
    public versionStatusBarItem: vscode.StatusBarItem | undefined;

    private constructor() {}

    public static getInstance(): ExtensionState {
        if (!this._instance) {
            this._instance = new ExtensionState();
        }
        return this._instance;
    }

    public initialize(context: vscode.ExtensionContext): void {
        this._context = context;

        // Try to restore state from global state
        this._isHealthy = context.globalState.get<boolean>('extensionHealthy', true);
        this._hasShownError = context.globalState.get<boolean>('hasShownError', false);
        
        // If extension was not healthy, try to recover on initialization
        if (!this._isHealthy) {
            console.log('Extension was in unhealthy state, attempting recovery');
            this.recover();
        }
        
        this._isInitialized = true;
    }

    public get isHealthy(): boolean {
        return this._isHealthy;
    }

    public get hasShownError(): boolean {
        return this._hasShownError;
    }

    public get isInitialized(): boolean {
        return this._isInitialized;
    }

    public setUnhealthy(hasShownError: boolean = false): void {
        this._isHealthy = false;
        this._hasShownError = hasShownError;
        
        // Persist state
        if (this._context) {
            this._context.globalState.update('extensionHealthy', false);
            this._context.globalState.update('hasShownError', hasShownError);
        }
    }

    public recover(): void {
        this._isHealthy = true;
        this._hasShownError = false;
        
        // Persist state
        if (this._context) {
            this._context.globalState.update('extensionHealthy', true);
            this._context.globalState.update('hasShownError', false);
        }
    }

    /**
     * Display a warning message about extension state issues with reload option
     */
    public showStateWarning(message: string): void {
        if (this._hasShownError) {
            return; // Prevent multiple warnings
        }
        
        this._hasShownError = true;
        this._isHealthy = false;
        
        // Persist state
        if (this._context) {
            this._context.globalState.update('extensionHealthy', false);
            this._context.globalState.update('hasShownError', true);
        }
        
        vscode.window.showErrorMessage(
            `GitHub Version Sync: ${message}. To resolve this issue, reload the window.`,
            'Reload Window',
            'Reset Extension State'
        ).then(action => {
            if (action === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else if (action === 'Reset Extension State') {
                this.recover();
                vscode.window.showInformationMessage('Extension state reset. Try the operation again.');
            }
        });
    }
}

// Export a singleton instance
export const extensionState = ExtensionState.getInstance();
