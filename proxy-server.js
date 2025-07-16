const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const HTTPS_PORT = 3443;

// CORS設定
app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Notion APIプロキシエンドポイント
app.post('/api/notion/*', async (req, res) => {
    try {
        const notionPath = req.params[0];
        const notionUrl = `https://api.notion.com/v1/${notionPath}`;
        
        const response = await fetch(notionUrl, {
            method: req.method,
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Notion APIプロキシエラー:', error);
        res.status(500).json({ error: error.message });
    }
});

// 自己署名証明書の生成（開発用）
const generateCertificate = () => {
    const { execSync } = require('child_process');
    const certDir = path.join(__dirname, 'certs');
    
    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir);
    }
    
    const keyPath = path.join(certDir, 'server.key');
    const certPath = path.join(certDir, 'server.crt');
    
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.log('自己署名証明書を生成中...');
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/C=JP/ST=Tokyo/L=Tokyo/O=MeetingTranscription/CN=localhost"`);
        console.log('証明書生成完了');
    }
    
    return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
};

// HTTPサーバー起動
app.listen(PORT, () => {
    console.log(`HTTPプロキシサーバー起動: http://localhost:${PORT}`);
});

// HTTPSサーバー起動（必要に応じて）
try {
    const credentials = generateCertificate();
    https.createServer(credentials, app).listen(HTTPS_PORT, () => {
        console.log(`HTTPSプロキシサーバー起動: https://localhost:${HTTPS_PORT}`);
        console.log('注意: 自己署名証明書を使用しています。ブラウザで警告が表示されます。');
    });
} catch (error) {
    console.log('HTTPSサーバーの起動をスキップ:', error.message);
}

console.log('\nブラウザ版を使用する場合:');
console.log(`1. このプロキシサーバーを起動したまま`);
console.log(`2. http://localhost:${PORT} でアプリにアクセス`);
console.log(`3. Notion API呼び出しは自動的にプロキシ経由で実行されます\n`);