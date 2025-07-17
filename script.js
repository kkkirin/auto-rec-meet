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
        this.screenCaptureCloseHandler = null; // 画面キャプチャウィンドウ閉鎖ハンドラー
        this.currentRecordingData = null; // 現在の録音データを保存
        this.separateRecording = {
            micBlob: null,
            screenBlob: null,
            micRecorder: null,
            screenRecorder: null,
            isActive: false // 別々録音モードの状態
        }; // 別々録音用データ
        this.history = JSON.parse(localStorage.getItem('transcription_history') || '[]');

        this.initializeElements();
        this.setupEventListeners();
        this.initializeVisualization();
        this.displayHistory();
        this.loadApiKey();
        this.loadNotionSettings();
        this.checkElectronEnvironment();
        this.setupScreenCaptureMonitoring();
        this.setupCleanupHandlers();
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
            downloadAudio: document.getElementById('downloadAudio'),
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
        this.elements.downloadAudio.addEventListener('click', () => this.downloadCurrentAudio());
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
            console.log('🎤 録音開始処理を開始...');
            const audioSource = this.elements.audioSource.value;
            console.log('📻 選択された音声ソース:', audioSource);
            
            if (audioSource === 'microphone') {
                console.log('🎤 マイクストリームを取得中...');
                this.stream = await this.getMicrophoneStream();
            } else if (audioSource === 'screen') {
                // 画面共有の重要な注意事項を事前に表示
                const proceed = confirm('🎯 画面共有録音の準備\n\n次に表示される画面共有ダイアログで：\n\n1. 「画面全体」または「Google Meetのウィンドウ」を選択\n2. 「音声を共有」にチェック ✅\n3. 共有ボタンをクリック\n\n💡 Electronアプリでは：\n- ブラウザの「タブ」ではなく「デスクトップ」や「ウィンドウ」を選択してください\n- Google Meetを開いているウィンドウを選択すると音声も録音されます\n\n⚠️ 事前に画面収録権限の設定が必要です\n\n準備はよろしいですか？');
                if (!proceed) return;
                
                console.log('🖥️ 画面共有ストリームを取得中...');
                this.stream = await this.getScreenAudioStream();
            } else if (audioSource === 'both') {
                // 両方の場合も同様の注意を表示
                const proceed = confirm('🎯 マイク + 画面共有録音の準備\n\n次に表示される画面共有ダイアログで：\n\n1. 「画面全体」または「Google Meetのウィンドウ」を選択\n2. 「音声を共有」にチェック ✅\n3. 共有ボタンをクリック\n\n💡 Electronアプリでは：\n- ブラウザの「タブ」ではなく「デスクトップ」や「ウィンドウ」を選択してください\n- Google Meetを開いているウィンドウを選択すると音声も録音されます\n\n⚠️ 事前に画面収録権限の設定が必要です\n\n準備はよろしいですか？');
                if (!proceed) return;
                
                console.log('🎯 マイク + 画面共有ストリームを取得中...');
                this.stream = await this.getMixedAudioStream();
            } else if (audioSource === 'separate') {
                // 別々録音モード
                const proceed = confirm('🎤 別々録音モード\n\nこのモードでは：\n・ マイク音声と相手の音声を別々に録音\n・ それぞれ別々に文字起こし\n・ 話者を区別した記録を作成\n\n⚠️ 重要：\n・ Google Meetの画面共有で「音声を共有」にチェックが必要\n・ マイクの音量を適切に設定してください\n・ 会議終了時に手動で録音停止してください\n\n準備はよろしいですか？');
                if (!proceed) return;
                
                console.log('🎤 別々録音モードを開始...');
                await this.startSeparateRecording();
                return; // 別途処理するのでここで終了
            }

            // ストリーム取得の確認
            if (!this.stream) {
                throw new Error('ストリームの取得に失敗しました');
            }
            
            console.log('✅ ストリーム取得成功');
            console.log('📊 ストリーム情報:', {
                audioTracks: this.stream.getAudioTracks().length,
                videoTracks: this.stream.getVideoTracks().length,
                active: this.stream.active
            });

            // ストリームの状態監視を追加
            this.stream.addEventListener('inactive', () => {
                console.log('⚠️ ストリームが非アクティブになりました');
                if (this.isRecording) {
                    console.log('🛑 ストリーム停止により録音を終了します');
                    this.stopRecording();
                }
            });

            this.setupAudioContext();
            // 高品質録音設定 - MP4を優先
            const options = { audioBitsPerSecond: 128000 };
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options.mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options.mimeType = 'audio/webm;codecs=opus';
            }
            
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            console.log('🎤 MediaRecorder初期化完了:', options);

            // 新しい録音のために前回のデータをクリア
            this.currentRecordingData = null;
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('📦 データ受信:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                console.log('⏹️ MediaRecorder停止 - 処理を開始');
                this.processRecording();
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('❌ MediaRecorderエラー:', event.error);
                this.handleRecordingError(event.error);
            };

            this.mediaRecorder.start(5000); // 5秒間隔でデータ収集（安定性向上）
            console.log('🎬 MediaRecorder開始');
            
            this.isRecording = true;
            this.startTime = Date.now();
            this.pausedTime = 0;
            
            this.updateUI();
            this.startTimer();
            this.startVisualization();

            console.log('✅ 録音開始完了');

        } catch (error) {
            console.error('録音開始エラー:', error);
            this.handleRecordingError(error);
        }
    }

    setupAudioContext() {
        if (!this.stream) {
            console.error('❌ setupAudioContext: streamが設定されていません');
            return;
        }
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.analyser);
        
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    setupSeparateAudioContext() {
        if (!this.micStream) {
            console.error('❌ setupSeparateAudioContext: micStreamが設定されていません');
            return;
        }
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            const source = this.audioContext.createMediaStreamSource(this.micStream);
            source.connect(this.analyser);
            
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            console.log('✅ 別々録音用AudioContext設定完了');
        } catch (error) {
            console.error('❌ setupSeparateAudioContext エラー:', error);
        }
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
        console.log('🛑 stopRecording() 呼び出し - 現在の状態:', {
            isRecording: this.isRecording,
            mediaRecorder: this.mediaRecorder ? this.mediaRecorder.state : 'none',
            separateIsActive: this.separateRecording.isActive,
            micRecorder: this.separateRecording.micRecorder ? this.separateRecording.micRecorder.state : 'none',
            screenRecorder: this.separateRecording.screenRecorder ? this.separateRecording.screenRecorder.state : 'none'
        });
        
        // 多重実行を防止
        if (!this.isRecording) {
            console.log('🚫 録音停止: 既に停止済み');
            return;
        }
        
        console.log('🛑 録音を停止しています...');
        
        // 通常の録音を停止
        if (this.mediaRecorder) {
            console.log('⏹️ MediaRecorder状態:', this.mediaRecorder.state);
            if (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused') {
                this.mediaRecorder.stop();
                console.log('✅ MediaRecorder停止完了');
            }
        }
        
        // 別々録音を停止
        if (this.separateRecording.micRecorder && this.separateRecording.micRecorder.state === 'recording') {
            this.separateRecording.micRecorder.stop();
            console.log('🎤 マイク録音を停止しました');
        }
        
        if (this.separateRecording.screenRecorder && this.separateRecording.screenRecorder.state === 'recording') {
            this.separateRecording.screenRecorder.stop();
            console.log('💻 画面音声録音を停止しました');
        }
        
        // 別々録音モードを無効化
        if (this.separateRecording.isActive) {
            this.separateRecording.isActive = false;
            console.log('🎤 別々録音モードを終了しました');
        }
        
        // 強制的に状態をリセット（「止まらない」問題を解決）
        this.isRecording = false;
        this.isPaused = false;
        console.log('🔄 録音状態をリセット');
        
        // すべてのストリームを停止
        if (this.stream) {
            console.log('🔌 メインストリームを停止中...');
            this.stream.getTracks().forEach(track => {
                console.log('🔌 トラック停止:', track.kind, track.label);
                track.stop();
            });
            this.stream = null;
        }
        if (this.micStream) {
            console.log('🔌 マイクストリームを停止中...');
            this.micStream.getTracks().forEach(track => {
                console.log('🔌 マイクトラック停止:', track.kind, track.label);
                track.stop();
            });
            this.micStream = null;
        }
        if (this.screenStream) {
            console.log('🔌 画面ストリームを停止中...');
            this.screenStream.getTracks().forEach(track => {
                console.log('🔌 画面トラック停止:', track.kind, track.label);
                track.stop();
            });
            this.screenStream = null;
        }
        
        this.stopTimer();
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // システムオーディオ録音も停止
        this.stopSystemAudioRecording();
        
        // 画面共有ウィンドウ監視を停止（必ず実行）
        if (window.electronAPI) {
            window.electronAPI.stopScreenCaptureMonitoring();
        }
        
        this.updateUI();
    }

    updateUI() {
        this.elements.startRecording.disabled = this.isRecording;
        this.elements.stopRecording.disabled = !this.isRecording;
        this.elements.pauseRecording.disabled = !this.isRecording;
        this.elements.downloadAudio.disabled = !this.currentRecordingData;
        
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
        // 録音時に使用したMIMEタイプでBlobを作成
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm;codecs=opus';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        const duration = this.pausedTime || (Date.now() - this.startTime);
        
        console.log('📦 通常録音完了 - ファイル形式:', {
            mimeType: mimeType,
            size: audioBlob.size,
            duration: duration
        });
        
        const recordingData = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            duration: duration,
            blob: audioBlob,
            transcription: null,
            summary: null
        };
        
        // 現在の録音データを保存（オーディオダウンロード用）
        this.currentRecordingData = recordingData;

        if (this.elements.autoTranscribe.checked) {
            await this.transcribeAudio(recordingData);
        }

        // システムオーディオの文字起こしも処理
        if (this.systemAudioRecording && this.systemAudioRecording.filePath) {
            console.log('🎯 システムオーディオを文字起こしします (YouTube, Google Meet等の音声)');
            await this.transcribeSystemAudio(recordingData);
        } else {
            console.log('⚠️ システムオーディオが録音されていません。BlackHole設定を確認してください。');
        }

        this.saveToHistory(recordingData);
        this.displayHistory();
        
        // Notionに自動保存
        if (this.elements.autoSaveToNotion.checked && this.notionToken && this.notionDatabaseId) {
            await this.saveToNotion(recordingData);
        }
        
        this.elements.recordingTime.textContent = '00:00';
        
        // 録音完了後にUIを更新（音声ダウンロードボタンを有効化）
        this.updateUI();
        console.log('✅ 録音処理完了 - 音声ダウンロードが可能です');
    }
    
    // 別々文字起こし機能
    async transcribeSeparateAudio(recordingData) {
        this.showLoading('マイクと相手の音声を別々に文字起こし中...');
        
        try {
            // マイク音声の文字起こし
            if (recordingData.micBlob) {
                console.log('🎤 マイク音声を文字起こし中...');
                const micFormData = new FormData();
                micFormData.append('file', recordingData.micBlob, 'microphone.webm');
                micFormData.append('model', 'whisper-1');
                micFormData.append('language', this.elements.language.value === 'auto' ? '' : this.elements.language.value);
                micFormData.append('response_format', 'json');
                
                const micResponse = await this.makeAPIRequestWithRetry('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: micFormData
                });
                
                const micResult = await micResponse.json();
                recordingData.micTranscription = micResult.text;
                console.log('✅ マイク文字起こし完了:', micResult.text.substring(0, 100) + '...');
            }
            
            // 相手音声（画面共有）の文字起こし
            if (recordingData.screenBlob) {
                console.log('💻 相手音声を文字起こし中...');
                const screenFormData = new FormData();
                screenFormData.append('file', recordingData.screenBlob, 'screen_audio.webm');
                screenFormData.append('model', 'whisper-1');
                screenFormData.append('language', this.elements.language.value === 'auto' ? '' : this.elements.language.value);
                screenFormData.append('response_format', 'json');
                
                const screenResponse = await this.makeAPIRequestWithRetry('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: screenFormData
                });
                
                const screenResult = await screenResponse.json();
                recordingData.screenTranscription = screenResult.text;
                console.log('✅ 相手文字起こし完了:', screenResult.text.substring(0, 100) + '...');
            }
            
            // 結合版文字起こしを作成
            recordingData.transcription = this.createCombinedTranscription(recordingData);
            
            // UIに表示
            this.displaySeparateTranscriptions(recordingData);
            this.switchTab('transcription');
            
            // 要約を生成
            if (this.elements.autoSummarize.checked) {
                await this.summarizeText(recordingData);
            }
            
        } catch (error) {
            console.error('別々文字起こしエラー:', error);
            
            let errorMessage = '別々文字起こしエラー: ' + error.message;
            
            if (error.message.includes('429')) {
                errorMessage = '🕛 APIの利用制限に達しました。しばらくお待ちください。\n\n📝 対処法：\n・ 数分待ってから再度お試しください\n・ OpenAI APIの有料プランへのアップグレードをご検討ください';
            } else if (error.message.includes('Invalid API key')) {
                errorMessage = '🔑 APIキーが無効です。設定タブでAPIキーを確認してください。';
            } else if (error.message.includes('400')) {
                errorMessage = '⚠️ 音声ファイルの形式または内容に問題があります。\n\n📝 対処法：\n・ 録音時間が短すぎる可能性があります（最低3秒以上録音してください）\n・ 音声が無音または音量が小さすぎる可能性があります\n・ 録音形式に問題がある可能性があります';
            } else if (error.message.includes('file')) {
                errorMessage = '📁 音声ファイルの処理に失敗しました。録音データに問題がある可能性があります。';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = '🌐 ネットワークエラーが発生しました。インターネット接続を確認してください。';
            }
            
            this.elements.transcriptionResult.innerHTML = `<p class="error">${errorMessage.replace(/\n/g, '<br>')}</p>`;
            
            // エラーを上位にも伝播させる
            throw error;
        } finally {
            this.hideLoading();
        }
    }
    
    // 結合版文字起こしを作成
    createCombinedTranscription(recordingData) {
        let combined = '';
        
        if (recordingData.micTranscription) {
            combined += `🎤 **あなた（マイク）:**\n${recordingData.micTranscription}\n\n`;
        }
        
        if (recordingData.screenTranscription) {
            combined += `💻 **相手（画面共有）:**\n${recordingData.screenTranscription}\n\n`;
        }
        
        return combined;
    }
    
    // 別々文字起こし結果を表示
    displaySeparateTranscriptions(recordingData) {
        let html = '<div class="separate-transcriptions">';
        
        if (recordingData.micTranscription) {
            html += `
                <div class="transcription-section mic-section">
                    <h3>🎤 あなた（マイク）</h3>
                    <div class="transcription-content">
                        <p>${recordingData.micTranscription.replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            `;
        }
        
        if (recordingData.screenTranscription) {
            html += `
                <div class="transcription-section screen-section">
                    <h3>💻 相手（画面共有）</h3>
                    <div class="transcription-content">
                        <p>${recordingData.screenTranscription.replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        
        this.elements.transcriptionResult.innerHTML = html;
    }

    async transcribeAudio(recordingData) {
        this.showLoading('音声を文字起こし中...');
        
        try {
            const formData = new FormData();
            formData.append('file', recordingData.blob, 'recording.webm');
            formData.append('model', 'whisper-1');
            formData.append('language', this.elements.language.value === 'auto' ? '' : this.elements.language.value);
            formData.append('response_format', 'json');

            const response = await this.makeAPIRequestWithRetry('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            const result = await response.json();
            recordingData.transcription = result.text;
            
            this.elements.transcriptionResult.innerHTML = `<p>${result.text}</p>`;
            this.switchTab('transcription');

            if (this.elements.autoSummarize.checked) {
                await this.summarizeText(recordingData);
            }

        } catch (error) {
            console.error('文字起こしエラー:', error);
            
            let errorMessage = 'エラーが発生しました: ' + error.message;
            
            if (error.message.includes('429')) {
                errorMessage = '🕛 APIの利用制限に達しました。しばらくお待ちください。\n\n📝 対処法：\n・ 数分待ってから再度お試しください\n・ OpenAI APIの有料プランへのアップグレードをご検討ください';
            } else if (error.message.includes('401')) {
                errorMessage = '🔑 APIキーが無効です。設定を確認してください。';
            } else if (error.message.includes('403')) {
                errorMessage = '🙅 APIアクセスが禁止されています。アカウントを確認してください。';
            }
            
            this.elements.transcriptionResult.innerHTML = `<p class="error">${errorMessage.replace(/\n/g, '<br>')}</p>`;
        } finally {
            this.hideLoading();
        }
    }

    async transcribeSystemAudio(recordingData) {
        if (!window.electronAPI) {
            console.log('⚠️ Electronアプリでのみシステムオーディオの文字起こしが可能です');
            return;
        }

        this.showLoading('システムオーディオを文字起こし中...');
        
        try {
            console.log('🎙️ システムオーディオファイルの文字起こし開始:', this.systemAudioRecording.filePath);
            console.log('📋 キャプチャされている音声: BlackHole 2ch経由のシステムオーディオ (YouTube, Google Meet等)');
            
            // システムオーディオファイルをBlobに変換
            const audioBuffer = await window.electronAPI.readSystemAudioFile(this.systemAudioRecording.filePath);
            const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
            
            console.log('📏 システムオーディオファイルサイズ:', audioBlob.size, 'bytes');

            const formData = new FormData();
            formData.append('file', audioBlob, 'system_audio.wav');
            formData.append('model', 'whisper-1');
            formData.append('language', this.elements.language.value === 'auto' ? '' : this.elements.language.value);
            formData.append('response_format', 'json');

            const response = await this.makeAPIRequestWithRetry('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            const result = await response.json();
            const systemTranscription = result.text;
            
            console.log('✅ システムオーディオ文字起こし完了:', systemTranscription);
            
            // システムオーディオのみを使用（YouTube等の音声）
            recordingData.transcription = systemTranscription;
            
            // 画面の文字起こし結果を更新
            this.elements.transcriptionResult.innerHTML = `<p>${recordingData.transcription.replace(/\n/g, '<br>')}</p>`;
            
            // 一時ファイルを削除
            await window.electronAPI.deleteSystemAudioFile(this.systemAudioRecording.filePath);
            console.log('🗑️ 一時ファイルを削除しました:', this.systemAudioRecording.filePath);

        } catch (error) {
            console.error('❌ システムオーディオ文字起こしエラー:', error);
            // エラーでも通常の処理は継続
        } finally {
            this.hideLoading();
        }
    }

    async summarizeText(recordingData) {
        if (!recordingData.transcription) return;

        this.showLoading('要約を生成中...');
        console.log('🔍 [DEBUG] 新しい改善された要約プロンプトを使用中...');
        
        try {
            const response = await this.makeAPIRequestWithRetry('https://api.openai.com/v1/chat/completions', {
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
                            content: `あなたは会議内容を分析し、構造化された要約を作成する専門家です。以下の形式で要約してください。

## 📋 会議概要
（会議の要点を3-5行で要約）

## ⭐ 決定事項
- 決定された重要事項を箇条書きで記載
- 不明確な内容は「要確認」と記載

## 📝 アクション項目
- 【担当者】タスク内容（期限：X月X日）
- 未定の場合は「要確認」と記載

## 🔍 主要な論点
- 議論された重要なトピック
- 課題や問題点があれば記載

## 💡 次回までの確認事項
- 次回会議で確認が必要な項目

日本語で出力し、具体的で実用的な内容にしてください。`
                        },
                        {
                            role: 'user',
                            content: recordingData.transcription
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.1
                })
            });

            const result = await response.json();
            recordingData.summary = result.choices[0].message.content;
            console.log('🔍 [DEBUG] 新しい要約結果:', result.choices[0].message.content.substring(0, 100) + '...');
            
            this.elements.summaryResult.innerHTML = `<div>${result.choices[0].message.content.replace(/\n/g, '<br>')}</div>`;

        } catch (error) {
            console.error('要約エラー:', error);
            
            let errorMessage = '要約エラー: ' + error.message;
            
            if (error.message.includes('429')) {
                errorMessage = '🕛 APIの利用制限に達しました。しばらくお待ちください。\n\n📝 対処法：\n・ 数分待ってから再度お試しください\n・ OpenAI APIの有料プランへのアップグレードをご検討ください';
            }
            
            this.elements.summaryResult.innerHTML = `<p class="error">${errorMessage.replace(/\n/g, '<br>')}</p>`;
        } finally {
            this.hideLoading();
        }
    }

    // オーディオファイルをダウンロードする関数
    downloadAudio(recordingData) {
        if (!recordingData.blob) {
            alert('オーディオデータが見つかりません。');
            return;
        }

        const url = URL.createObjectURL(recordingData.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `録音_${recordingData.date.replace(/[:\/]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // リトライ機能付きAPI呼び出し関数
    async makeAPIRequestWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                
                if (response.status === 429) {
                    // レート制限エラーの場合
                    const retryAfter = response.headers.get('retry-after');
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt - 1);
                    
                    console.log(`⏳ API制限エラー (429) - ${delay/1000}秒後にリトライします (${attempt}/${maxRetries})`);
                    
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
                
                if (!response.ok) {
                    let errorMessage = `HTTP error! status: ${response.status}`;
                    try {
                        const errorText = await response.text();
                        try {
                            const errorJson = JSON.parse(errorText);
                            if (errorJson.error && errorJson.error.message) {
                                errorMessage += ` - ${errorJson.error.message}`;
                            } else {
                                errorMessage += ` - ${errorText}`;
                            }
                        } catch (_) {
                            errorMessage += ` - ${errorText}`;
                        }
                    } catch (_) {
                        // ignore parse errors
                    }
                    throw new Error(errorMessage);
                }
                
                return response;
            } catch (error) {
                console.error(`API呼び出し失敗 (試行 ${attempt}/${maxRetries}):`, error);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // 指数バックオフで待機
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // 別々録音機能
    async startSeparateRecording() {
        try {
            console.log('🎤 別々録音を開始します...');
            
            // マイクストリームを取得
            console.log('🎤 マイクストリーム取得中...');
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100,
                    // より具体的な制約を追加
                    autoGainControl: false,
                    channelCount: 1
                },
                video: false
            });
            
            console.log('✅ マイクストリーム取得成功:', {
                audioTracks: this.micStream.getAudioTracks().length,
                micLabel: this.micStream.getAudioTracks()[0]?.label
            });
            
            // 画面共有ストリームを取得
            this.screenStream = await this.getScreenAudioStream();
            
            // マイク用MediaRecorder - WAV形式を強制的に使用
            this.micOptions = { 
                audioBitsPerSecond: 128000
            };
            
            // WAV形式を試行、フォールバックでWebM
            if (MediaRecorder.isTypeSupported('audio/wav')) {
                this.micOptions.mimeType = 'audio/wav';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
                this.micOptions.mimeType = 'audio/webm;codecs=pcm';
            } else {
                this.micOptions.mimeType = 'audio/webm;codecs=opus';
                console.warn('⚠️ WAV/PCMがサポートされていません。Opusを使用します。');
            }
            
            this.separateRecording.micRecorder = new MediaRecorder(this.micStream, this.micOptions);
            
            // 画面音声用MediaRecorder - 同じ設定
            this.screenOptions = { 
                audioBitsPerSecond: 128000
            };
            
            if (MediaRecorder.isTypeSupported('audio/wav')) {
                this.screenOptions.mimeType = 'audio/wav';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
                this.screenOptions.mimeType = 'audio/webm;codecs=pcm';
            } else {
                this.screenOptions.mimeType = 'audio/webm;codecs=opus';
                console.warn('⚠️ WAV/PCMがサポートされていません。Opusを使用します。');
            }
            
            this.separateRecording.screenRecorder = new MediaRecorder(this.screenStream, this.screenOptions);
            
            console.log('📹 録音フォーマット:', {
                mic: this.micOptions.mimeType,
                screen: this.screenOptions.mimeType
            });
            
            // マイク音声チャンクを収集
            const micChunks = [];
            this.separateRecording.micRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    micChunks.push(event.data);
                }
            };
            
            // 画面音声チャンクを収集
            const screenChunks = [];
            this.separateRecording.screenRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    screenChunks.push(event.data);
                }
            };
            
            // 録音停止時の処理
            let recordersFinished = 0;
            const totalRecorders = 2;
            
            const onRecorderStop = () => {
                recordersFinished++;
                console.log(`📊 レコーダー停止: ${recordersFinished}/${totalRecorders}`);
                
                if (recordersFinished === totalRecorders) {
                    // 録音時に使用したMIMEタイプでBlobを作成
                    const micMimeType = this.micOptions.mimeType || 'audio/webm;codecs=opus';
                    const screenMimeType = this.screenOptions.mimeType || 'audio/webm;codecs=opus';
                    
                    this.separateRecording.micBlob = new Blob(micChunks, { type: micMimeType });
                    this.separateRecording.screenBlob = new Blob(screenChunks, { type: screenMimeType });
                    
                    console.log('📦 録音完了 - ファイル形式:', {
                        mic: micMimeType,
                        screen: screenMimeType,
                        micSize: this.separateRecording.micBlob.size,
                        screenSize: this.separateRecording.screenBlob.size
                    });
                    
                    // 録音状態をリセット
                    this.isRecording = false;
                    this.separateRecording.isActive = false;
                    
                    // タイマーを停止
                    this.stopTimer();
                    
                    // ビジュアライザーを停止
                    if (this.animationId) {
                        cancelAnimationFrame(this.animationId);
                        this.animationId = null;
                    }
                    
                    // UIを更新
                    this.updateUI();
                    
                    // デバッグ用：音声ファイルを自動保存
                    this.saveDebugAudioFiles();
                    
                    console.log('✅ 別々録音完了');
                    this.processSeparateRecording();
                }
            };
            
            this.separateRecording.micRecorder.onstop = onRecorderStop;
            this.separateRecording.screenRecorder.onstop = onRecorderStop;
            
            // 録音開始
            this.separateRecording.micRecorder.start(5000);
            this.separateRecording.screenRecorder.start(5000);
            
            this.isRecording = true;
            this.separateRecording.isActive = true; // 別々録音モードを有効化
            this.startTime = Date.now();
            this.pausedTime = 0;
            
            // 新しい録音のために前回のデータをクリア
            this.currentRecordingData = null;
            
            this.updateUI();
            this.startTimer();
            // 別々録音モードではAudioContextはマイクストリームのみで設定
            this.setupSeparateAudioContext();
            
            console.log('🎤 別々録音開始成功 - マイクと相手の音声を別々に録音中...');
            
            // 録音中の注意を表示
            this.showMessage('🎤 別々録音中... 会議終了時に「録音停止」ボタンを押してください', 'info');
            
        } catch (error) {
            console.error('別々録音開始エラー:', error);
            
            // より具体的なエラーメッセージを作成
            let errorMessage = '別々録音の開始に失敗しました: ';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'マイクまたは画面共有の許可が必要です。ブラウザの設定を確認してください。';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'マイクまたは画面共有ソースが見つかりません。デバイスの接続を確認してください。';
            } else if (error.message && error.message.includes('screen')) {
                errorMessage = '画面共有の取得に失敗しました。画面共有ダイアログで「音声を共有」にチェックしてください。';
            } else if (error.message && error.message.includes('mic')) {
                errorMessage = 'マイクアクセスに失敗しました。マイクの接続と権限を確認してください。';
            } else {
                errorMessage += error.message || '不明なエラー';
            }
            
            // カスタムエラーオブジェクトを作成
            const separateError = new Error(errorMessage);
            separateError.name = error.name;
            separateError.originalError = error;
            
            this.handleRecordingError(separateError);
        }
    }
    
    // 別々録音の処理
    async processSeparateRecording() {
        try {
            console.log('🔄 別々録音の処理を開始中...');
            
            // 録音データの検証
            if (!this.separateRecording.micBlob && !this.separateRecording.screenBlob) {
                throw new Error('録音データが見つかりません。録音が正常に完了していない可能性があります。');
            }
            
            const duration = this.pausedTime || (Date.now() - this.startTime);
            
            // 録音時間の検証（最低3秒）
            if (duration < 3000) {
                console.warn('⚠️ 録音時間が短すぎます:', duration, 'ms');
                this.showMessage('録音時間が短すぎます（最低3秒必要）。もう一度長めに録音してください。', 'warning');
                return;
            }
            
            const recordingData = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                duration: duration,
                blob: null, // 結合用（使用しない）
                micBlob: this.separateRecording.micBlob,
                screenBlob: this.separateRecording.screenBlob,
                micTranscription: null,
                screenTranscription: null,
                transcription: null, // 結合版
                summary: null
            };
            
            // 現在の録音データを保存（オーディオダウンロード用）
            this.currentRecordingData = recordingData;
            
            // 文字起こしを実行
            if (this.elements.autoTranscribe.checked) {
                // 音声ファイルサイズの検証
                const micSize = recordingData.micBlob ? recordingData.micBlob.size : 0;
                const screenSize = recordingData.screenBlob ? recordingData.screenBlob.size : 0;
                
                console.log('📊 音声ファイルサイズ:', {
                    micSize: micSize,
                    screenSize: screenSize,
                    total: micSize + screenSize
                });
                
                if (micSize < 1000 && screenSize < 1000) {
                    this.showMessage('音声ファイルが小さすぎます。録音が正常に行われていない可能性があります。', 'warning');
                    return;
                }
                
                try {
                    await this.transcribeSeparateAudio(recordingData);
                } catch (transcribeError) {
                    console.error('文字起こしエラー:', transcribeError);
                    this.showMessage('文字起こしに失敗しましたが、音声ファイルは保存されました。', 'warning');
                }
            }
            
            this.saveToHistory(recordingData);
            this.displayHistory();
            
            // Notionに自動保存
            if (this.elements.autoSaveToNotion.checked && this.notionToken && this.notionDatabaseId) {
                try {
                    await this.saveToNotion(recordingData);
                } catch (notionError) {
                    console.error('Notion保存エラー:', notionError);
                    this.showMessage('Notionへの保存に失敗しましたが、ローカルには保存されました。', 'warning');
                }
            }
            
            this.elements.recordingTime.textContent = '00:00';
            
            // 録音完了後にUIを更新（音声ダウンロードボタンを有効化）
            this.updateUI();
            console.log('✅ 別々録音処理完了 - マイクと相手の文字起こしが完了しました');
            
        } catch (error) {
            console.error('別々録音処理エラー:', error);
            this.showMessage(`別々録音の処理中にエラーが発生しました: ${error.message}`, 'error');
            
            // エラーが発生してもUIは適切に更新
            this.updateUI();
        }
    }

    // 現在の録音をダウンロードする関数
    downloadCurrentAudio() {
        if (!this.currentRecordingData) {
            alert('ダウンロード可能な録音がありません。\n\n📝 手順：\n1. 録音開始ボタンをクリック\n2. 録音停止ボタンをクリック\n3. 処理完了後にダウンロードボタンが有効になります');
            return;
        }
        
        console.log('💾 音声ファイルをダウンロード中...');
        
        // 別々録音の場合
        if (this.currentRecordingData.micBlob || this.currentRecordingData.screenBlob) {
            this.downloadSeparateAudio(this.currentRecordingData);
        } else {
            // 通常の録音
            this.downloadAudio(this.currentRecordingData);
        }
    }
    
    // デバッグ用：音声ファイルを自動保存
    async saveDebugAudioFiles() {
        const timestamp = new Date().toISOString().replace(/[:\/]/g, '-');
        
        if (window.electronAPI) {
            // Electronアプリの場合：指定フォルダに自動保存
            try {
                if (this.separateRecording.micBlob) {
                    const micArrayBuffer = await this.separateRecording.micBlob.arrayBuffer();
                    let micExtension = 'webm'; // デフォルト
                    
                    if (this.separateRecording.micBlob.type.includes('wav')) {
                        micExtension = 'wav';
                    } else if (this.separateRecording.micBlob.type.includes('mp4')) {
                        micExtension = 'mp4';
                    } else if (this.separateRecording.micBlob.type.includes('pcm')) {
                        micExtension = 'wav'; // PCMはWAVとして保存
                    }
                    
                    const micFileName = `debug/debug_mic_${timestamp}.${micExtension}`;
                    
                    // ElectronのIPCを使用してファイル保存
                    const result = await this.saveFileViaElectron(micFileName, micArrayBuffer);
                    if (result.success) {
                        console.log('💾 マイク音声をデバッグ保存:', result.filePath);
                    }
                }
                
                if (this.separateRecording.screenBlob) {
                    const screenArrayBuffer = await this.separateRecording.screenBlob.arrayBuffer();
                    let screenExtension = 'webm'; // デフォルト
                    
                    if (this.separateRecording.screenBlob.type.includes('wav')) {
                        screenExtension = 'wav';
                    } else if (this.separateRecording.screenBlob.type.includes('mp4')) {
                        screenExtension = 'mp4';
                    } else if (this.separateRecording.screenBlob.type.includes('pcm')) {
                        screenExtension = 'wav'; // PCMはWAVとして保存
                    }
                    
                    const screenFileName = `debug/debug_screen_${timestamp}.${screenExtension}`;
                    
                    const result = await this.saveFileViaElectron(screenFileName, screenArrayBuffer);
                    if (result.success) {
                        console.log('💾 相手音声をデバッグ保存:', result.filePath);
                    }
                }
                
                // ログファイルも保存
                this.saveDebugLog(timestamp);
                
            } catch (error) {
                console.error('❌ デバッグファイル保存エラー:', error);
            }
        } else {
            // ブラウザの場合：通常のダウンロード
            console.log('ℹ️ ブラウザ環境のため、手動でダウンロードしてください');
        }
    }
    
    // Electronファイル保存ヘルパー
    async saveFileViaElectron(fileName, arrayBuffer) {
        try {
            // ElectronのIPCを使用してファイル保存
            const result = await window.electronAPI.saveDebugFile(fileName, arrayBuffer);
            
            return result;
        } catch (error) {
            console.error('❌ Electronファイル保存エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // デバッグログの保存
    async saveDebugLog(timestamp) {
        const debugInfo = {
            timestamp: timestamp,
            audioSources: {
                micStream: this.micStream ? {
                    audioTracks: this.micStream.getAudioTracks().length,
                    micLabel: this.micStream.getAudioTracks()[0]?.label,
                    active: this.micStream.active
                } : null,
                screenStream: this.screenStream ? {
                    audioTracks: this.screenStream.getAudioTracks().length,
                    videoTracks: this.screenStream.getVideoTracks().length,
                    active: this.screenStream.active
                } : null
            },
            recordingData: {
                micBlobSize: this.separateRecording.micBlob ? this.separateRecording.micBlob.size : 0,
                screenBlobSize: this.separateRecording.screenBlob ? this.separateRecording.screenBlob.size : 0,
                duration: this.pausedTime || (Date.now() - this.startTime)
            }
        };
        
        try {
            const logFileName = `debug/debug_log_${timestamp}.json`;
            const logContent = JSON.stringify(debugInfo, null, 2);
            const encoder = new TextEncoder();
            const logBuffer = encoder.encode(logContent).buffer;
            
            const result = await window.electronAPI.saveDebugFile(logFileName, logBuffer);
            
            if (result.success) {
                console.log('💾 デバッグログを保存:', result.filePath);
            }
        } catch (error) {
            console.error('❌ デバッグログ保存エラー:', error);
        }
    }

    // 別々音声ファイルのダウンロード
    downloadSeparateAudio(recordingData) {
        const timestamp = recordingData.date.replace(/[:\/]/g, '-');
        
        // マイク音声をダウンロード
        if (recordingData.micBlob) {
            const micUrl = URL.createObjectURL(recordingData.micBlob);
            const micLink = document.createElement('a');
            micLink.href = micUrl;
            micLink.download = `マイク音声_${timestamp}.webm`;
            document.body.appendChild(micLink);
            micLink.click();
            document.body.removeChild(micLink);
            URL.revokeObjectURL(micUrl);
            console.log('✅ マイク音声をダウンロードしました');
        }
        
        // 相手音声をダウンロード
        if (recordingData.screenBlob) {
            setTimeout(() => {
                const screenUrl = URL.createObjectURL(recordingData.screenBlob);
                const screenLink = document.createElement('a');
                screenLink.href = screenUrl;
                screenLink.download = `相手音声_${timestamp}.webm`;
                document.body.appendChild(screenLink);
                screenLink.click();
                document.body.removeChild(screenLink);
                URL.revokeObjectURL(screenUrl);
                console.log('✅ 相手音声をダウンロードしました');
            }, 1000); // 1秒遅延で順次ダウンロード
        }
        
        alert('🎤 マイク音声と💻相手音声を別々にダウンロードしました！');
    }

    saveToHistory(recordingData) {
        const historyItem = {
            id: recordingData.id,
            date: recordingData.date,
            duration: recordingData.duration,
            transcription: recordingData.transcription,
            summary: recordingData.summary
        };
        
        // 別々録音の場合は追加情報を保存
        if (recordingData.micTranscription || recordingData.screenTranscription) {
            historyItem.micTranscription = recordingData.micTranscription;
            historyItem.screenTranscription = recordingData.screenTranscription;
            historyItem.isSeparateRecording = true;
        }
        
        this.history.unshift(historyItem);

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
            videoTracks.forEach(track => track.stop());
            
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
            
            // 音声トラックの状態監視（情報表示のみ）
            audioTracks.forEach((track, index) => {
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
            
            // 画面共有ウィンドウの監視を開始
            if (window.electronAPI) {
                window.electronAPI.startScreenCaptureMonitoring(selectedSource.id);
                this.selectedSourceId = selectedSource.id; // 後でクリーンアップ用に保存
            }
            
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
                const continueWithoutAudio = confirm('⚠️ 選択されたソースから音声が取得できませんでした。\n\n📋 可能な対処法：\n1. Google Meetで「音声を共有」にチェックを確認\n2. 他の会議参加者が話している時に録音を開始\n3. 音声付きの他のソースを選択\n4. マイクのみで録音を継続\n\n➡️ このまま継続しますか？（相手の音声なし）');
                
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
                console.warn('⚠️ ffmpegによるシステムオーディオ録音開始に失敗:', result.error);
                console.warn('⚠️ BlackHoleがオーディオ出力に設定されていることを確認してください');
                // エラーをthrowせずにnullを返す
                return null;
            }
            
        } catch (error) {
            console.error('❌ ffmpeg経由のシステムオーディオ取得失敗:', error);
            console.warn('⚠️ システムオーディオなしで続行します');
            // エラーをthrowせずにnullを返す
            return null;
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

            // AudioContextを作成（サンプリングレート統一）
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100,
                latencyHint: 'interactive'
            });
            
            console.log('🎵 AudioContext作成:', {
                sampleRate: audioContext.sampleRate,
                state: audioContext.state,
                baseLatency: audioContext.baseLatency
            });
            
            // 音声ソースを作成
            const micSource = audioContext.createMediaStreamSource(this.micStream);
            const screenSource = audioContext.createMediaStreamSource(this.screenStream);
            
            console.log('🎤 マイクソース作成:', micSource);
            console.log('🖥️ 画面音声ソース作成:', screenSource);
            
            // 音声レベル監視用のAnalyserNodeを追加
            const micAnalyser = audioContext.createAnalyser();
            const screenAnalyser = audioContext.createAnalyser();
            
            // Analyserの設定を最適化
            micAnalyser.fftSize = 2048;
            screenAnalyser.fftSize = 2048;
            micAnalyser.smoothingTimeConstant = 0.8;
            screenAnalyser.smoothingTimeConstant = 0.8;
            
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
            
            // 録音停止時にクリーンアップ（levelMonitorは後でstopRecordingから呼ばれる）
            this.levelMonitor = levelMonitor; // 後でクリーンアップ用に保存
            
            // ミキサーを作成（音量調整）
            const mixer = audioContext.createGain();
            const micGain = audioContext.createGain();
            const screenGain = audioContext.createGain();
            
            // 音量バランス調整
            micGain.gain.value = 0.7;  // マイク音量を少し下げる
            screenGain.gain.value = 1.0;  // 画面共有音声は標準
            
            // コンプレッサーを追加（プチプチ音を軽減）
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.value = -50;
            compressor.knee.value = 40;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            
            // 音声処理チェーンを構築
            micSource.connect(micGain);
            screenSource.connect(screenGain);
            micGain.connect(mixer);
            screenGain.connect(mixer);
            mixer.connect(compressor);
            
            // 出力ストリームを作成
            const destination = audioContext.createMediaStreamDestination();
            
            // 混合音声用のAnalyserNodeを追加（可視化用）
            const mixedAnalyser = audioContext.createAnalyser();
            mixedAnalyser.fftSize = 2048;
            mixedAnalyser.smoothingTimeConstant = 0.8;
            
            // 音声処理チェーンを完成
            compressor.connect(mixedAnalyser);
            mixedAnalyser.connect(destination);
            
            // 可視化用のAnalyserを保存（startVisualization で使用）
            this.analyser = mixedAnalyser;
            this.audioContext = audioContext;
            
            // 画面共有終了時の処理は削除（Electronのポーリング検知に一本化）
            
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
                
                // 別々録音の場合は追加情報を含める
                if (recordingData.micTranscription || recordingData.screenTranscription) {
                    safeRecordingData.micTranscription = recordingData.micTranscription ? String(recordingData.micTranscription) : '';
                    safeRecordingData.screenTranscription = recordingData.screenTranscription ? String(recordingData.screenTranscription) : '';
                    safeRecordingData.isSeparateRecording = true;
                }
                
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

    setupScreenCaptureMonitoring() {
        // 既存のリスナーを削除（重複防止）
        if (this.screenCaptureCloseHandler) {
            window.electronAPI.removeScreenCaptureWindowClosedListener(this.screenCaptureCloseHandler);
        }
        
        // Electronでウィンドウ閉鎖検知を一度だけ設定
        if (window.electronAPI && window.electronAPI.onScreenCaptureWindowClosed) {
            this.screenCaptureCloseHandler = () => {
                console.log('🚪 画面共有ウィンドウが閉じられました（Electronポーリング検知）');
                if (this.isRecording) {
                    // 別々録音モードの場合は画面音声録音のみ停止
                    if (this.separateRecording.isActive) {
                        console.log('🎤 別々録音モード: 画面共有ウィンドウが閉じられました - 画面音声録音を停止します');
                        
                        // 画面音声録音を停止
                        if (this.separateRecording.screenRecorder && this.separateRecording.screenRecorder.state === 'recording') {
                            this.separateRecording.screenRecorder.stop();
                            console.log('💻 画面音声録音を停止しました');
                        }
                        
                        // システムオーディオ録音も停止
                        if (window.electronAPI) {
                            window.electronAPI.stopSystemAudioRecording();
                            console.log('🛑 システムオーディオ録音を停止しました');
                        }
                        
                        // 画面ストリームを停止
                        if (this.screenStream) {
                            this.screenStream.getTracks().forEach(track => track.stop());
                            this.screenStream = null;
                            console.log('🔌 画面ストリームを停止しました');
                        }
                        
                        // AudioContextをマイクストリームに切り替え
                        if (this.micStream && this.audioContext) {
                            try {
                                // 新しいソースを作成
                                const micSource = this.audioContext.createMediaStreamSource(this.micStream);
                                micSource.connect(this.analyser);
                                console.log('🎤 AudioContextをマイクストリームに切り替えました');
                            } catch (error) {
                                console.error('❌ AudioContext切り替えエラー:', error);
                            }
                        }
                        
                        console.log('✅ 画面共有終了 - マイク録音は継続中');
                        
                        // UIメッセージを更新
                        this.showMessage('画面共有が終了しました。マイク録音は継続中です。', 'info');
                        
                        // 録音状態をチェック - マイク録音のみ継続中の場合
                        if (this.separateRecording.micRecorder && this.separateRecording.micRecorder.state === 'recording') {
                            console.log('🎤 マイク録音のみ継続中');
                            // 録音状態表示を更新
                            this.elements.recordingStatus.textContent = '録音中（マイクのみ）';
                            this.elements.recordingStatus.className = 'recording';
                            
                            // タイマーはそのまま継続
                            // 特に何もしない - マイク録音は継続
                        } else {
                            // マイク録音も停止している場合は全体を停止
                            console.log('🛑 マイク録音も停止しているため、全体を停止します');
                            this.stopRecording();
                        }
                        
                        return; // 全体の録音は継続
                    }
                    console.log('⚠️ 画面共有ウィンドウの閉鎖により録音を自動停止します');
                    this.stopRecording();
                }
            };
            
            window.electronAPI.onScreenCaptureWindowClosed(this.screenCaptureCloseHandler);
            console.log('✅ 画面共有ウィンドウ監視を設定しました');
        }
    }

    // クリーンアップハンドラーの設定
    setupCleanupHandlers() {
        // ページが閉じられる時の処理
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Electronアプリが閉じられる時の処理
        window.addEventListener('unload', () => {
            this.cleanup();
        });
    }

    // クリーンアップ処理
    cleanup() {
        // 録音中の場合は停止
        if (this.isRecording) {
            this.stopRecording();
        }
        
        // IPC リスナーを削除
        if (this.screenCaptureCloseHandler && window.electronAPI) {
            window.electronAPI.removeScreenCaptureWindowClosedListener(this.screenCaptureCloseHandler);
            this.screenCaptureCloseHandler = null;
        }
        
        // 画面共有ウィンドウ監視を停止
        if (window.electronAPI) {
            window.electronAPI.stopScreenCaptureMonitoring();
        }
    }

    // エラーハンドリング
    handleRecordingError(error) {
        console.error('録音エラー:', error);
        
        // 別々録音中のエラーの場合はクリーンアップ
        if (this.separateRecording.isActive) {
            this.cleanupSeparateRecording();
        }
        
        // リセット処理
        this.isRecording = false;
        this.isPaused = false;
        this.updateUI();
        
        if (error.name === 'NotAllowedError') {
            this.showMessage('マイクまたは画面共有へのアクセスが拒否されました。ブラウザの設定を確認してください。', 'error');
        } else if (error.name === 'NotFoundError') {
            this.showMessage('マイクが見つかりません。マイクが正しく接続されているか確認してください。', 'error');
        } else if (error.name === 'NotSupportedError') {
            this.showMessage('お使いのブラウザは画面共有音声の録音をサポートしていません。Chrome または Edge をお試しください。', 'error');
        } else if (error.name === 'AbortError') {
            this.showMessage('録音が中断されました。再度お試しください。', 'error');
        } else if (error.message && error.message.includes('separate')) {
            this.showMessage(`別々録音エラー: ${error.message}`, 'error');
        } else {
            this.showMessage(`録音エラーが発生しました: ${error.message || '不明なエラー'}`, 'error');
        }
    }

    // 別々録音のクリーンアップ
    cleanupSeparateRecording() {
        console.log('🧹 別々録音のクリーンアップを実行中...');
        
        try {
            // マイクレコーダーの停止
            if (this.separateRecording.micRecorder && this.separateRecording.micRecorder.state !== 'inactive') {
                this.separateRecording.micRecorder.stop();
            }
            
            // 画面レコーダーの停止
            if (this.separateRecording.screenRecorder && this.separateRecording.screenRecorder.state !== 'inactive') {
                this.separateRecording.screenRecorder.stop();
            }
            
            // ストリームの停止
            if (this.micStream) {
                this.micStream.getTracks().forEach(track => track.stop());
                this.micStream = null;
            }
            
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
                this.screenStream = null;
            }
            
            // 別々録音状態をリセット
            this.separateRecording.isActive = false;
            this.separateRecording.micRecorder = null;
            this.separateRecording.screenRecorder = null;
            this.separateRecording.micBlob = null;
            this.separateRecording.screenBlob = null;
            
            console.log('✅ 別々録音のクリーンアップ完了');
            
        } catch (cleanupError) {
            console.error('クリーンアップエラー:', cleanupError);
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