import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname safely in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
const API_BASE_URL = process.env.VORTEXFLOW_API_URL || 'http://127.0.0.1:8080';
let serverProcess;
let apiToken;

function getServerBinaryPath() {
    const binaryName = process.platform === 'win32' ? 'vortexflow-server.exe' : 'vortexflow-server';
    return path.join(process.resourcesPath, 'bin', binaryName);
}

async function waitForServer(timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/health`, {
                headers: { Authorization: `Bearer ${apiToken}` },
            });
            if (response.ok) return;
        } catch {
            // The embedded server is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('VortexFlow server did not become ready in time.');
}

async function startEmbeddedServer() {
    if (isDev) return;

    apiToken = crypto.randomBytes(32).toString('hex');
    serverProcess = spawn(getServerBinaryPath(), [], {
        env: { ...process.env, VORTEXFLOW_API_TOKEN: apiToken },
        stdio: 'ignore',
        windowsHide: true,
    });
    serverProcess.once('error', (error) => {
        console.error('Failed to launch bundled VortexFlow server:', error);
    });
    await waitForServer();
}

function stopEmbeddedServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }
    serverProcess = undefined;
}

function createWindow() {
    const isMac = process.platform === 'darwin';

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        backgroundColor: '#090d16',
        titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
        trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
        titleBarOverlay: !isMac ? {
            color: '#090d16',
            symbolColor: '#f8f8f8',
            height: 40,
        } : false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.loadURL(DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    ipcMain.handle('vortexflow:api-config', () => ({
        baseUrl: API_BASE_URL,
        token: apiToken,
    }));

    startEmbeddedServer()
        .then(createWindow)
        .catch((error) => {
            console.error(error);
            app.quit();
        });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', stopEmbeddedServer);
