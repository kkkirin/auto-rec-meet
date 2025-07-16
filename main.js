const { app, BrowserWindow, ipcMain, Menu, dialog, shell, autoUpdater, desktopCapturer } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

// 暗号化ファイルストレージクラス
class SecureStorage {
    constructor() {
        this.storageFile = path.join(app.getPath('userData'), 'secure-storage.json');
        this.algorithm = 'aes-256-gcm';
        this.salt = 'meeting-transcription-app-salt';
    }

    // 暗号化キーを生成
    getKey() {
        const machineId = require('os').hostname() + require('os').platform();
        return crypto.pbkdf2Sync(machineId, this.salt, 100000, 32, 'sha256');
    }

    // データを暗号化
    encrypt(text) {
        const key = this.getKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    // データを復号化
    decrypt(encryptedData) {
        const key = this.getKey();
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            key,
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    // パスワードを保存
    async setPassword(service, account, password) {
        let storage = {};
        
        try {
            if (fs.existsSync(this.storageFile)) {
                const data = fs.readFileSync(this.storageFile, 'utf8');
                storage = JSON.parse(data);
            }
        } catch (error) {
            console.error('既存ストレージの読み込みエラー:', error);
        }
        
        const key = `${service}:${account}`;
        storage[key] = this.encrypt(password);
        
        fs.writeFileSync(this.storageFile, JSON.stringify(storage, null, 2));
    }

    // パスワードを取得
    async getPassword(service, account) {
        try {
            if (!fs.existsSync(this.storageFile)) {
                return null;
            }
            
            const data = fs.readFileSync(this.storageFile, 'utf8');
            const storage = JSON.parse(data);
            
            const key = `${service}:${account}`;
            if (!storage[key]) {
                return null;
            }
            
            return this.decrypt(storage[key]);
        } catch (error) {
            console.error('パスワード取得エラー:', error);
            return null;
        }
    }
}

// セキュアストレージのインスタンスを作成
const secureStorage = new SecureStorage();

// アプリの基本設定
const APP_NAME = '会議文字起こしアプリ';
const SERVICE_NAME = 'meeting-transcription-app';

let mainWindow;

// メインウィンドウの作成
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            // V8エンジン安定化のための追加設定
            backgroundThrottling: false,
            disableWebkitFonts: true,
            enableWebSQL: false,
            webSecurity: false,  // 画面共有のため一時的に無効化
            allowRunningInsecureContent: false,
            experimentalFeatures: true  // 実験的機能を有効化
        },
        titleBarStyle: 'default',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        title: APP_NAME,
        // ウィンドウ表示の安定化
        show: false
    });

    // HTMLファイルを読み込み
    mainWindow.loadFile('index.html');

    // ウィンドウが準備完了したら表示（クラッシュ防止）
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // 開発時のみDevToolsを開く
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }
    });

    // ウェブコンテンツのクラッシュハンドリング
    mainWindow.webContents.on('crashed', () => {
        console.error('ウェブコンテンツがクラッシュしました');
        const response = dialog.showMessageBoxSync(mainWindow, {
            type: 'error',
            title: 'アプリケーションエラー',
            message: 'アプリケーションで予期しないエラーが発生しました。',
            detail: 'アプリケーションを再起動しますか？',
            buttons: ['再起動', '終了']
        });
        
        if (response === 0) {
            app.relaunch();
            app.exit();
        } else {
            app.quit();
        }
    });

    // ウィンドウが閉じられたときの処理
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 外部リンクをデフォルトブラウザで開く
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // 画面共有権限の処理
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        console.log('Permission request:', permission);
        if (permission === 'media' || permission === 'display-capture') {
            callback(true);
        } else {
            callback(false);
        }
    });

    // desktopCapturer権限の処理
    mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
        console.log('Desktop capture request:', request);
        callback({ video: request.video, audio: request.audio });
    });
}

