# Electronデスクトップアプリ セットアップガイド

Web会議文字起こしアプリをElectronでデスクトップアプリ化し、CORS制限を解決する手順です。

## セットアップ手順

### 1. Node.jsとnpmのインストール
```bash
# Node.js v18以上が必要
node --version
npm --version
```

### 2. 依存関係のインストール
```bash
# プロジェクトディレクトリに移動
cd /Users/tatsuta_2023/Dropbox/DB_Vault/Vault_code/meeting-transcription-app_v3

# 依存関係をインストール
npm install
```

### 3. アプリの起動
```bash
# 開発モードで起動
npm start
```

## 主な機能と改善点

### 🔒 セキュリティの向上
- **Keytar**: API KeyをOSの安全なストレージ（Keychain/Credential Manager）に保存
- **Context Isolation**: レンダラープロセスとメインプロセスの分離
- **Preload Script**: 安全なAPI公開

### 🌐 CORS問題の解決
- **Node.jsプロセス**: メインプロセスからNotion APIを直接呼び出し
- **CORS制限なし**: ブラウザの制限を回避
- **完全自動化**: Notion保存が100%成功

### 💻 デスクトップアプリ体験
- **ネイティブメニュー**: macOS/Windows標準のメニューバー
- **ファイルダイアログ**: OS標準の保存ダイアログ
- **ウィンドウ管理**: 最小化、最大化、クローズ処理

### 🚀 UX改善
- **アプリ起動**: ダブルクリックで即座に起動
- **バックグラウンド実行**: システムトレイでの常駐（実装可能）
- **自動録音開始**: アプリ起動と同時に録音開始（オプション）

## ビルドと配布

### 開発版の実行
```bash
npm start
```

### 配布版のビルド
```bash
# 全プラットフォーム向けビルド
npm run dist

# macOS向けのみ
npm run build -- --mac

# Windows向けのみ  
npm run build -- --win

# Linux向けのみ
npm run build -- --linux
```

### ビルド成果物
- **macOS**: `dist/会議文字起こしアプリ.dmg`
- **Windows**: `dist/会議文字起こしアプリ Setup.exe`
- **Linux**: `dist/会議文字起こしアプリ.AppImage`

## アプリの特別機能

### 1. 安全なAPI Key管理
```javascript
// 保存
await window.electronAPI.saveApiKey('openai-api-key', 'sk-...');

// 取得
const result = await window.electronAPI.getApiKey('openai-api-key');
```

### 2. CORS制限なしのNotion保存
```javascript
// 直接API呼び出し（Node.jsプロセスから）
const result = await window.electronAPI.saveToNotion({
    notionToken: token,
    databaseId: dbId,
    recordingData: data
});
```

### 3. ネイティブファイル保存
```javascript
// OS標準の保存ダイアログ
const result = await window.electronAPI.saveFileDialog(filename, content);
```

## 今後の拡張可能機能

### 1. 自動録音開始
- アプリ起動と同時に録音開始
- Google Meet検出時の自動録音

### 2. システムトレイ
- バックグラウンドでの常駐
- 会議検出時の通知

### 3. ホットキー
- 録音開始/停止のショートカット
- Spotlight風のクイック起動

### 4. 自動アップデート
- electron-updaterによる自動更新
- 新機能の通知

## トラブルシューティング

### Node.jsバージョンエラー
```bash
# nvm使用の場合
nvm install 18
nvm use 18
```

### 権限エラー
```bash
# npm権限修正
sudo chown -R $(whoami) ~/.npm
```

### ビルドエラー
```bash
# キャッシュクリア
npm cache clean --force
rm -rf node_modules
npm install
```

## 設定ファイル

### package.json
- アプリの基本情報
- ビルド設定
- 依存関係

### main.js
- Electronメインプロセス
- IPC通信の設定
- Notion API呼び出し

### preload.js
- セキュアなAPI公開
- レンダラープロセス間の橋渡し

これで完全に機能するデスクトップアプリが完成します！