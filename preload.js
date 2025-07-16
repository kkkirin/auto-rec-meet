const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

// セキュアなAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
    // API Keyの安全な保存・取得
    saveApiKey: (keyType, apiKey) => ipcRenderer.invoke('save-api-key', keyType, apiKey),
    getApiKey: (keyType) => ipcRenderer.invoke('get-api-key', keyType),
    
    // Notion APIへの保存（Node.jsから直接実行）
    saveToNotion: (notionToken, databaseId, recordingData) => ipcRenderer.invoke('save-to-notion', notionToken, databaseId, recordingData),
    
    // ファイル保存ダイアログ
    saveFileDialog: (defaultName, content) => ipcRenderer.invoke('save-file-dialog', defaultName, content),
    
    // アプリ情報
    isElectron: true,
    platform: process.platform,
    
    // デスクトップキャプチャ
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
    
    // システムオーディオ録音
    startSystemAudioRecording: (outputPath) => ipcRenderer.invoke('start-system-audio-recording', outputPath),
    stopSystemAudioRecording: () => ipcRenderer.invoke('stop-system-audio-recording')
});

// セキュリティ強化
window.addEventListener('DOMContentLoaded', () => {
    // Node.jsのグローバルを削除
    delete window.require;
    delete window.exports;
    delete window.module;
});