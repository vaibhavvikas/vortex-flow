import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname safely in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';

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
    createWindow();

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