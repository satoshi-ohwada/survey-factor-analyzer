/**
 * メインアプリケーション制御スクリプト
 * UI操作・パイプライン実行・結果レンダリングを一元管理する
 */

// グローバル状態
const AppState = {
    rawRows: [],
    headers: [],
    validResponses: [],
    textColumn: null,
    attributeColumn: null,
    kCount: 3,
    analysisResult: null,
    mapMode: 'responses', // 'responses' (因子得点) または 'words' (因子負荷量)
    mapAxisX: 0,
    mapAxisY: 1
};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
});

/**
 * イベントリスナーの登録
 */
function setupEventListeners() {
    const fileInput = document.getElementById('csvFileInput');
    const dropZone = document.getElementById('dropZone');
    const btnDemo = document.getElementById('btnDemoData');
    const btnRun = document.getElementById('btnRunAnalysis');
    const btnDecK = document.getElementById('btnDecK');
    const btnIncK = document.getElementById('btnIncK');
    const inputK = document.getElementById('inputK');
    const selectTextCol = document.getElementById('selectTextCol');
    const selectAttrCol = document.getElementById('selectAttrCol');
    const btnExportReport = document.getElementById('btnExportReport');
    const btnHelp = document.getElementById('btnHelp');
    const modalClose = document.getElementById('modalClose');
    const detailModal = document.getElementById('detailModal');

    // 因子空間マップのコントロール
    const selectMapAxisX = document.getElementById('selectMapAxisX');
    const selectMapAxisY = document.getElementById('selectMapAxisY');
    const btnMapModeResponses = document.getElementById('btnMapModeResponses');
    const btnMapModeWords = document.getElementById('btnMapModeWords');

    // ファイル選択
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // ドラッグ＆ドロップ
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // デモデータ読み込み
    btnDemo.addEventListener('click', () => {
        handleDemoData();
    });

    // 列選択の変更
    selectTextCol.addEventListener('change', (e) => {
        AppState.textColumn = e.target.value;
    });
    selectAttrCol.addEventListener('change', (e) => {
        AppState.attributeColumn = e.target.value || null;
    });

    // テーマ数の増減
    btnDecK.addEventListener('click', () => {
        let val = parseInt(inputK.value, 10);
        if (val > 2) {
            inputK.value = val - 1;
            AppState.kCount = val - 1;
        }
    });
    btnIncK.addEventListener('click', () => {
        let val = parseInt(inputK.value, 10);
        if (val < 8) {
            inputK.value = val + 1;
            AppState.kCount = val + 1;
        }
    });

    // 因子空間マップの軸変更
    selectMapAxisX.addEventListener('change', (e) => {
        AppState.mapAxisX = parseInt(e.target.value, 10);
        updateFactorSpaceMap();
    });
    selectMapAxisY.addEventListener('change', (e) => {
        AppState.mapAxisY = parseInt(e.target.value, 10);
        updateFactorSpaceMap();
    });

    // 因子空間マップのモード切替（回答者得点 vs 語の負荷量）
    btnMapModeResponses.addEventListener('click', () => {
        AppState.mapMode = 'responses';
        btnMapModeResponses.className = 'btn btn-sm btn-primary';
        btnMapModeWords.className = 'btn btn-sm';
        updateFactorSpaceMap();
    });
    btnMapModeWords.addEventListener('click', () => {
        AppState.mapMode = 'words';
        btnMapModeWords.className = 'btn btn-sm btn-primary';
        btnMapModeResponses.className = 'btn btn-sm';
        updateFactorSpaceMap();
    });

    // 分析実行
    btnRun.addEventListener('click', () => {
        runFullPipeline();
    });

    // A4レポート出力 (印刷 / PDF)
    const btnPrintReport = document.getElementById('btnPrintReport');
    if (btnPrintReport) {
        btnPrintReport.addEventListener('click', () => {
            printA4Report();
        });
    }

    // レポート画像保存
    btnExportReport.addEventListener('click', () => {
        exportReportImage();
    });

    // ヘルプ
    btnHelp.addEventListener('click', () => {
        showHelpModal();
    });

    // モーダルクローズ
    modalClose.addEventListener('click', () => {
        detailModal.style.display = 'none';
    });
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.style.display = 'none';
        }
    });
}