// V8エンジンのクラッシュ対策（強化版）
app.commandLine.appendSwitch('--no-sandbox');
app.commandLine.appendSwitch('--disable-web-security');
app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor,TurboFan,Sparkplug');
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--disable-background-timer-throttling');
app.commandLine.appendSwitch('--disable-renderer-backgrounding');
app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('--disable-ipc-flooding-protection');
app.commandLine.appendSwitch('--disable-dev-shm-usage');
app.commandLine.appendSwitch('--js-flags', '--jitless --no-expose-wasm --no-opt');
app.commandLine.appendSwitch('--disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('--disable-accelerated-jpeg-decoding');
app.commandLine.appendSwitch('--disable-accelerated-mjpeg-decode');
app.commandLine.appendSwitch('--disable-accelerated-video-decode');
app.commandLine.appendSwitch('--disable-gpu-process-crash-limit');

// 画面共有とメディアデバイス関連の設定
app.commandLine.appendSwitch('--enable-media-stream');
app.commandLine.appendSwitch('--use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('--enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('--allow-http-screen-capture');

// アプリケーションの準備完了時
app.whenReady().then(() => {
    // V8エンジン安定化のため少し遅延
    setTimeout(() => {
        createWindow();
        createMenu();
        setupAutoUpdater();
    }, 100);

    // macOSでアプリがアクティブになったときの処理
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// すべてのウィンドウが閉じられたとき
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// メニューの作成
function createMenu() {
    const template = [
        {
            label: APP_NAME,
            submenu: [
                {
                    label: `${APP_NAME}について`,
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: `${APP_NAME}について`,
                            message: APP_NAME,
                            detail: 'Web会議の音声を自動で文字起こし・要約・Notion保存するアプリ\n\nバージョン: 3.0.0'
                        });
                    }
                },
                { type: 'separator' },
                { role: 'quit', label: '終了' }
            ]
        },
        {
            label: '編集',
            submenu: [
                { role: 'undo', label: '元に戻す' },
                { role: 'redo', label: 'やり直し' },
                { type: 'separator' },
                { role: 'cut', label: '切り取り' },
                { role: 'copy', label: 'コピー' },
                { role: 'paste', label: '貼り付け' }
            ]
        },
        {
            label: '表示',
            submenu: [
                { role: 'reload', label: '再読み込み' },
                { role: 'forcereload', label: '強制再読み込み' },
                { role: 'toggledevtools', label: '開発者ツール' },
                { type: 'separator' },
                { role: 'resetzoom', label: 'ズームリセット' },
                { role: 'zoomin', label: 'ズームイン' },
                { role: 'zoomout', label: 'ズームアウト' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'フルスクリーン切り替え' }
            ]
        },
        {
            label: 'ウィンドウ',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'close', label: '閉じる' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC通信の設定

// API Keyの安全な保存
ipcMain.handle('save-api-key', async (event, keyType, apiKey) => {
    try {
        await secureStorage.setPassword(SERVICE_NAME, keyType, apiKey);
        return { success: true };
    } catch (error) {
        console.error('API Key保存エラー:', error);
        return { success: false, error: error.message };
    }
});

// API Keyの取得
ipcMain.handle('get-api-key', async (event, keyType) => {
    try {
        const apiKey = await secureStorage.getPassword(SERVICE_NAME, keyType);
        return { success: true, apiKey };
    } catch (error) {
        console.error('API Key取得エラー:', error);
        return { success: false, error: error.message };
    }
});

// Notion APIへの保存（Node.jsから直接実行）
ipcMain.handle('save-to-notion', async (event, notionToken, databaseId, recordingData) => {
    try {
        console.log('Notion保存開始:', { notionToken: '***', databaseId });
        console.log('RecordingData type:', typeof recordingData);
        console.log('RecordingData keys:', recordingData ? Object.keys(recordingData) : 'null');
        
        // recordingDataを安全にコピー（完全にシリアライズ可能にする）
        const safeRecordingData = {
            date: recordingData && recordingData.date ? String(recordingData.date) : new Date().toISOString(),
            duration: recordingData && recordingData.duration ? Number(recordingData.duration) : 0,
            transcription: recordingData && recordingData.transcription ? String(recordingData.transcription) : '',
            summary: recordingData && recordingData.summary ? String(recordingData.summary) : ''
        };
        
        // 日付をISO形式に変換
        const isoDate = new Date(safeRecordingData.date).toISOString();
        safeRecordingData.date = isoDate;
        
        console.log('SafeRecordingData:', safeRecordingData);
        
        const date = new Date(safeRecordingData.date);
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const formattedTime = date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const duration = formatTime(safeRecordingData.duration);
        const title = `会議録音 ${formattedDate} ${formattedTime} (${duration})`;
        
        const notionData = {
            parent: {
                database_id: databaseId
            },
            properties: {
                "ミーティング名": {
                    title: [
                        {
                            text: {
                                content: title
                            }
                        }
                    ]
                },
                "日付": {
                    date: {
                        start: safeRecordingData.date
                    }
                }
            }
        };

        // 内容をページ本文として追加（要約を最初に配置）
        const children = [];
        
        // メタ情報を追加
        children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
                rich_text: [
                    {
                        text: {
                            content: `🕒 録音時間: ${duration} | 📅 日時: ${formattedDate} ${formattedTime}`
                        }
                    }
                ]
            }
        });
        
        // 要約を最初に配置
        if (safeRecordingData.summary) {
            children.push({
                object: "block",
                type: "heading_2",
                heading_2: {
                    rich_text: [
                        {
                            text: {
                                content: "📋 要約"
                            }
                        }
                    ]
                }
            });
            
            const summaryChunks = splitTextIntoChunks(safeRecordingData.summary, 2000);
            summaryChunks.forEach(chunk => {
                children.push({
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                        rich_text: [
                            {
                                text: {
                                    content: chunk
                                }
                            }
                        ]
                    }
                });
            });
        }
        
        // その後に文字起こし
        if (safeRecordingData.transcription) {
            children.push({
                object: "block",
                type: "heading_2",
                heading_2: {
                    rich_text: [
                        {
                            text: {
                                content: "📝 文字起こし"
                            }
                        }
                    ]
                }
            });
            
            const transcriptionChunks = splitTextIntoChunks(safeRecordingData.transcription, 2000);
            transcriptionChunks.forEach(chunk => {
                children.push({
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                        rich_text: [
                            {
                                text: {
                                    content: chunk
                                }
                            }
                        ]
                    }
                });
            });
        }

        notionData.children = children;

        // デバッグ: Notionに送信するデータを出力
        console.log('=== Notion API Request Debug ===');
        console.log('Database ID:', databaseId);
        console.log('Notion Data:', JSON.stringify(notionData, null, 2));
        console.log('================================');

        // Node.jsからNotion APIを直接呼び出し（CORS制限なし）
        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(notionData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('=== Notion API Error Debug ===');
            console.error('Status:', response.status);
            console.error('Status Text:', response.statusText);
            console.error('Error Response:', errorText);
            console.error('Request Data was:', JSON.stringify(notionData, null, 2));
            console.error('==============================');
            throw new Error(`Notion API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Notion保存成功:', result);
        return { success: true, result };
        
    } catch (error) {
        console.error('Notion保存エラー:', error);
        return { success: false, error: error.message };
    }
});

// ファイルの保存ダイアログ
ipcMain.handle('save-file-dialog', async (event, defaultName, content) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defaultName,
            filters: [
                { name: 'Markdown Files', extensions: ['md'] },
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled) {
            const fs = require('fs');
            fs.writeFileSync(result.filePath, content, 'utf8');
            return { success: true, filePath: result.filePath };
        }
        
        return { success: false, canceled: true };
    } catch (error) {
        console.error('ファイル保存エラー:', error);
        return { success: false, error: error.message };
    }
});

// デスクトップキャプチャソースの取得
ipcMain.handle('get-desktop-sources', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 200, height: 150 }
        });
        
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    } catch (error) {
        console.error('デスクトップソース取得エラー:', error);
        return [];
    }
});

// システムオーディオの録音（macOS専用）
ipcMain.handle('start-system-audio-recording', async (event, outputPath) => {
    try {
        console.log('🎙️ システムオーディオ録音開始:', outputPath);
        
        // macOSのスクリーンキャプチャでオーディオも録音
        const ffmpegArgs = [
            '-f', 'avfoundation',  // macOSのAVFoundationを使用
            '-i', ':1',           // システムオーディオデバイス
            '-acodec', 'pcm_s16le', // 音声コーデック
            '-ar', '44100',       // サンプリングレート
            '-ac', '2',           // ステレオ
            '-y',                 // 上書き許可
            outputPath
        ];
        
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.stderr.on('data', (data) => {
            console.log('FFmpeg stderr:', data.toString());
        });
        
        ffmpeg.on('error', (error) => {
            console.error('FFmpeg エラー:', error);
        });
        
        // プロセスIDを保存（停止用）
        global.audioRecordingProcess = ffmpeg;
        
        return { success: true, processId: ffmpeg.pid };
        
    } catch (error) {
        console.error('システムオーディオ録音エラー:', error);
        return { success: false, error: error.message };
    }
});

// システムオーディオ録音停止
ipcMain.handle('stop-system-audio-recording', async () => {
    try {
        if (global.audioRecordingProcess) {
            global.audioRecordingProcess.kill('SIGINT');
            global.audioRecordingProcess = null;
            console.log('✅ システムオーディオ録音停止');
            return { success: true };
        }
        return { success: false, error: '録音プロセスが見つかりません' };
    } catch (error) {
        console.error('録音停止エラー:', error);
        return { success: false, error: error.message };
    }
});

// ユーティリティ関数
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function splitTextIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const sentences = text.split(/[。！？\n]/);
    
    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += sentence + (sentence.length > 0 ? '。' : '');
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 0);
}

// アプリのセキュリティ設定
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});

// グローバルクラッシュハンドリング
process.on('uncaughtException', (error) => {
    console.error('未処理の例外:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox('アプリケーションエラー', 
            '予期しないエラーが発生しました。アプリケーションを再起動してください。\n\n' + error.message);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromise拒否:', reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('Promise拒否を処理しました:', promise);
    }
});

// アプリクラッシュの監視
app.on('child-process-gone', (event, details) => {
    console.error('子プロセスが終了:', details);
    if (details.reason === 'crashed') {
        console.error('子プロセスがクラッシュしました');
    }
});

app.on('render-process-gone', (event, webContents, details) => {
    console.error('レンダラープロセスが終了:', details);
    if (details.reason === 'crashed') {
        console.error('レンダラープロセスがクラッシュしました');
        // 自動リロード
        if (webContents && !webContents.isDestroyed()) {
            webContents.reload();
        }
    }
});

// 自動更新の設定
function setupAutoUpdater() {
    // 開発環境では自動更新をスキップ
    if (process.env.NODE_ENV === 'development') {
        return;
    }
    
    // 更新サーバーのURL設定（GitHub Releasesを使用する場合）
    const server = 'https://update.electronjs.org';
    const feed = `${server}/yourcompany/meeting-transcription-app/${process.platform}-${process.arch}/${app.getVersion()}`;
    
    try {
        autoUpdater.setFeedURL(feed);
        
        // 起動時と定期的に更新をチェック
        autoUpdater.checkForUpdates();
        setInterval(() => {
            autoUpdater.checkForUpdates();
        }, 10 * 60 * 1000); // 10分ごと
        
        // 更新イベントのハンドリング
        autoUpdater.on('update-available', () => {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '更新が利用可能',
                message: '新しいバージョンが利用可能です。ダウンロードしますか？',
                buttons: ['はい', 'いいえ']
            }).then((result) => {
                if (result.response === 0) {
                    autoUpdater.downloadUpdate();
                }
            });
        });
        
        autoUpdater.on('update-downloaded', () => {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '更新の準備完了',
                message: '更新がダウンロードされました。アプリを再起動して更新を適用しますか？',
                buttons: ['今すぐ再起動', '後で']
            }).then((result) => {
                if (result.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });
        
        autoUpdater.on('error', (error) => {
            console.error('自動更新エラー:', error);
        });
    } catch (error) {
        console.error('自動更新の設定エラー:', error);
    }
}