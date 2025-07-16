# 会議文字起こしアプリ v3.0.0

Web会議の音声を自動で文字起こし・要約・Notion保存するデスクトップアプリです。

## 🚀 主な機能

- **音声録音**: マイク・画面共有音声・両方のミックスに対応
- **自動文字起こし**: OpenAI Whisper API を使用
- **AI要約**: GPT-4o による会議内容の要約
- **Notion連携**: 自動でNotion データベースに保存
- **クロスプラットフォーム**: macOS, Windows, Linux 対応
- **セキュアストレージ**: APIキーを暗号化して安全に保存

## 📦 インストール

### デスクトップアプリ（推奨）

1. [Releases](https://github.com/your-repo/meeting-transcription-app/releases) から最新版をダウンロード
2. ダウンロードしたファイルを実行してインストール

**macOS**: `会議文字起こしアプリ-3.0.0-arm64.dmg`
**Windows**: `会議文字起こしアプリ-3.0.0-win.exe`
**Linux**: `会議文字起こしアプリ-3.0.0.AppImage`

### ブラウザ版

```bash
# リポジトリをクローン
git clone https://github.com/your-repo/meeting-transcription-app.git
cd meeting-transcription-app

# 依存関係をインストール
npm install

# プロキシサーバーを起動
npm run start:browser

# ブラウザで http://localhost:3000 にアクセス
```

## 🛠️ 開発環境での実行

```bash
# 依存関係をインストール
npm install

# Electronアプリとして実行
npm start

# ブラウザ版として実行
npm run start:browser
```

## 🔧 ビルド方法

```bash
# 現在のプラットフォーム用にビルド
npm run build

# 全プラットフォーム用にビルド
npm run dist
```

## 📋 使用方法

### 1. 初期設定

1. **OpenAI API Key**: 文字起こしと要約に必要
2. **Notion Token**: Notion連携に必要（オプション）
3. **Notion Database ID**: 保存先データベースのID（オプション）

### 2. 録音開始

1. 音声ソースを選択:
   - **マイク**: マイクロフォンの音声のみ
   - **画面共有**: 画面共有時のタブ音声のみ
   - **両方**: マイクと画面共有音声をミックス

2. 「録音開始」ボタンをクリック
3. 画面共有を選択した場合は、「音声を共有」にチェック

### 3. 録音停止・処理

1. 「録音停止」ボタンをクリック
2. 自動的に文字起こしと要約が実行される
3. Notion連携が有効な場合は自動保存される

## 🔐 セキュリティ機能

- **暗号化ストレージ**: APIキーは AES-256-GCM で暗号化
- **マシン固有キー**: 各デバイス固有の暗号化キーを使用
- **CORS対応**: ブラウザ版でもセキュアなAPI通信

## 📁 プロジェクト構造

```
meeting-transcription-app/
├── main.js                 # Electronメインプロセス
├── preload.js             # Electronプリロードスクリプト
├── index.html             # メインHTML
├── script.js              # フロントエンドJavaScript
├── style.css              # スタイルシート
├── proxy-server.js        # ブラウザ版用プロキシサーバー
├── assets/
│   ├── icon.png           # アプリアイコン (PNG)
│   ├── icon.ico           # Windowsアイコン
│   └── icon.icns          # macOSアイコン
├── package.json           # プロジェクト設定
└── README.md              # このファイル
```

## 🛠️ 技術スタック

- **Electron**: デスクトップアプリフレームワーク
- **Node.js**: サーバーサイドランタイム
- **Express**: プロキシサーバー（ブラウザ版）
- **Web Audio API**: 音声録音・処理
- **OpenAI API**: 文字起こし・要約
- **Notion API**: データベース連携

## 🔄 更新履歴

### v3.0.0 (2024-07-16)
- 🔧 keytarの代わりに暗号化ファイルストレージを実装
- 🌐 CORS問題解決のためプロキシサーバーを追加
- 🔄 自動更新機能を実装
- 📱 Windows/Linux版ビルド設定を追加
- 🎯 Google Meet終了検知の安定化
- 🧪 包括的なテストスイートを追加

### v2.0.0
- Electronアプリ化
- Notion連携機能の追加
- セキュアストレージの実装

### v1.0.0
- 基本的な録音・文字起こし機能
- ブラウザ版のみ対応

## 📞 サポート

- **Issues**: [GitHub Issues](https://github.com/your-repo/meeting-transcription-app/issues)
- **Discord**: [コミュニティサーバー](https://discord.gg/your-server)
- **Email**: support@your-domain.com

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 🙏 謝辞

- OpenAI: Whisper API と GPT-4o API
- Notion: Notion API
- Electron: デスクトップアプリフレームワーク
- すべてのコントリビューターとユーザーの皆様