/**
 * ローディング表示の切り替え
 */
function showLoading(text = '分析を実行中...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

/**
 * ファイルアップロードの処理
 */
async function handleFileUpload(file) {
    showLoading('ファイルを読み込み中...');
    try {
        const parsed = await CsvParser.parse(file);
        processParsedData(parsed, file.name);
    } catch (err) {
        alert('ファイルの読み込みに失敗しました: ' + err.message);
    } finally {
        hideLoading();
    }
}

/**
 * デモデータでの実行
 */
async function handleDemoData() {
    showLoading('デモ用アンケートデータを準備中...');
    try {
        const parsed = await CsvParser.parse(DEMO_SURVEY_CSV);
        processParsedData(parsed, 'デモアンケート（SaaS利用満足度調査）.csv');
        // 自動で即座に分析を開始
        await runFullPipeline();
    } catch (err) {
        alert('デモデータの読み込みに失敗しました: ' + err.message);
    } finally {
        hideLoading();
    }
}

/**
 * パース済みデータのUI反映
 */
function processParsedData(parsed, fileName) {
    AppState.headers = parsed.headers;
    AppState.rawRows = parsed.rows;
    AppState.loadedFileName = fileName;

    const selectTextCol = document.getElementById('selectTextCol');
    const selectAttrCol = document.getElementById('selectAttrCol');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const configGrid = document.getElementById('configGrid');
    const btnRun = document.getElementById('btnRunAnalysis');

    fileNameDisplay.textContent = `📄 ${fileName} (${parsed.rows.length}件のデータ)`;

    // 列選択ドロップダウンの更新
    selectTextCol.innerHTML = '';
    parsed.headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        selectTextCol.appendChild(opt);
    });

    selectAttrCol.innerHTML = '<option value="">（指定しない）</option>';
    parsed.headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        selectAttrCol.appendChild(opt);
    });

    // 自由記述列の推測
    const guessedTextCol = CsvParser.guessTextColumn(parsed.headers, parsed.rows);
    if (guessedTextCol) {
        selectTextCol.value = guessedTextCol;
        AppState.textColumn = guessedTextCol;
    }

    // 属性列の推測
    const guessedAttrCols = CsvParser.guessAttributeColumns(parsed.headers, parsed.rows, guessedTextCol);
    if (guessedAttrCols.length > 0) {
        selectAttrCol.value = guessedAttrCols[0];
        AppState.attributeColumn = guessedAttrCols[0];
    }

    // テーマ数の推奨初期値
    const optimalK = FactorEngine.estimateOptimalK(parsed.rows.length, 50);
    document.getElementById('inputK').value = optimalK;
    AppState.kCount = optimalK;

    configGrid.style.display = 'grid';
    btnRun.disabled = false;
}

/**
 * 分析パイプラインの実行
 */
async function runFullPipeline() {
    if (!AppState.textColumn) {
        alert('自由記述の列を選択してください');
        return;
    }

    showLoading('形態素解析と日本語辞書を読み込み中...');
    try {
        // 1. Kuromojiの初期化
        await TextPreprocessor.init();

        showLoading('アンケートテキストを前処理中...');
        // 2. 有効回答の抽出（無意味回答のスキップ）
        const validResponses = [];
        let junkCount = 0;

        AppState.rawRows.forEach((r, idx) => {
            const rawText = r[AppState.textColumn];
            const textStr = (rawText !== undefined && rawText !== null) ? String(rawText).trim() : '';

            if (TextPreprocessor.isJunkResponse(textStr)) {
                junkCount++;
            } else {
                validResponses.push({
                    id: r.ID || r.id || r.No || (idx + 1),
                    text: textStr,
                    row: r
                });
            }
        });

        if (validResponses.length < 5) {
            alert('有効な自由記述テキストが少なすぎます（最低5件以上必要です）');
            return;
        }

        AppState.validResponses = validResponses;

        showLoading('重要キーワードと潜在因子を計算中...');
        // 3. TF-IDF 行列の構築
        const tfidfData = TextPreprocessor.buildTfIdfMatrix(validResponses, 70);

        if (tfidfData.vocabulary.length < 3) {
            alert('有効なキーワードが十分に抽出できませんでした。除外条件や単語を確認してください。');
            return;
        }

        // 4. 潜在因子・テーマ分析の実行 (NMF + 因子負荷量・得点)
        const K = parseInt(document.getElementById('inputK').value, 10) || 3;
        AppState.kCount = K;

        const result = FactorEngine.analyze(validResponses, tfidfData.vocabulary, tfidfData.matrix, K);
        AppState.analysisResult = result;

        showLoading('図とパス図を描画中...');
        // 5. 結果のレンダリング
        renderResults(validResponses, junkCount, result, tfidfData);

    } catch (err) {
        console.error(err);
        alert('分析処理中にエラーが発生しました: ' + err.message);
    } finally {
        hideLoading();
    }
}

