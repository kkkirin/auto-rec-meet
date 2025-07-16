class MeetingTranscriptionApp {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.screenStream = null;
        this.micStream = null;
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = null;
        this.pausedTime = 0;
        this.recordingTimer = null;
        this.apiKey = localStorage.getItem('openai_api_key') || '';
        this.notionToken = localStorage.getItem('notion_token') || '';
        this.notionDatabaseId = localStorage.getItem('notion_database_id') || '';
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.visualizerCanvas = null;
        this.visualizerCtx = null;
        this.animationId = null;
        this.history = JSON.parse(localStorage.getItem('transcription_history') || '[]');

        this.initializeElements();
        this.setupEventListeners();
        this.initializeVisualization();
        this.displayHistory();
        this.loadApiKey();
        this.loadNotionSettings();
        this.checkElectronEnvironment();
    }

    initializeElements() {
        this.elements = {
            apiKey: document.getElementById('apiKey'),
            saveApiKey: document.getElementById('saveApiKey'),
            apiKeyStatus: document.getElementById('apiKeyStatus'),
            audioSource: document.getElementById('audioSource'),
            startRecording: document.getElementById('startRecording'),
            stopRecording: document.getElementById('stopRecording'),
            pauseRecording: document.getElementById('pauseRecording'),
            recordingStatus: document.getElementById('recordingStatus'),
            recordingTime: document.getElementById('recordingTime'),
            autoTranscribe: document.getElementById('autoTranscribe'),
            autoSummarize: document.getElementById('autoSummarize'),
            autoSaveToNotion: document.getElementById('autoSaveToNotion'),
            notionToken: document.getElementById('notionToken'),
            notionDatabaseId: document.getElementById('notionDatabaseId'),
            saveNotionSettings: document.getElementById('saveNotionSettings'),
            notionStatus: document.getElementById('notionStatus'),
            language: document.getElementById('language'),
            transcriptionResult: document.getElementById('transcriptionResult'),
            summaryResult: document.getElementById('summaryResult'),
            copyTranscription: document.getElementById('copyTranscription'),
            downloadTranscription: document.getElementById('downloadTranscription'),
            copySummary: document.getElementById('copySummary'),
            downloadSummary: document.getElementById('downloadSummary'),
            historyList: document.getElementById('historyList'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingMessage: document.getElementById('loadingMessage'),
            visualizer: document.getElementById('visualizer')
        };

        this.visualizerCanvas = this.elements.visualizer;
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
    }

    setupEventListeners() {
        this.elements.saveApiKey.addEventListener('click', () => this.saveApiKey());
        this.elements.startRecording.addEventListener('click', () => this.startRecording());
        this.elements.stopRecording.addEventListener('click', () => this.stopRecording());
        this.elements.pauseRecording.addEventListener('click', () => this.pauseRecording());
        this.elements.copyTranscription.addEventListener('click', () => this.copyToClipboard('transcription'));
        this.elements.downloadTranscription.addEventListener('click', () => this.downloadText('transcription'));
        this.elements.copySummary.addEventListener('click', () => this.copyToClipboard('summary'));
        this.elements.downloadSummary.addEventListener('click', () => this.downloadText('summary'));
        this.elements.saveNotionSettings.addEventListener('click', () => this.saveNotionSettings());

        // タブ切り替え
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Enter キーでAPI保存
        this.elements.apiKey.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveApiKey();
            }
        });
    }

    initializeVisualization() {
        this.visualizerCtx.fillStyle = '#f7fafc';
        this.visualizerCtx.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
    }

    async loadApiKey() {
        // Electronアプリの場合は安全なストレージから取得
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.getApiKey('openai-api-key');
                if (result.success && result.apiKey) {
                    this.apiKey = result.apiKey;
                    this.elements.apiKey.value = result.apiKey;
                    this.elements.apiKeyStatus.textContent = 'API Keyが安全に保存されています';
                    this.elements.apiKeyStatus.className = 'status-message success';
                }
            } catch (error) {
                console.error('API Key読み込みエラー:', error);
            }
        } else {
            // ブラウザの場合はlocalStorageから取得
            if (this.apiKey) {
                this.elements.apiKey.value = this.apiKey;
                this.elements.apiKeyStatus.textContent = 'API Keyが保存されています';
                this.elements.apiKeyStatus.className = 'status-message success';
            }
        }
    }

    async saveApiKey() {
        const apiKey = this.elements.apiKey.value.trim();
        if (!apiKey) {
            this.showMessage('API Keyを入力してください', 'error');
            return;
        }

        if (!apiKey.startsWith('sk-')) {
            this.showMessage('無効なAPI Keyです', 'error');
            return;
        }

        this.apiKey = apiKey;
        
        // Electronアプリの場合は安全なストレージに保存
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.saveApiKey('openai-api-key', apiKey);
                if (result.success) {
                    this.showMessage('API Keyが安全に保存されました', 'success');
                } else {
                    this.showMessage('API Key保存に失敗しました', 'error');
                }
            } catch (error) {
                console.error('API Key保存エラー:', error);
                this.showMessage('API Key保存エラー', 'error');
            }
        } else {
            // ブラウザの場合はlocalStorageに保存
            localStorage.setItem('openai_api_key', apiKey);
            this.showMessage('API Keyが保存されました', 'success');
        }
    }

    async loadNotionSettings() {
        // Electronアプリの場合は安全なストレージから取得
        if (window.electronAPI) {
            try {
                const tokenResult = await window.electronAPI.getApiKey('notion-token');
                const dbResult = await window.electronAPI.getApiKey('notion-database-id');
                
                if (tokenResult.success && tokenResult.apiKey) {
                    this.notionToken = tokenResult.apiKey;
                    this.elements.notionToken.value = tokenResult.apiKey;
                }
                
                if (dbResult.success && dbResult.apiKey) {
                    this.notionDatabaseId = dbResult.apiKey;
                    this.elements.notionDatabaseId.value = dbResult.apiKey;
                }
                
                if (this.notionToken && this.notionDatabaseId) {
                    this.showNotionMessage('Notion設定が安全に保存されています', 'success');
                }
            } catch (error) {
                console.error('Notion設定読み込みエラー:', error);
            }
        } else {
            // ブラウザの場合はlocalStorageから取得
            if (this.notionToken) {
                this.elements.notionToken.value = this.notionToken;
            }
            if (this.notionDatabaseId) {
                this.elements.notionDatabaseId.value = this.notionDatabaseId;
            }
            if (this.notionToken && this.notionDatabaseId) {
                this.showNotionMessage('Notion設定が保存されています', 'success');
            }
        }
    }

    async saveNotionSettings() {
        const notionToken = this.elements.notionToken.value.trim();
        const notionDatabaseId = this.elements.notionDatabaseId.value.trim();
        
        if (!notionToken || !notionDatabaseId) {
            this.showNotionMessage('Notion TokenとDatabase IDを入力してください', 'error');
            return;
        }

        this.notionToken = notionToken;
        this.notionDatabaseId = notionDatabaseId;
        
        // Electronアプリの場合は安全なストレージに保存
        if (window.electronAPI) {
            try {
                const tokenResult = await window.electronAPI.saveApiKey('notion-token', notionToken);
                const dbResult = await window.electronAPI.saveApiKey('notion-database-id', notionDatabaseId);
                
                if (tokenResult.success && dbResult.success) {
                    this.showNotionMessage('Notion設定が安全に保存されました', 'success');
                } else {
                    this.showNotionMessage('Notion設定保存に失敗しました', 'error');
                }
            } catch (error) {
                console.error('Notion設定保存エラー:', error);
                this.showNotionMessage('Notion設定保存エラー', 'error');
            }
        } else {
            // ブラウザの場合はlocalStorageに保存
            localStorage.setItem('notion_token', notionToken);
            localStorage.setItem('notion_database_id', notionDatabaseId);
            this.showNotionMessage('Notion設定が保存されました', 'success');
        }
    }

    showMessage(message, type) {
        this.elements.apiKeyStatus.textContent = message;
        this.elements.apiKeyStatus.className = `status-message ${type}`;
    }

    showNotionMessage(message, type) {
        this.elements.notionStatus.textContent = message;
        this.elements.notionStatus.className = `status-message ${type}`;
    }

    async startRecording() {
        if (!this.apiKey) {
            this.showMessage('API Keyを設定してください', 'error');
            return;
        }

        try {
            const audioSource = this.elements.audioSource.value;
            
            if (audioSource === 'microphone') {
                this.stream = await this.getMicrophoneStream();
            } else if (audioSource === 'screen') {
                // 画面共有の重要な注意事項を事前に表示
                const proceed = confirm('🎯 画面共有録音の準備\n\n次に表示される画面共有ダイアログで：\n\n1. 「画面全体」または「Google Meetのウィンドウ」を選択\n2. 「音声を共有」にチェック ✅\n3. 共有ボタンをクリック\n\n💡 Electronアプリでは：\n- ブラウザの「タブ」ではなく「デスクトップ」や「ウィンドウ」を選択してください\n- Google Meetを開いているウィンドウを選択すると音声も録音されます\n\n⚠️ 事前に画面収録権限の設定が必要です\n\n準備はよろしいですか？');
                if (!proceed) return;
                
                this.stream = await this.getScreenAudioStream();
            } else if (audioSource === 'both') {
                // 両方の場合も同様の注意を表示
                const proceed = confirm('🎯 マイク + 画面共有録音の準備\n\n次に表示される画面共有ダイアログで：\n\n1. 「画面全体」または「Google Meetのウィンドウ」を選択\n2. 「音声を共有」にチェック ✅\n3. 共有ボタンをクリック\n\n💡 Electronアプリでは：\n- ブラウザの「タブ」ではなく「デスクトップ」や「ウィンドウ」を選択してください\n- Google Meetを開いているウィンドウを選択すると音声も録音されます\n\n⚠️ 事前に画面収録権限の設定が必要です\n\n準備はよろしいですか？');
                if (!proceed) return;
                
                this.stream = await this.getMixedAudioStream();
            }

            this.setupAudioContext();
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            this.mediaRecorder.start(1000);
            this.isRecording = true;
            this.startTime = Date.now();
            this.pausedTime = 0;
            
            this.updateUI();
            this.startTimer();
            this.startVisualization();

        } catch (error) {
            console.error('録音開始エラー:', error);
            this.handleRecordingError(error);
        }
    }

    setupAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.analyser);
        
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    startVisualization() {
        const draw = () => {
            if (!this.isRecording) return;

            this.analyser.getByteFrequencyData(this.dataArray);
            
            this.visualizerCtx.fillStyle = '#f7fafc';
            this.visualizerCtx.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
            
            const barWidth = this.visualizerCanvas.width / this.dataArray.length;
            let x = 0;
            
            for (let i = 0; i < this.dataArray.length; i++) {
                const barHeight = (this.dataArray[i] / 255) * this.visualizerCanvas.height;
                
                this.visualizerCtx.fillStyle = `hsl(${230 + (i * 2)}, 70%, 60%)`;
                this.visualizerCtx.fillRect(x, this.visualizerCanvas.height - barHeight, barWidth, barHeight);
                
                x += barWidth;
            }
            
            this.animationId = requestAnimationFrame(draw);
        };
        
        draw();
    }

    pauseRecording() {
        if (this.mediaRecorder && this.isRecording) {
            if (this.isPaused) {
                this.mediaRecorder.resume();
                this.isPaused = false;
                this.startTime = Date.now() - this.pausedTime;
                this.startTimer();
                this.startVisualization();
            } else {
                this.mediaRecorder.pause();
                this.isPaused = true;
                this.pausedTime = Date.now() - this.startTime;
                this.stopTimer();
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                }
            }
            this.updateUI();
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isPaused = false;
            
            // すべてのストリームを停止
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            if (this.micStream) {
                this.micStream.getTracks().forEach(track => track.stop());
            }
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
            }
            
            this.stopTimer();
            
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
            
            if (this.audioContext) {
                this.audioContext.close();
            }
            
            // システムオーディオ録音も停止
            this.stopSystemAudioRecording();
            
            this.updateUI();
        }
    }

    updateUI() {
        this.elements.startRecording.disabled = this.isRecording;
        this.elements.stopRecording.disabled = !this.isRecording;
        this.elements.pauseRecording.disabled = !this.isRecording;
        
        if (this.isRecording) {
            this.elements.recordingStatus.textContent = this.isPaused ? '一時停止中' : '録音中';
            this.elements.recordingStatus.className = this.isPaused ? 'paused' : 'recording';
            this.elements.pauseRecording.textContent = this.isPaused ? '再開' : '一時停止';
        } else {
            this.elements.recordingStatus.textContent = '待機中';
            this.elements.recordingStatus.className = '';
            this.elements.pauseRecording.textContent = '一時停止';
        }
    }

    startTimer() {
        this.recordingTimer = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            this.elements.recordingTime.textContent = this.formatTime(elapsed);
        }, 1000);
    }

    stopTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async processRecording() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
        const duration = this.pausedTime || (Date.now() - this.startTime);
        
        const recordingData = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            duration: duration,
            blob: audioBlob,
            transcription: null,
            summary: null
        };

        if (this.elements.autoTranscribe.checked) {
            await this.transcribeAudio(recordingData);
        }

        this.saveToHistory(recordingData);
        this.displayHistory();
        
        // Notionに自動保存
        if (this.elements.autoSaveToNotion.checked && this.notionToken && this.notionDatabaseId) {
            await this.saveToNotion(recordingData);
        }
        
        this.elements.recordingTime.textContent = '00:00';
    }

    async transcribeAudio(recordingData) {
        this.showLoading('音声を文字起こし中...');
        
        try {
            const formData = new FormData();
            formData.append('file', recordingData.blob, 'recording.webm');
            formData.append('model', 'whisper-1');
            formData.append('language', this.elements.language.value === 'auto' ? '' : this.elements.language.value);
            formData.append('response_format', 'json');

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            recordingData.transcription = result.text;
            
            this.elements.transcriptionResult.innerHTML = `<p>${result.text}</p>`;
            this.switchTab('transcription');

            if (this.elements.autoSummarize.checked) {
                await this.summarizeText(recordingData);
            }

        } catch (error) {
            console.error('文字起こしエラー:', error);
            this.elements.transcriptionResult.innerHTML = `<p class="error">エラーが発生しました: ${error.message}</p>`;
        } finally {
            this.hideLoading();
        }
    }

    async summarizeText(recordingData) {
        if (!recordingData.transcription) return;

        this.showLoading('要約を生成中...');
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [
                        {
                            role: 'system',
                            content: 'あなたは会議の内容を要約する専門家です。以下の文字起こしテキストを読んで、重要なポイントを箇条書きで整理し、簡潔で分かりやすい要約を作成してください。'
                        },
                        {
                            role: 'user',
                            content: recordingData.transcription
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            recordingData.summary = result.choices[0].message.content;
            
            this.elements.summaryResult.innerHTML = `<div>${result.choices[0].message.content.replace(/\n/g, '<br>')}</div>`;

        } catch (error) {
            console.error('要約エラー:', error);
            this.elements.summaryResult.innerHTML = `<p class="error">エラーが発生しました: ${error.message}</p>`;
        } finally {
            this.hideLoading();
        }
    }

    saveToHistory(recordingData) {
        this.history.unshift({
            id: recordingData.id,
            date: recordingData.date,
            duration: recordingData.duration,
            transcription: recordingData.transcription,
            summary: recordingData.summary
        });

        if (this.history.length > 50) {
            this.history = this.history.slice(0, 50);
        }

        localStorage.setItem('transcription_history', JSON.stringify(this.history));
    }

    displayHistory() {
        if (this.history.length === 0) {
            this.elements.historyList.innerHTML = '<p class="placeholder">録音履歴がここに表示されます。</p>';
            return;
        }

        const historyHTML = this.history.map(item => {
            const date = new Date(item.date).toLocaleString('ja-JP');
            const duration = this.formatTime(item.duration);
            const preview = item.transcription ? 
                item.transcription.substring(0, 100) + '...' : 
                '文字起こしなし';

            return `
                <div class="history-item" onclick="app.loadHistoryItem('${item.id}')">
                    <div class="history-item-header">
                        <span class="history-item-date">${date}</span>
                        <span class="history-item-duration">${duration}</span>
                    </div>
                    <div class="history-item-preview">${preview}</div>
                </div>
            `;
        }).join('');

        this.elements.historyList.innerHTML = historyHTML;
    }

    loadHistoryItem(id) {
        const item = this.history.find(h => h.id === id);
        if (!item) return;

        if (item.transcription) {
            this.elements.transcriptionResult.innerHTML = `<p>${item.transcription}</p>`;
        }

        if (item.summary) {
            this.elements.summaryResult.innerHTML = `<div>${item.summary.replace(/\n/g, '<br>')}</div>`;
        }

        this.switchTab('transcription');
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    async copyToClipboard(type) {
        const content = type === 'transcription' ? 
            this.elements.transcriptionResult.textContent :
            this.elements.summaryResult.textContent;

        if (!content || content.includes('エラー') || content.includes('placeholder')) {
            alert('コピーできる内容がありません。');
            return;
        }

        try {
            await navigator.clipboard.writeText(content);
            alert('クリップボードにコピーしました。');
        } catch (error) {
            console.error('コピーエラー:', error);
            alert('コピーに失敗しました。');
        }
    }

    downloadText(type) {
        const content = type === 'transcription' ? 
            this.elements.transcriptionResult.textContent :
            this.elements.summaryResult.textContent;

        if (!content || content.includes('エラー') || content.includes('placeholder')) {
            alert('ダウンロードできる内容がありません。');
            return;
        }

        const filename = `${type}_${new Date().toISOString().split('T')[0]}.txt`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showLoading(message) {
        this.elements.loadingMessage.textContent = message;
        this.elements.loadingOverlay.classList.add('active');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.remove('active');
    }

    // マイクストリームを取得
    async getMicrophoneStream() {
        return await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
    }

    // 画面共有音声ストリームを取得
    async getScreenAudioStream() {
        try {
            // Electronアプリの場合はdesktopCapturerを使用
            if (window.electronAPI) {
                return await this.getElectronScreenStream();
            }
            
            // ブラウザの場合は従来のgetDisplayMediaを使用
            alert('⚠️ 重要: 画面共有ダイアログで「音声を共有」にチェックを入れてください。\n\nGoogle Meetなどのタブを選択する際は：\n1. タブを選択\n2. 「音声を共有」のチェックボックスにチェック\n3. 共有ボタンをクリック\n\n音声なしでは録音できません。');
            
            // 画面共有を要求（より広範囲のオプションでタブ選択を可能にする）
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,  // シンプルにtrueに戻す
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100,
                    channelCount: 2
                }
            });
            
            this.screenStream = screenStream;
            
            // ビデオトラックを停止（音声のみ必要）
            const videoTracks = screenStream.getVideoTracks();
            videoTracks.forEach(track => {
                // 画面共有が終了したときの処理を設定
                track.onended = () => {
                    if (this.isRecording) {
                        this.stopRecording();
                        alert('画面共有が終了したため、録音を停止しました。');
                    }
                };
            });
            
            // 音声トラックの詳細を確認
            const audioTracks = screenStream.getAudioTracks();
            console.log('🔊 画面共有音声トラック詳細:', audioTracks.map(track => ({
                id: track.id,
                kind: track.kind,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState,
                constraints: track.getConstraints(),
                settings: track.getSettings()
            })));
            
            if (audioTracks.length === 0) {
                console.error('❌ 音声トラックが取得できませんでした');
                throw new Error('音声トラックが取得できませんでした。画面共有時に「音声を共有」を選択してください。');
            }
            
            console.log('✅ 画面共有音声トラック取得成功:', audioTracks.length, 'トラック');
            
            // 音声トラックの状態監視
            audioTracks.forEach((track, index) => {
                track.addEventListener('ended', () => {
                    console.log(`🔇 音声トラック ${index} が終了しました`);
                });
                track.addEventListener('mute', () => {
                    console.log(`🔇 音声トラック ${index} がミュートされました`);
                });
                track.addEventListener('unmute', () => {
                    console.log(`🔊 音声トラック ${index} がアンミュートされました`);
                });
            });
            
            return screenStream;
        } catch (error) {
            console.error('画面共有エラー:', error);
            if (error.message.includes('音声トラック')) {
                alert(error.message);
            }
            throw error;
        }
    }

    // Electron用の画面共有ストリーム取得
    async getElectronScreenStream() {
        try {
            console.log('🖥️ Electronデスクトップキャプチャを開始...');
            
            // デスクトップソースを取得
            const sources = await window.electronAPI.getDesktopSources();
            console.log('📱 利用可能なソース:', sources.length);
            
            if (sources.length === 0) {
                throw new Error('キャプチャ可能なソースが見つかりません');
            }
            
            // ソース選択ダイアログを表示
            const selectedSource = await this.showSourceSelectionDialog(sources);
            if (!selectedSource) {
                throw new Error('ソースが選択されませんでした');
            }
            
            console.log('✅ 選択されたソース:', selectedSource.name);
            
            // 選択されたソースでストリームを作成
            const constraints = {
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource.id,
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource.id,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 30
                    }
                }
            };
            
            console.log('🎯 ストリーム制約:', constraints);
            
            let stream;
            try {
                // まずオーディオ + ビデオで試行
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (audioError) {
                console.warn('⚠️ オーディオ付きストリーム取得失敗、ビデオのみで再試行:', audioError);
                
                // オーディオなしで再試行
                const videoOnlyConstraints = {
                    video: constraints.video
                };
                
                try {
                    stream = await navigator.mediaDevices.getUserMedia(videoOnlyConstraints);
                    console.log('✅ ビデオのみストリーム取得成功');
                } catch (videoError) {
                    console.error('❌ ビデオストリームも取得失敗:', videoError);
                    throw new Error('選択されたソースからストリームを取得できませんでした');
                }
            }
            
            this.screenStream = stream;
            
            // ビデオトラックを停止（音声のみ必要）
            const videoTracks = stream.getVideoTracks();
            videoTracks.forEach(track => track.stop());
            
            // 音声トラックの確認
            const audioTracks = stream.getAudioTracks();
            console.log('🔊 Electron音声トラック詳細:', audioTracks.map(track => ({
                id: track.id,
                kind: track.kind,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            })));
            
            if (audioTracks.length === 0) {
                console.warn('⚠️ 直接の音声トラックが取得できませんでした。システムオーディオを試行します...');
                
                // システムオーディオを別途取得を試行
                try {
                    const systemAudioStream = await this.getSystemAudioStream();
                    if (systemAudioStream && systemAudioStream.getAudioTracks().length > 0) {
                        console.log('✅ システムオーディオ取得成功');
                        
                        // ビデオストリームとシステムオーディオを組み合わせ
                        const combinedStream = new MediaStream([
                            ...stream.getVideoTracks(),
                            ...systemAudioStream.getAudioTracks()
                        ]);
                        
                        return combinedStream;
                    }
                } catch (systemAudioError) {
                    console.warn('⚠️ システムオーディオ取得も失敗:', systemAudioError);
                }
                
                // 音声なしの場合の説明を詳しく
                console.warn('⚠️ 音声なしで継続します（画面キャプチャのみ）');
                const continueWithoutAudio = confirm('⚠️ 選択されたソースから音声が取得できませんでした。\n\n📋 可能な対処法：\n1. macOS設定で「Soundflower」や「BlackHole」などの仮想オーディオデバイスを使用\n2. 音声付きの他のソースを選択\n3. マイクのみで録音を継続\n\n➡️ マイクのみで録音を継続しますか？');
                
                if (!continueWithoutAudio) {
                    throw new Error('ユーザーが音声なし録音をキャンセルしました');
                }
            }
            
            return stream;
            
        } catch (error) {
            console.error('🚫 Electronデスクトップキャプチャエラー:', error);
            throw error;
        }
    }

    // ソース選択ダイアログを表示
    async showSourceSelectionDialog(sources) {
        return new Promise((resolve) => {
            // 簡易ダイアログを作成
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;
            
            const content = document.createElement('div');
            content.style.cssText = `
                background: white;
                border-radius: 10px;
                padding: 20px;
                max-width: 600px;
                max-height: 400px;
                overflow-y: auto;
            `;
            
            content.innerHTML = `
                <h3>🖥️ 画面共有ソースを選択</h3>
                <p>録音したい画面またはウィンドウを選択してください：</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 20px 0;">
                    ${sources.map((source, index) => `
                        <div style="border: 2px solid #ddd; border-radius: 8px; padding: 10px; cursor: pointer; text-align: center;" 
                             onclick="selectSource(${index})">
                            <img src="${source.thumbnail}" style="width: 100%; height: auto; border-radius: 4px;">
                            <div style="margin-top: 8px; font-size: 12px; word-break: break-word;">${source.name}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="text-align: center;">
                    <button onclick="selectSource(-1)" style="padding: 10px 20px; background: #ccc; border: none; border-radius: 5px; cursor: pointer;">キャンセル</button>
                </div>
            `;
            
            dialog.appendChild(content);
            document.body.appendChild(dialog);
            
            // グローバル関数を定義
            window.selectSource = (index) => {
                document.body.removeChild(dialog);
                delete window.selectSource;
                resolve(index >= 0 ? sources[index] : null);
            };
        });
    }

    // システムオーディオストリームを取得（ハイブリッドアプローチ）
    async getSystemAudioStream() {
        try {
            console.log('🔊 システムオーディオ取得を試行...');
            
            // Electronアプリの場合: ffmpegによるシステムオーディオ録音を試行
            if (window.electronAPI) {
                return await this.getSystemAudioViaFFmpeg();
            }
            
            // ブラウザの場合: Web APIを試行
            const audioConstraints = {
                audio: {
                    mandatory: {
                        chromeMediaSource: 'system',  // システムオーディオを指定
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                }
            };
            
            const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            console.log('✅ ブラウザシステムオーディオストリーム取得成功');
            return audioStream;
            
        } catch (error) {
            console.warn('⚠️ システムオーディオ取得失敗:', error);
            
            // 別の方法でシステムオーディオを試行
            try {
                const fallbackConstraints = {
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        deviceId: 'default'
                    }
                };
                
                const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                console.log('✅ フォールバック音声ストリーム取得成功');
                return fallbackStream;
                
            } catch (fallbackError) {
                console.error('❌ フォールバック音声も失敗:', fallbackError);
                throw error;
            }
        }
    }

    // ffmpeg経由でシステムオーディオを録音
    async getSystemAudioViaFFmpeg() {
        try {
            console.log('🎙️ ffmpeg経由でシステムオーディオ録音を開始...');
            
            // 一時ファイル名を生成
            const tempAudioFile = `/tmp/system_audio_${Date.now()}.wav`;
            
            // ffmpegでシステムオーディオ録音を開始
            const result = await window.electronAPI.startSystemAudioRecording(tempAudioFile);
            
            if (result.success) {
                console.log('✅ システムオーディオ録音開始成功:', result.processId);
                
                // 録音プロセスの情報を保存
                this.systemAudioRecording = {
                    processId: result.processId,
                    filePath: tempAudioFile,
                    isRecording: true
                };
                
                // ダミーの音声ストリームを作成（実際の音声は後で合成）
                const dummyStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                });
                
                return dummyStream;
            } else {
                throw new Error('ffmpegによるシステムオーディオ録音開始に失敗: ' + result.error);
            }
            
        } catch (error) {
            console.error('❌ ffmpeg経由のシステムオーディオ取得失敗:', error);
            throw error;
        }
    }

    // システムオーディオ録音を停止
    async stopSystemAudioRecording() {
        try {
            if (this.systemAudioRecording && this.systemAudioRecording.isRecording) {
                console.log('🛑 システムオーディオ録音を停止...');
                
                if (window.electronAPI) {
                    const result = await window.electronAPI.stopSystemAudioRecording();
                    if (result.success) {
                        console.log('✅ システムオーディオ録音停止成功');
                        this.systemAudioRecording.isRecording = false;
                    } else {
                        console.error('❌ システムオーディオ録音停止失敗:', result.error);
                    }
                }
            }
        } catch (error) {
            console.error('❌ システムオーディオ録音停止エラー:', error);
        }
    }

    // マイクと画面共有音声を混合
    async getMixedAudioStream() {
        try {
            // マイクストリームを取得
            this.micStream = await this.getMicrophoneStream();
            
            // 画面共有ストリームを取得
            if (window.electronAPI) {
                // Electronアプリの場合
                this.screenStream = await this.getElectronScreenStream();
            } else {
                // ブラウザの場合
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,  // シンプルにtrueに戻す
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        sampleRate: 44100,
                        channelCount: 2
                    }
                });
            }

            // 音声トラックの詳細確認
            const audioTracks = this.screenStream.getAudioTracks();
            console.log('🔊 混合ストリーム - 画面共有音声トラック詳細:', audioTracks.map(track => ({
                id: track.id,
                kind: track.kind,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState,
                constraints: track.getConstraints(),
                settings: track.getSettings()
            })));
            
            if (audioTracks.length === 0) {
                console.warn('❌ 画面共有に音声トラックがありません。マイクのみで録音します。');
                alert('⚠️ 画面共有で音声が取得できませんでした。\n\n次回は画面共有ダイアログで「音声を共有」にチェックを入れてください。\n\n現在はマイクの音声のみで録音を続行します。');
                return this.micStream;
            }
            
            console.log('✅ 画面共有の音声トラックが正常に取得されました:', audioTracks.length, 'トラック');

            // AudioContextを作成
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 音声ソースを作成
            const micSource = audioContext.createMediaStreamSource(this.micStream);
            const screenSource = audioContext.createMediaStreamSource(this.screenStream);
            
            console.log('🎤 マイクソース作成:', micSource);
            console.log('🖥️ 画面音声ソース作成:', screenSource);
            
            // 音声レベル監視用のAnalyserNodeを追加
            const micAnalyser = audioContext.createAnalyser();
            const screenAnalyser = audioContext.createAnalyser();
            micSource.connect(micAnalyser);
            screenSource.connect(screenAnalyser);
            
            // 音声レベルの監視を開始
            const monitorAudioLevels = () => {
                const micData = new Uint8Array(micAnalyser.frequencyBinCount);
                const screenData = new Uint8Array(screenAnalyser.frequencyBinCount);
                
                micAnalyser.getByteFrequencyData(micData);
                screenAnalyser.getByteFrequencyData(screenData);
                
                const micLevel = Math.max(...micData);
                const screenLevel = Math.max(...screenData);
                
                if (micLevel > 0 || screenLevel > 0) {
                    console.log(`🔊 音声レベル - マイク: ${micLevel}, 画面: ${screenLevel}`);
                }
            };
            
            // 1秒ごとに音声レベルをチェック
            const levelMonitor = setInterval(monitorAudioLevels, 1000);
            
            // 録音停止時にクリーンアップ
            const originalStop = this.stopRecording.bind(this);
            this.stopRecording = () => {
                clearInterval(levelMonitor);
                this.stopRecording = originalStop;
                originalStop();
            };
            
            // ミキサーを作成（音量調整）
            const mixer = audioContext.createGain();
            const micGain = audioContext.createGain();
            const screenGain = audioContext.createGain();
            
            // 音量バランス調整
            micGain.gain.value = 0.7;  // マイク音量を少し下げる
            screenGain.gain.value = 1.0;  // 画面共有音声は標準
            
            micSource.connect(micGain);
            screenSource.connect(screenGain);
            micGain.connect(mixer);
            screenGain.connect(mixer);
            
            // 出力ストリームを作成
            const destination = audioContext.createMediaStreamDestination();
            mixer.connect(destination);
            
            // 画面共有終了時の処理（ビデオとオーディオ両方を監視）
            const allTracks = [...this.screenStream.getVideoTracks(), ...this.screenStream.getAudioTracks()];
            
            // 終了処理フラグ（重複実行防止）
            let hasEnded = false;
            
            const handleTrackEnd = () => {
                if (!hasEnded && this.isRecording) {
                    hasEnded = true;
                    console.log('画面共有終了を検知');
                    this.stopRecording();
                    
                    // 通知を表示（よりユーザーフレンドリーに）
                    this.showNotification('画面共有が終了したため、録音を停止しました。', 'info');
                }
            };
            
            allTracks.forEach(track => {
                track.onended = handleTrackEnd;
                
                // 追加：トラックの状態も監視
                track.addEventListener('mute', () => {
                    console.log(`トラック ${track.kind} がミュートされました`);
                });
                
                // 追加：トラックのreadyState監視
                const checkTrackState = setInterval(() => {
                    if (track.readyState === 'ended') {
                        clearInterval(checkTrackState);
                        handleTrackEnd();
                    }
                }, 1000);
            });
            
            console.log('混合音声ストリーム作成成功');
            return destination.stream;
            
        } catch (error) {
            // 画面共有に失敗した場合はマイクのみ
            console.error('🚫 画面共有エラーの詳細:', {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            
            if (error.name === 'NotSupportedError') {
                alert('❌ 画面共有がサポートされていません\n\n📋 解決手順：\n1. システム設定 → プライバシーとセキュリティ → 画面収録\n2. 🔒をクリックしてパスワード入力\n3. 「+」ボタンで「会議文字起こしアプリ」を追加\n4. アプリを完全に再起動\n\n💡 現在はマイクのみで録音を続行します');
            } else if (error.name === 'NotAllowedError') {
                alert('❌ 画面共有の権限が拒否されました\n\n📋 解決手順：\n1. システム設定 → プライバシーとセキュリティ → 画面収録\n2. 🔒をクリックしてパスワード入力\n3. 「+」ボタンで「会議文字起こしアプリ」を追加\n4. ✅チェックを入れる\n5. アプリを完全に再起動\n\n💡 現在はマイクのみで録音を続行します');
            }
            
            console.warn('⚠️ 画面共有に失敗しました。マイクのみで録音します。:', error);
            return await this.getMicrophoneStream();
        }
    }

    // Notionに保存（Electronアプリでは直接API呼び出し）
    async saveToNotion(recordingData) {
        if (!this.notionToken || !this.notionDatabaseId) {
            console.warn('Notion設定が不完全です');
            return;
        }

        this.showLoading('Notionに保存中...');

        // Electronアプリの場合はNode.jsプロセスから直接API呼び出し（CORS制限なし）
        if (window.electronAPI) {
            try {
                // recordingDataを完全にシリアライズ可能な形式に変換
                const safeRecordingData = {
                    date: recordingData.date ? String(recordingData.date) : new Date().toISOString(),
                    duration: recordingData.duration ? Number(recordingData.duration) : 0,
                    transcription: recordingData.transcription ? String(recordingData.transcription) : '',
                    summary: recordingData.summary ? String(recordingData.summary) : ''
                };
                
                console.log('Sending to IPC:', { 
                    notionToken: '***', 
                    databaseId: this.notionDatabaseId, 
                    data: safeRecordingData 
                });
                
                const result = await window.electronAPI.saveToNotion(
                    this.notionToken,
                    this.notionDatabaseId,
                    safeRecordingData
                );

                if (result.success) {
                    this.showNotionMessage('Notionに保存されました！', 'success');
                    console.log('Notion保存成功:', result.result);
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Notion保存エラー:', error);
                this.showNotionMessage(`Notion保存エラー: ${error.message}`, 'error');
                
                // エラー時の代替としてファイルダウンロード
                this.downloadNotionData(recordingData);
            } finally {
                this.hideLoading();
            }
        } else {
            // ブラウザの場合はCORS制限のためファイルダウンロードで代替
            console.log('CORS制限により、Notion APIへの直接アクセスができません。');
            this.showNotionMessage('ブラウザ版では制限があります。デスクトップアプリを使用することを推奨します。', 'error');
            this.downloadNotionData(recordingData);
            this.hideLoading();
        }
    }

    // テキストを指定した文字数で分割
    splitTextIntoChunks(text, maxLength) {
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

    // Notion保存失敗時の代替手段（要約を最初に配置）
    async downloadNotionData(recordingData) {
        const date = new Date(recordingData.date);
        const formattedDate = date.toLocaleDateString('ja-JP');
        const formattedTime = date.toLocaleTimeString('ja-JP');
        const duration = this.formatTime(recordingData.duration);
        
        let content = `# 会議録音 ${formattedDate} ${formattedTime}\n\n`;
        content += `**録音時間:** ${duration}\n`;
        content += `**日時:** ${formattedDate} ${formattedTime}\n\n`;
        
        // 要約を最初に配置
        if (recordingData.summary) {
            content += `## 📋 要約\n\n${recordingData.summary}\n\n`;
        }
        
        // その後に文字起こし
        if (recordingData.transcription) {
            content += `## 📝 文字起こし\n\n${recordingData.transcription}\n`;
        }

        const filename = `会議録音_${formattedDate.replace(/\//g, '')}_${formattedTime.replace(/:/g, '')}.md`;
        
        // Electronアプリの場合はファイル保存ダイアログを使用
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.saveFileDialog(filename, content);
                if (result.success && !result.canceled) {
                    console.log('ファイル保存完了:', result.filePath);
                }
            } catch (error) {
                console.error('ファイル保存エラー:', error);
                // フォールバックとして通常のダウンロード
                this.browserDownload(filename, content);
            }
        } else {
            // ブラウザの場合は通常のダウンロード
            this.browserDownload(filename, content);
        }
    }

    // ブラウザでのファイルダウンロード
    browserDownload(filename, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Electron環境の確認と初期化
    checkElectronEnvironment() {
        if (window.electronAPI) {
            console.log('Electronアプリとして実行中');
            this.showMessage('デスクトップアプリ版で実行中 - 完全な機能が利用可能です', 'success');
            
            // デスクトップアプリ版の特別な機能を有効化
            this.enableElectronFeatures();
        } else {
            console.log('ブラウザで実行中');
        }
    }

    // Electronアプリ特有の機能を有効化
    enableElectronFeatures() {
        // アプリ起動時に自動録音開始のオプション（将来的な拡張用）
        if (localStorage.getItem('auto-start-recording') === 'true') {
            // 自動録音開始の実装
        }
        
        // Electronアプリ版であることをUIに表示
        document.title = '🎙️ ' + document.title + ' (デスクトップ版)';
    }

    // エラーハンドリング
    handleRecordingError(error) {
        console.error('録音エラー:', error);
        
        if (error.name === 'NotAllowedError') {
            alert('マイクまたは画面共有へのアクセスが拒否されました。ブラウザの設定を確認してください。');
        } else if (error.name === 'NotFoundError') {
            alert('マイクが見つかりません。マイクが正しく接続されているか確認してください。');
        } else if (error.name === 'NotSupportedError') {
            alert('お使いのブラウザは画面共有音声の録音をサポートしていません。');
        } else {
            alert(`録音エラーが発生しました: ${error.message}`);
        }
    }

    // 通知を表示する関数
    showNotification(message, type = 'info') {
        // 通知要素を作成
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // スタイルを設定
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            opacity: 0;
            transform: translateX(100%);
        `;
        
        // タイプに応じた背景色を設定
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#10b981';
                break;
            case 'error':
                notification.style.backgroundColor = '#ef4444';
                break;
            case 'warning':
                notification.style.backgroundColor = '#f59e0b';
                break;
            default:
                notification.style.backgroundColor = '#3b82f6';
        }
        
        // 通知をDOMに追加
        document.body.appendChild(notification);
        
        // アニメーション開始
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // 5秒後に自動削除
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.parentElement.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// アプリケーションの初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MeetingTranscriptionApp();
});

// グローバル関数（HTML内のonclickで使用）
window.app = app;