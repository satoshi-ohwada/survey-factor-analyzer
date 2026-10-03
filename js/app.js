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
    analysisResult: null
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

    // 分析実行
    btnRun.addEventListener('click', () => {
        runFullPipeline();
    });

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
    showLoading('CSVファイルを読み込み中...');
    try {
        const parsed = await CsvParser.parse(file);
        processParsedData(parsed, file.name);
    } catch (err) {
        alert('CSVの読み込みに失敗しました: ' + err.message);
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

        // 4. 潜在因子・テーマ分析の実行 (NMF + PCA)
        const K = parseInt(document.getElementById('inputK').value, 10) || 3;
        AppState.kCount = K;

        const result = FactorEngine.analyze(validResponses, tfidfData.vocabulary, tfidfData.matrix, K);
        AppState.analysisResult = result;

        showLoading('各種グラフを描画中...');
        // 5. 結果のレンダリング
        renderResults(validResponses.length, junkCount, result);

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
function renderResults(validCount, junkCount, result) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.style.display = 'block';

    // サマリー表示
    document.getElementById('statTotalRows').textContent = AppState.rawRows.length;
    document.getElementById('statValidRows').textContent = validCount;
    document.getElementById('statJunkRows').textContent = junkCount;
    document.getElementById('statThemesCount').textContent = result.themes.length;

    // 【図1】テーマ構成比ドーナツチャート
    ChartRenderer.renderDonutChart('chartDonut', result.themes, (themeIndex) => {
        scrollToThemeCard(themeIndex);
    });

    // 【図2】意見ポジショニングマップ
    ChartRenderer.renderPositioningMap('chartPositioning', result.positioning2D, result.themes, (pointData) => {
        showResponseModal(pointData);
    });

    // 【図4】属性別クロス集計チャート（属性列が指定されている場合）
    const crossTabCard = document.getElementById('crossTabCard');
    if (AppState.attributeColumn) {
        crossTabCard.style.display = 'block';
        ChartRenderer.renderCrossTabChart('chartCrossTab', result.responsesWithTheme, result.themes, AppState.attributeColumn);
    } else {
        crossTabCard.style.display = 'none';
    }

    // 【図3 & 詳細】テーマカードのレンダリング
    renderThemeCards(result.themes);

    // 結果領域へスムーズスクロール
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
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
                    <span class="theme-index-badge" style="background:${color};">テーマ ${idx + 1}</span>
                    <span class="theme-title" id="theme-title-${theme.id}" title="クリックして名前を変更">
                        ${escapeHtml(theme.label)} ✏️
                    </span>
                </div>
                <span class="theme-share-badge">全体の <b>${theme.share}%</b> （${theme.count}件）</span>
            </div>
            <div class="theme-body-grid">
                <div class="theme-chart-col">
                    <div class="theme-chart-title">【特徴キーワードと影響度】</div>
                    <div id="chart-kw-${theme.id}"></div>
                </div>
                <div class="theme-responses-col">
                    <div>
                        <div class="responses-list-title">【このテーマの代表的な回答（抜粋）】</div>
                        ${responsesHtml}
                    </div>
                    <div class="theme-card-footer">
                        <button class="btn btn-sm" onclick="showAllThemeResponses(${theme.id})">
                            🔍 このテーマの全回答を見る (${theme.count}件)
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
            const newName = prompt('テーマの名称を編集してください:', currentText);
            if (newName && newName.trim() !== '') {
                theme.label = `【${newName.trim()}】`;
                titleEl.innerHTML = `${escapeHtml(theme.label)} ✏️`;
                // ドーナツや散布図も再描画
                ChartRenderer.renderDonutChart('chartDonut', themes, scrollToThemeCard);
                ChartRenderer.renderPositioningMap('chartPositioning', AppState.analysisResult.positioning2D, themes, showResponseModal);
                if (AppState.attributeColumn) {
                    ChartRenderer.renderCrossTabChart('chartCrossTab', AppState.analysisResult.responsesWithTheme, themes, AppState.attributeColumn);
                }
            }
        });

        // 【図3】重要キーワード横棒グラフの描画
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
        card.style.boxShadow = '0 0 0 3px #3B82F6';
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
                所属テーマ: ${escapeHtml(pointData.themeLabel)}
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
            <span style="color:#64748B;">テーマへの適合度順に並んでいます</span>
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
        ['No', 'ID', 'テーマ名', '適合度(%)', '回答本文']
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
    link.download = `テーマ_${theme.label.replace(/[【】]/g, '')}_回答一覧.csv`;
    link.click();
};

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

    modalTitle.textContent = '📖 アンケート自由記述 潜在因子分析ツールの使い方';
    modalBody.innerHTML = `
        <div style="line-height:1.7;">
            <h4 style="margin-bottom:6px; color:#1E293B;">■ このツールについて</h4>
            <p style="margin-bottom:12px;">アンケートの自由記述テキストから、統計の難しい知識がなくてもワンクリックで背後にある「潜在的な意見テーマ（因子）」を見つけ出すツールです。データは外部サーバーに送信されず、すべてブラウザ内で安全に解析されます。</p>
            
            <h4 style="margin-bottom:6px; color:#1E293B;">■ 使い方（かんたん3ステップ）</h4>
            <ol style="margin-left:20px; margin-bottom:14px;">
                <li><b>CSVファイルをドロップ</b>するか、「デモデータで試す」をクリックします。</li>
                <li><b>自由記述の列</b>と、必要に応じて年代などの<b>属性列</b>を選択します。</li>
                <li><b>「分析スタート」</b>を押すと、数秒で図とレポートが自動生成されます。</li>
            </ol>

            <h4 style="margin-bottom:6px; color:#1E293B;">■ 図の活用方法</h4>
            <ul style="margin-left:20px;">
                <li><b>全体構成比ドーナツ:</b> どのテーマが全体の何％を占めているか一目で分かります。クリックで各テーマにジャンプします。</li>
                <li><b>ポジショニングマップ:</b> 点にマウスを乗せると実際の回答文が読めます。似た意見が近くに集まります。</li>
                <li><b>テーマ名編集:</b> テーマのタイトルをクリックすると、好きな名前に自由に書き直せます。</li>
                <li><b>レポート画像保存:</b> 右上のボタンで、そのまま社内報告に貼れる高画質PNGを保存できます。</li>
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