/**
 * 分析結果のUI描画
 */
function renderResults(validResponses, junkCount, result, tfidfData) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.style.display = 'block';

    const validCount = validResponses.length;

    // サマリー表示
    document.getElementById('statTotalRows').textContent = AppState.rawRows.length;
    document.getElementById('statValidRows').textContent = validCount;
    document.getElementById('statJunkRows').textContent = junkCount;
    document.getElementById('statThemesCount').textContent = result.themes.length;

    // 【表】テキスト全体の基本統計・特性プロファイルの描画
    renderTextStatsProfile(validResponses, junkCount, tfidfData);

    // 【図1】潜在因子の全体構成比（ドーナツチャート）
    ChartRenderer.renderDonutChart('chartDonut', result.themes, (themeIndex) => {
        scrollToThemeCard(themeIndex);
    });

    // 【図2】因子パス図（潜在因子 → 観測単語）
    ChartRenderer.renderPathDiagram('chartPathDiagram', result.themes, (themeIndex) => {
        scrollToThemeCard(themeIndex);
    });

    // 軸セレクタのオプション生成
    setupAxisSelectors(result.themes);

    // 【図3】因子空間ポジショニングマップ
    updateFactorSpaceMap();

    // 【図4】属性別クロス集計チャート（属性列が指定されている場合）
    const crossTabCard = document.getElementById('crossTabCard');
    if (AppState.attributeColumn) {
        crossTabCard.style.display = 'block';
        ChartRenderer.renderCrossTabChart('chartCrossTab', result.responsesWithTheme, result.themes, AppState.attributeColumn);
    } else {
        crossTabCard.style.display = 'none';
    }

    // 【各因子の詳細カード】
    renderThemeCards(result.themes);

    // スムーズスクロール
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * テキスト全体の基本統計・特性プロファイルの描画
 */
