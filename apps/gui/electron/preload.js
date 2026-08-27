import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vortexflow', {
    getApiConfig: () => ipcRenderer.invoke('vortexflow:api-config'),
});
