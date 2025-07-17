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
    
    // 画面共有ウィンドウの監視
    startScreenCaptureMonitoring: (sourceId) => ipcRenderer.invoke('start-screen-capture-monitoring', sourceId),
    stopScreenCaptureMonitoring: () => ipcRenderer.invoke('stop-screen-capture-monitoring'),
    
    // システムオーディオ録音
    startSystemAudioRecording: (outputPath) => ipcRenderer.invoke('start-system-audio-recording', outputPath),
    stopSystemAudioRecording: () => ipcRenderer.invoke('stop-system-audio-recording'),
    
    // システムオーディオファイル操作
    readSystemAudioFile: (filePath) => ipcRenderer.invoke('read-system-audio-file', filePath),
    deleteSystemAudioFile: (filePath) => ipcRenderer.invoke('delete-system-audio-file', filePath),
    
    // デバッグファイル保存
    saveDebugFile: (fileName, arrayBuffer) => ipcRenderer.invoke('save-debug-file', fileName, arrayBuffer),
    
    // イベントリスナー
    onScreenCaptureWindowClosed: (callback) => ipcRenderer.on('screen-capture-window-closed', callback),
    removeScreenCaptureWindowClosedListener: (callback) => ipcRenderer.removeListener('screen-capture-window-closed', callback)
});

// セキュリティ強化
window.addEventListener('DOMContentLoaded', () => {
    // Node.jsのグローバルを削除
    delete window.require;
    delete window.exports;
    delete window.module;
});