function renderTextStatsProfile(validResponses, junkCount, tfidfData) {
    const totalRows = AppState.rawRows.length;
    const validRows = validResponses.length;
    const validRate = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 100;

    const charLengths = validResponses.map(r => r.text.length);
    const totalChars = charLengths.reduce((s, l) => s + l, 0);
    const avgChars = validRows > 0 ? (totalChars / validRows).toFixed(1) : 0;
    const maxChars = charLengths.length > 0 ? Math.max(...charLengths) : 0;

    const uniqueWords = Object.keys(tfidfData.wordDocCounts || {}).length;
    const analyzedWords = (tfidfData.vocabulary || []).length;

    // DOMへのセット
    document.getElementById('statAvgChars').textContent = avgChars;
    document.getElementById('statMaxChars').textContent = maxChars;
    document.getElementById('statUniqueWords').textContent = uniqueWords.toLocaleString();
    document.getElementById('statAnalyzedWords').textContent = analyzedWords.toLocaleString();

    document.getElementById('tblTotalRows').textContent = totalRows.toLocaleString();
    document.getElementById('tblValidRate').textContent = `${validRate}%`;
    document.getElementById('tblValidRows').textContent = validRows.toLocaleString();
    document.getElementById('tblJunkRows').textContent = junkCount.toLocaleString();
    document.getElementById('tblTotalChars').textContent = totalChars.toLocaleString();

    // 最頻出単語 TOP 5
    const topKeywordsContainer = document.getElementById('topKeywordsPills');
    topKeywordsContainer.innerHTML = '';
    const sortedWords = Object.entries(tfidfData.wordDocCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    sortedWords.forEach(([word, count], i) => {
        const pill = document.createElement('span');
        pill.style.cssText = 'font-size: 11px; background: #F1F5F9; border: 1px solid #CBD5E1; color: #1E293B; padding: 3px 8px; border-radius: 12px; font-weight: 500;';
        pill.innerHTML = `<b>${i + 1}.</b> ${escapeHtml(word)} <span style="color:#64748B;">(${count}件)</span>`;
        topKeywordsContainer.appendChild(pill);
    });
}

/**
 * 因子空間マップの軸セレクタの更新
 */
function setupAxisSelectors(themes) {
    const selectX = document.getElementById('selectMapAxisX');
    const selectY = document.getElementById('selectMapAxisY');

    selectX.innerHTML = '';
    selectY.innerHTML = '';

    themes.forEach((theme, idx) => {
        const cleanTitle = theme.label.replace(/^【|】$/g, '');
        const labelText = `因子${idx + 1}: ${cleanTitle}`;

        const optX = document.createElement('option');
        optX.value = idx;
        optX.textContent = labelText;
        if (idx === AppState.mapAxisX) optX.selected = true;
        selectX.appendChild(optX);

        const optY = document.createElement('option');
        optY.value = idx;
        optY.textContent = labelText;
        // Y軸はデフォルトで「因子2」または「因子1以外」
        const defaultY = themes.length > 1 ? 1 : 0;
        if (idx === (AppState.mapAxisY < themes.length ? AppState.mapAxisY : defaultY)) {
            optY.selected = true;
            AppState.mapAxisY = idx;
        }
        selectY.appendChild(optY);
    });
}

/**
 * 因子空間ポジショニングマップの更新描画
 */
function updateFactorSpaceMap() {
    if (!AppState.analysisResult) return;

    const { themes, responsesWithTheme, W, H, vocabulary } = AppState.analysisResult;

    ChartRenderer.renderFactorSpaceMap('chartFactorSpace', {
        mode: AppState.mapMode,
        xFactorIdx: AppState.mapAxisX,
        yFactorIdx: AppState.mapAxisY,
        themes,
        responsesWithTheme,
        W,
        H,
        vocabulary,
        onPointClick: (pointData) => showResponseModal(pointData)
    });
}

/**
 * 各テーマカードの生成
 */
function renderThemeCards(themes) {
    const container = document.getElementById('themeCardsList');
    container.innerHTML = '';

    themes.forEach((theme, idx) => {
        const color = ChartRenderer.COLORS[idx % ChartRenderer.COLORS.length];
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.id = `theme-card-${theme.id}`;
        card.style.borderLeftColor = color;

        // 代表回答HTML
        const responsesHtml = theme.representativeResponses.map((r, rIdx) => `
            <div class="response-item">
                <b>${rIdx + 1}.</b> 「${escapeHtml(r.text)}」
            </div>
        `).join('') || '<div class="response-item" style="color:#94A3B8;">該当する代表意見がありません</div>';

        card.innerHTML = `
            <div class="theme-card-header">
                <div class="theme-title-area">
                    <span class="theme-index-badge" style="background:${color};">因子 ${idx + 1}</span>
                    <span class="theme-title" id="theme-title-${theme.id}" title="クリックして名前を変更">
                        ${escapeHtml(theme.label)} ✏️
                    </span>
                </div>
                <span class="theme-share-badge">全体の <b>${theme.share}%</b> （${theme.count}件）</span>
            </div>
            <div class="theme-body-grid">
                <div class="theme-chart-col">
                    <div class="theme-chart-title">【因子負荷量（上位キーワード）】</div>
                    <div id="chart-kw-${theme.id}"></div>
                </div>
                <div class="theme-responses-col">
                    <div>
                        <div class="responses-list-title">【この因子を強く反映している代表的な回答（抜粋）】</div>
                        ${responsesHtml}
                    </div>
                    <div class="theme-card-footer">
                        <button class="btn btn-sm" onclick="showAllThemeResponses(${theme.id})">
                            🔍 この因子の全回答を見る (${theme.count}件)
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);

        // テーマタイトルのクリック編集イベント
        const titleEl = card.querySelector(`#theme-title-${theme.id}`);
        titleEl.addEventListener('click', () => {
            const currentText = theme.label.replace(/^【|】$/g, '');
            const newName = prompt('因子の名称を編集してください:', currentText);
            if (newName && newName.trim() !== '') {
                theme.label = `【${newName.trim()}】`;
                titleEl.innerHTML = `${escapeHtml(theme.label)} ✏️`;

                // すべての図（ドーナツ、パス図、因子空間マップ、クロス集計）を連動再描画
                ChartRenderer.renderDonutChart('chartDonut', themes, scrollToThemeCard);
                ChartRenderer.renderPathDiagram('chartPathDiagram', themes, scrollToThemeCard);
                setupAxisSelectors(themes);
                updateFactorSpaceMap();

                if (AppState.attributeColumn) {
                    ChartRenderer.renderCrossTabChart('chartCrossTab', AppState.analysisResult.responsesWithTheme, themes, AppState.attributeColumn);
                }
            }
        });

        // 重要キーワード横棒グラフの描画
        setTimeout(() => {
            ChartRenderer.renderKeywordBarChart(`chart-kw-${theme.id}`, theme.keywords, color);
        }, 50);
    });
}

/**
 * 該当テーマカードへのスクロール
 */
function scrollToThemeCard(themeIndex) {
    const card = document.getElementById(`theme-card-${themeIndex}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.transition = 'box-shadow 0.3s ease';
        card.style.boxShadow = '0 0 0 3px #2563EB';
        setTimeout(() => {
            card.style.boxShadow = '';
        }, 1500);
    }
}

/**
 * 単一回答のモーダル表示（マップで点をクリックした時）
 */
function showResponseModal(pointData) {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `回答詳細 (ID: ${pointData.id || '-'})`;
    modalBody.innerHTML = `
        <div style="margin-bottom: 12px;">
            <span class="badge-rec" style="font-size:12px; padding:4px 8px;">
                主所属因子: ${escapeHtml(pointData.themeLabel)}
            </span>
        </div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:8px; font-size:14px; line-height:1.6;">
            ${escapeHtml(pointData.text)}
        </div>
    `;
    modal.style.display = 'flex';
}

/**
 * テーマ別全回答一覧モーダル
 */
window.showAllThemeResponses = function(themeId) {
    const theme = AppState.analysisResult.themes.find(t => t.id === themeId);
    if (!theme) return;

    const matchedResponses = AppState.analysisResult.responsesWithTheme
        .filter(r => r.primaryThemeId === themeId)
        .sort((a, b) => b.confidence - a.confidence);

    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `${theme.label} の全回答一覧（${matchedResponses.length}件）`;

    const rowsHtml = matchedResponses.map((r, i) => `
        <tr style="border-bottom:1px solid #E2E8F0;">
            <td style="padding:10px 8px; font-weight:700; color:#64748B;">${i + 1}</td>
            <td style="padding:10px 8px; color:#1E293B;">${escapeHtml(r.text)}</td>
            <td style="padding:10px 8px; text-align:right; font-weight:600; color:#2563EB;">
                ${Math.round(r.confidence * 100)}%
            </td>
        </tr>
    `).join('');

    modalBody.innerHTML = `
        <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#64748B;">因子への適合度（因子得点割合）順に並んでいます</span>
            <button class="btn btn-sm" onclick="exportThemeCsv(${themeId})">📥 CSVダウンロード</button>
        </div>
        <div style="max-height: 50vh; overflow-y:auto; border:1px solid #E2E8F0; border-radius:6px;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead style="background:#F1F5F9; position:sticky; top:0;">
                    <tr>
                        <th style="padding:8px; width:40px;">#</th>
                        <th style="padding:8px;">回答文</th>
                        <th style="padding:8px; width:80px; text-align:right;">適合度</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
    modal.style.display = 'flex';
};

/**
 * テーマ回答のCSV出力
 */
window.exportThemeCsv = function(themeId) {
    const theme = AppState.analysisResult.themes.find(t => t.id === themeId);
    if (!theme) return;

    const matchedResponses = AppState.analysisResult.responsesWithTheme
        .filter(r => r.primaryThemeId === themeId)
        .sort((a, b) => b.confidence - a.confidence);

    const csvData = [
        ['No', 'ID', '因子名', '適合度(%)', '回答本文']
    ];

    matchedResponses.forEach((r, idx) => {
        csvData.push([
            idx + 1,
            r.id,
            theme.label,
            Math.round(r.confidence * 100),
            `"${r.text.replace(/"/g, '""')}"`
        ]);
    });

    const csvContent = "\uFEFF" + csvData.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `因子_${theme.label.replace(/[【】]/g, '')}_回答一覧.csv`;
    link.click();
};

/**
 * A4レポート出力 (印刷 / PDF保存)
 */
function printA4Report() {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer || resultsContainer.style.display === 'none') {
        alert('分析を実行してからレポート出力を行ってください');
        return;
    }

    // 印刷用メタ情報の設定
    const fileName = AppState.loadedFileName || 'アンケートデータ';
    const nowStr = new Date().toLocaleString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const validCount = (AppState.validResponses || []).length;

    const printFileName = document.getElementById('printFileName');
    const printDate = document.getElementById('printDate');
    const printDate2 = document.getElementById('printDate2');
    const printValidCount = document.getElementById('printValidCount');

    if (printFileName) printFileName.textContent = fileName;
    if (printDate) printDate.textContent = nowStr;
    if (printDate2) printDate2.textContent = `出力日時: ${nowStr}`;
    if (printValidCount) printValidCount.textContent = validCount.toLocaleString();

    // ブラウザの印刷ダイアログを起動
    setTimeout(() => {
        window.print();
    }, 120);
}

/**
 * レポート画像の保存 (html2canvas)
 */
async function exportReportImage() {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer || resultsContainer.style.display === 'none') {
        alert('分析を実行してから画像保存を行ってください');
        return;
    }

    showLoading('レポート画像を生成中...');
    try {
        if (typeof html2canvas === 'undefined') {
            throw new Error('画像生成ライブラリが読み込まれていません');
        }

        const canvas = await html2canvas(resultsContainer, {
            scale: 2,
            backgroundColor: '#F8FAFC',
            logging: false,
            useCORS: true
        });

        const link = document.createElement('a');
        link.download = `アンケート潜在因子分析レポート_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        alert('画像の保存に失敗しました: ' + err.message);
    } finally {
        hideLoading();
    }
}

/**
 * ヘルプモーダルの表示
 */
function showHelpModal() {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = '📖 アンケート自由記述 潜在因子分析ツールの見方と使い方';
    modalBody.innerHTML = `
        <div style="line-height:1.7;">
            <h4 style="margin-bottom:6px; color:#1E293B;">■ このツールについて</h4>
            <p style="margin-bottom:12px;">アンケートの自由記述テキストから、統計の難しい知識がなくてもワンクリックで背後にある「潜在的な因子（意見テーマ）」を発見し、パス図や因子空間マップで可視化するツールです。</p>
            
            <h4 style="margin-bottom:6px; color:#1E293B;">■ 各図の見方</h4>
            <ul style="margin-left:20px; margin-bottom:14px;">
                <li><b>【図1】因子構成比ドーナツ:</b> 各潜在因子が回答全体の何％を占めているかをひと目で把握できます。</li>
                <li><b>【図2】因子パス図:</b> 因子分析の象徴である構造図です。「潜在因子（楕円）」から「観測単語（四角）」へ伸びる矢印の太さと数値が<b>因子負荷量（関連の強さ）</b>を表します。</li>
                <li><b>【図3】因子空間ポジショニングマップ:</b>
                    <ul>
                        <li><b>回答者の因子得点:</b> 各回答者が2つの因子をどれくらい強く持っているかをプロット。ホバーで回答文が読めます。</li>
                        <li><b>語の因子負荷量:</b> 単語ごとの布置図。各語がどの因子軸に引っ張られているか（語同士の関係性）が分かります。</li>
                    </ul>
                </li>
                <li><b>【図4】属性別クロス集計:</b> 年代や満足度ごとの因子比率を比較できます。</li>
            </ul>
        </div>
    `;
    modal.style.display = 'flex';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
