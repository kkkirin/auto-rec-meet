# Notion連携の完全自動化セットアップ方法

現在のCORS制限を解決して、Notionへの自動保存を実現する方法をご案内します。

## 問題の説明

### 1. CORS (Cross-Origin Resource Sharing) 制限
- ブラウザのセキュリティ機能により、`file://` プロトコルからNotion APIへの直接アクセスがブロックされる
- Notion APIは外部ドメインからのアクセスに制限がある

### 2. 現在の対処法
- ファイルダウンロード形式で代替
- 手動でNotionにコピー&ペーストが必要

## 完全自動化の解決策

### オプション1: HTTPSサーバーでの実行（推奨）

#### 方法A: Pythonサーバー
```bash
# プロジェクトディレクトリで実行
python3 -m http.server 8080 --bind 127.0.0.1

# アクセス先
# http://localhost:8080
```

#### 方法B: Node.jsサーバー
```bash
# http-serverをインストール
npm install -g http-server

# サーバー開始
http-server -p 8080 -c-1

# アクセス先
# http://localhost:8080
```

#### 方法C: Live Server (VS Code拡張機能)
1. VS Codeで「Live Server」拡張機能をインストール
2. `index.html` を右クリック → 「Open with Live Server」
3. 自動的にHTTPSサーバーが起動

### オプション2: Netlify/Vercelでのデプロイ

#### Netlifyの場合:
1. プロジェクトフォルダをGitHubにアップロード
2. Netlifyでリポジトリを連携
3. 自動デプロイでHTTPSアクセス可能

#### Vercelの場合:
```bash
# Vercel CLIをインストール
npm i -g vercel

# プロジェクトディレクトリでデプロイ
vercel

# HTTPSアクセス可能なURLが発行される
```

### オプション3: Cloudflare Pagesでのデプロイ

1. Cloudflare Pagesにアクセス
2. GitHubリポジトリを連携
3. 自動デプロイでCDN経由のHTTPSアクセス

## 現在の代替機能

アプリは自動的に以下の代替機能を提供します：

### 1. 自動ダウンロード
- 録音完了と同時にMarkdownファイルをダウンロード
- ファイル名: `会議録音_YYYYMMDD_HHMM.md`

### 2. ファイル構造（要約を最初に配置）
```markdown
# 会議録音 2024/07/14 15:30

**録音時間:** 05:23
**日時:** 2024/07/14 15:30

## 📋 要約
[GPTによる要約内容]

## 📝 文字起こし
[音声から変換されたテキスト]
```

### 3. 手動Notion転送手順
1. ダウンロードされたMarkdownファイルを開く
2. 内容をコピー
3. Notionページを作成
4. 内容をペースト

## 次のステップ

完全自動化を実現したい場合は、上記のいずれかの方法でHTTPSサーバー経由でアクセスしてください。

最も簡単な方法は **VS CodeのLive Server拡張機能** です。