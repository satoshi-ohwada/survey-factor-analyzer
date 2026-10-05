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
    mapAxisY: 1,
    mapAttrFilter: '', // '' (全属性) または特定の属性値 (例: '20代')
    loadedFileName: '',

    // プレビュー＆データ編集状態
    previewMode: 'limit', // 'limit' (先頭5行) または 'all' (全行表示)
    previewPage: 1,
    previewPageSize: 50,
    previewFilterWarning: false, // true: 問題のある行のみ絞り込み
    selectedRowIndices: new Set() // 選択された行のインデックス一覧
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
    const btnRunTop = document.getElementById('btnRunAnalysisTop');
    const btnDecK = document.getElementById('btnDecK');
    const btnIncK = document.getElementById('btnIncK');
    const inputK = document.getElementById('inputK');
    const selectTextCol = document.getElementById('selectTextCol');
    const selectAttrCol = document.getElementById('selectAttrCol');
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
        renderDataPreview();
    });
    selectAttrCol.addEventListener('change', (e) => {
        AppState.attributeColumn = e.target.value || null;
        AppState.mapAttrFilter = '';
        renderDataPreview();
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

    const btnSwapAxes = document.getElementById('btnSwapAxes');
    if (btnSwapAxes) {
        btnSwapAxes.addEventListener('click', () => {
            const currentX = AppState.mapAxisX;
            const currentY = AppState.mapAxisY;
            AppState.mapAxisX = currentY;
            AppState.mapAxisY = currentX;
            if (selectMapAxisX) selectMapAxisX.value = currentY;
            if (selectMapAxisY) selectMapAxisY.value = currentX;
            updateFactorSpaceMap();
        });
    }

    // 属性による絞り込み変更
    const selectMapAttrFilter = document.getElementById('selectMapAttrFilter');
    if (selectMapAttrFilter) {
        selectMapAttrFilter.addEventListener('change', (e) => {
            AppState.mapAttrFilter = e.target.value;
            updateFactorSpaceMap();
        });
    }

    // 因子空間マップのモード切替（回答者得点 vs 語の負荷量）
    btnMapModeResponses.addEventListener('click', () => {
        AppState.mapMode = 'responses';
        btnMapModeResponses.className = 'btn btn-sm btn-primary';
        btnMapModeWords.className = 'btn btn-sm';
        setupAttrFilterSelector();
        updateFactorSpaceMap();
    });
    btnMapModeWords.addEventListener('click', () => {
        AppState.mapMode = 'words';
        btnMapModeWords.className = 'btn btn-sm btn-primary';
        btnMapModeResponses.className = 'btn btn-sm';
        setupAttrFilterSelector();
        updateFactorSpaceMap();
    });

    // 分析実行（最下部メインボタン ＆ 上部クイックボタン）
    if (btnRun) {
        btnRun.addEventListener('click', () => {
            runFullPipeline();
        });
    }
    if (btnRunTop) {
        btnRunTop.addEventListener('click', () => {
            runFullPipeline();
        });
    }

    // A4レポート出力 (印刷 / PDF)
    const btnPrintReport = document.getElementById('btnPrintReport');
    if (btnPrintReport) {
        btnPrintReport.addEventListener('click', () => {
            printA4Report();
        });
    }

    // 印刷前後のPlotlyグラフ自動リサイズ
    window.addEventListener('beforeprint', () => {
        updatePrintMetaInfo();
        document.querySelectorAll('.js-plotly-plot').forEach(el => {
            try { Plotly.Plots.resize(el); } catch (e) {}
        });
    });

    window.addEventListener('afterprint', () => {
        document.querySelectorAll('.js-plotly-plot').forEach(el => {
            try { Plotly.Plots.resize(el); } catch (e) {}
        });
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

    // データプレビュー操作コントロール
    const btnPreviewLimit = document.getElementById('btnPreviewLimit');
    const btnPreviewAll = document.getElementById('btnPreviewAll');
    const btnFilterWarnings = document.getElementById('btnFilterWarnings');
    const btnAddRow = document.getElementById('btnAddRow');
    const btnBulkDelete = document.getElementById('btnBulkDelete');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const previewTableThead = document.getElementById('previewTableThead');
    const previewTableTbody = document.getElementById('previewTableTbody');

    if (btnPreviewLimit) {
        btnPreviewLimit.addEventListener('click', () => {
            AppState.previewMode = 'limit';
            btnPreviewLimit.classList.add('active');
            btnPreviewAll.classList.remove('active');
            renderDataPreview();
        });
    }

    if (btnPreviewAll) {
        btnPreviewAll.addEventListener('click', () => {
            AppState.previewMode = 'all';
            btnPreviewLimit.classList.remove('active');
            btnPreviewAll.classList.add('active');
            renderDataPreview();
        });
    }

    if (btnFilterWarnings) {
        btnFilterWarnings.addEventListener('click', () => {
            AppState.previewFilterWarning = !AppState.previewFilterWarning;
            btnFilterWarnings.classList.toggle('active', AppState.previewFilterWarning);
            AppState.previewPage = 1;
            renderDataPreview();
        });
    }

    if (btnAddRow) {
        btnAddRow.addEventListener('click', () => {
            addNewRow();
        });
    }

    if (btnBulkDelete) {
        btnBulkDelete.addEventListener('click', () => {
            const count = AppState.selectedRowIndices.size;
            if (count === 0) return;
            if (confirm(`選択した ${count} 件のデータを一括削除しますか？`)) {
                // インデックスの降順（大きい順）にソートして削除
                const sorted = Array.from(AppState.selectedRowIndices).sort((a, b) => b - a);
                sorted.forEach(idx => {
                    if (idx >= 0 && idx < AppState.rawRows.length) {
                        AppState.rawRows.splice(idx, 1);
                    }
                });
                AppState.selectedRowIndices.clear();
                document.getElementById('fileNameDisplay').textContent = 
                    `📄 ${AppState.loadedFileName} (${AppState.rawRows.length}件のデータ)`;
                renderDataPreview();
                markDataDirty();
            }
        });
    }

    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', () => {
            if (AppState.previewPage > 1) {
                AppState.previewPage--;
                renderDataPreview();
            }
        });
    }

    if (btnNextPage) {
        btnNextPage.addEventListener('click', () => {
            AppState.previewPage++;
            renderDataPreview();
        });
    }

    // 全選択チェックボックス
    if (previewTableThead) {
        previewTableThead.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'checkSelectAll') {
                const checked = e.target.checked;
                const checkboxes = previewTableTbody.querySelectorAll('.row-checkbox');
                checkboxes.forEach(cb => {
                    const idx = parseInt(cb.getAttribute('data-row-idx'), 10);
                    cb.checked = checked;
                    const tr = document.getElementById(`previewRow_${idx}`);
                    if (checked) {
                        AppState.selectedRowIndices.add(idx);
                        if (tr) tr.classList.add('row-selected');
                    } else {
                        AppState.selectedRowIndices.delete(idx);
                        if (tr) tr.classList.remove('row-selected');
                    }
                });
                updateBulkDeleteBtn();
            }
        });
    }

    // プレビューテーブル内セルの直接編集・行チェック・行削除
    if (previewTableTbody) {
        // 行チェックボックスの変更
        previewTableTbody.addEventListener('change', (e) => {
            const cb = e.target.closest('.row-checkbox');
            if (cb) {
                const rowIdx = parseInt(cb.getAttribute('data-row-idx'), 10);
                const tr = document.getElementById(`previewRow_${rowIdx}`);
                if (cb.checked) {
                    AppState.selectedRowIndices.add(rowIdx);
                    if (tr) tr.classList.add('row-selected');
                } else {
                    AppState.selectedRowIndices.delete(rowIdx);
                    if (tr) tr.classList.remove('row-selected');
                }
                updateBulkDeleteBtn();
                updateSelectAllState();
            }
        });

        previewTableTbody.addEventListener('focusout', (e) => {
            const cell = e.target.closest('.cell-editable');
            if (cell) {
                const rowIdx = parseInt(cell.getAttribute('data-row-idx'), 10);
                const col = cell.getAttribute('data-col');
                const newVal = cell.innerText.trim();
                if (AppState.rawRows[rowIdx]) {
                    AppState.rawRows[rowIdx][col] = newVal;
                    updateRowAndAlertsAfterEdit(rowIdx);
                }
            }
        });

        previewTableTbody.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const cell = e.target.closest('.cell-editable');
                if (cell) {
                    e.preventDefault();
                    cell.blur();
                }
            }
        });

        previewTableTbody.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.btn-row-del');
            if (delBtn) {
                const rowIdx = parseInt(delBtn.getAttribute('data-row-idx'), 10);
                if (confirm(`行 ${rowIdx + 1} を削除しますか？`)) {
                    AppState.rawRows.splice(rowIdx, 1);
                    AppState.selectedRowIndices.delete(rowIdx);
                    const updated = new Set();
                    AppState.selectedRowIndices.forEach(idx => {
                        if (idx < rowIdx) updated.add(idx);
                        else if (idx > rowIdx) updated.add(idx - 1);
                    });
                    AppState.selectedRowIndices = updated;
                    document.getElementById('fileNameDisplay').textContent = 
                        `📄 ${AppState.loadedFileName} (${AppState.rawRows.length}件のデータ)`;
                    renderDataPreview();
                    markDataDirty();
                }
            }
        });
    }
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
    const fileStatusBar = document.getElementById('fileStatusBar');
    const configGrid = document.getElementById('configGrid');
    const runActionArea = document.getElementById('runActionArea');
    const btnRun = document.getElementById('btnRunAnalysis');
    const btnRunTop = document.getElementById('btnRunAnalysisTop');

    fileNameDisplay.textContent = `📄 ${fileName} (${parsed.rows.length}件のデータ)`;
    if (fileStatusBar) fileStatusBar.style.display = 'flex';

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
    if (runActionArea) runActionArea.style.display = 'flex';
    if (btnRun) btnRun.disabled = false;
    if (btnRunTop) btnRunTop.disabled = false;

    // プレビューの初期化と描画
    AppState.previewMode = 'limit';
    AppState.previewPage = 1;
    AppState.previewFilterWarning = false;
    AppState.selectedRowIndices.clear();
    const btnPreviewLimit = document.getElementById('btnPreviewLimit');
    const btnPreviewAll = document.getElementById('btnPreviewAll');
    const btnFilterWarnings = document.getElementById('btnFilterWarnings');
    if (btnPreviewLimit) btnPreviewLimit.classList.add('active');
    if (btnPreviewAll) btnPreviewAll.classList.remove('active');
    if (btnFilterWarnings) btnFilterWarnings.classList.remove('active');

    renderDataPreview();
}

/**
 * データプレビュー＆品質チェックの描画
 */
function renderDataPreview() {
    const previewSection = document.getElementById('previewSection');
    if (!previewSection || AppState.rawRows.length === 0) return;

    previewSection.style.display = 'block';

    const thead = document.getElementById('previewTableThead');
    const tbody = document.getElementById('previewTableTbody');
    const warningAlert = document.getElementById('previewWarningAlert');
    const successAlert = document.getElementById('previewSuccessAlert');
    const warningDesc = document.getElementById('previewWarningDesc');
    const warningRowCount = document.getElementById('warningRowCount');
    const previewStatsBadge = document.getElementById('previewStatsBadge');
    const previewShowingInfo = document.getElementById('previewShowingInfo');
    const previewPagination = document.getElementById('previewPagination');
    const pageInfo = document.getElementById('pageInfo');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const btnFilterWarnings = document.getElementById('btnFilterWarnings');

    // 1. 全行の入力品質判定
    const allAssessed = AppState.rawRows.map((row, idx) => {
        const quality = TextPreprocessor.checkQuality(row[AppState.textColumn]);
        return { row, idx, quality };
    });

    const totalCount = allAssessed.length;
    const problemItems = allAssessed.filter(item => item.quality.isProblem);
    const problemCount = problemItems.length;
    const emptyCount = allAssessed.filter(item => item.quality.status === 'empty').length;
    const junkCount = problemCount - emptyCount;

    // バッジとアラートの更新
    if (previewStatsBadge) previewStatsBadge.textContent = `全 ${totalCount} 件`;
    if (warningRowCount) warningRowCount.textContent = problemCount;

    if (problemCount > 0) {
        if (warningAlert) warningAlert.style.display = 'flex';
        if (successAlert) successAlert.style.display = 'none';
        if (warningDesc) {
            warningDesc.innerHTML = `選択中の自由記述列に、空欄または分析対象外となる回答が <b>${problemCount}件</b> あります（空欄: ${emptyCount}件, 定型無効・極短文等: ${junkCount}件）。<br><span style="color:#B45309;">※ このままでも分析実行時に自動除外されますが、下の表でクリックして直接テキストを修正・補完するか、不要な行はチェックして一括削除または右端の 🗑️ で削除できます。</span>`;
        }
        if (btnFilterWarnings) btnFilterWarnings.style.display = 'inline-flex';
    } else {
        if (warningAlert) warningAlert.style.display = 'none';
        if (successAlert) successAlert.style.display = 'flex';
        if (btnFilterWarnings) {
            btnFilterWarnings.style.display = 'none';
            AppState.previewFilterWarning = false;
            btnFilterWarnings.classList.remove('active');
        }
    }

    // 2. 表示対象リストの決定（フィルター反映）
    let itemsToDisplay = AppState.previewFilterWarning ? problemItems : allAssessed;

    // 3. 表示モード（先頭5件 vs 全件・ページネーション）
    let pageItems = [];
    if (AppState.previewMode === 'limit') {
        pageItems = itemsToDisplay.slice(0, 5);
        if (previewPagination) previewPagination.style.display = 'none';
        if (previewShowingInfo) {
            previewShowingInfo.textContent = `先頭 ${pageItems.length} 件を表示中 (全 ${totalCount} 件)`;
        }
    } else {
        // 全行表示モード（50件/ページ）
        const totalPages = Math.max(1, Math.ceil(itemsToDisplay.length / AppState.previewPageSize));
        if (AppState.previewPage > totalPages) AppState.previewPage = totalPages;
        if (AppState.previewPage < 1) AppState.previewPage = 1;

        const startIdx = (AppState.previewPage - 1) * AppState.previewPageSize;
        const endIdx = Math.min(itemsToDisplay.length, startIdx + AppState.previewPageSize);
        pageItems = itemsToDisplay.slice(startIdx, endIdx);

        if (itemsToDisplay.length > AppState.previewPageSize) {
            if (previewPagination) previewPagination.style.display = 'flex';
            if (pageInfo) pageInfo.textContent = `${AppState.previewPage} / ${totalPages} ページ`;
            if (btnPrevPage) btnPrevPage.disabled = (AppState.previewPage <= 1);
            if (btnNextPage) btnNextPage.disabled = (AppState.previewPage >= totalPages);
        } else {
            if (previewPagination) previewPagination.style.display = 'none';
        }

        const showStart = itemsToDisplay.length > 0 ? (startIdx + 1) : 0;
        if (previewShowingInfo) {
            previewShowingInfo.textContent = `${showStart}〜${endIdx} 件を表示中 (対象: ${itemsToDisplay.length} 件 / 全 ${totalCount} 件)`;
        }
    }

    // 4. テーブルヘッダーの描画
    if (thead) {
        let theadHtml = '<th class="col-check"><input type="checkbox" id="checkSelectAll" title="表示中の行をすべて選択 / 解除"></th>';
        theadHtml += '<th style="width: 45px; text-align: center;">#</th>';
        AppState.headers.forEach(h => {
            if (h === AppState.textColumn) {
                theadHtml += `<th class="col-target">${escapeHtml(h)} <span class="badge-col-target">自由記述</span></th>`;
            } else if (h === AppState.attributeColumn) {
                theadHtml += `<th class="col-attr">${escapeHtml(h)} <span class="badge-col-attr">属性</span></th>`;
            } else {
                theadHtml += `<th>${escapeHtml(h)}</th>`;
            }
        });
        theadHtml += '<th style="width: 90px; text-align: center;">入力状態</th>';
        theadHtml += '<th style="width: 45px; text-align: center;">削除</th>';
        thead.innerHTML = theadHtml;
    }

    // 5. テーブルボディの描画
    if (tbody) {
        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${AppState.headers.length + 4}" style="text-align: center; color: #94A3B8; padding: 24px;">該当するデータはありません</td></tr>`;
            updateBulkDeleteBtn();
            updateSelectAllState();
            return;
        }

        let tbodyHtml = '';
        pageItems.forEach(item => {
            const isProblem = item.quality.isProblem;
            const isSelected = AppState.selectedRowIndices.has(item.idx);
            const rowClass = `${isProblem ? 'row-problem' : ''} ${isSelected ? 'row-selected' : ''}`.trim();
            const badgeClass = isProblem 
                ? (item.quality.status === 'empty' ? 'badge-status-empty' : 'badge-status-junk')
                : 'badge-status-valid';

            tbodyHtml += `<tr class="${rowClass}" id="previewRow_${item.idx}">`;
            tbodyHtml += `<td class="col-check"><input type="checkbox" class="row-checkbox" data-row-idx="${item.idx}" ${isSelected ? 'checked' : ''} aria-label="行を選択"></td>`;
            tbodyHtml += `<td style="color:#64748B; font-weight:600; text-align:center;">${item.idx + 1}</td>`;

            AppState.headers.forEach(h => {
                const rawVal = item.row[h];
                const textVal = (rawVal !== undefined && rawVal !== null) ? String(rawVal) : '';
                const isTargetCol = (h === AppState.textColumn);
                const colClass = isTargetCol ? 'col-target-cell' : '';

                tbodyHtml += `<td class="cell-editable ${colClass}" contenteditable="true" data-row-idx="${item.idx}" data-col="${escapeHtml(h)}" title="クリックして編集">${escapeHtml(textVal)}</td>`;
            });

            tbodyHtml += `<td style="text-align:center;"><span class="badge-status ${badgeClass}" id="badgeStatus_${item.idx}" title="${escapeHtml(item.quality.detail)}">${item.quality.label}</span></td>`;
            tbodyHtml += `<td style="text-align:center;"><button type="button" class="btn-row-del" data-row-idx="${item.idx}" title="この行を削除">🗑️</button></td>`;
            tbodyHtml += '</tr>';
        });

        tbody.innerHTML = tbodyHtml;
        updateBulkDeleteBtn();
        updateSelectAllState();
    }
}

/**
 * 一括削除ボタンの表示・件数更新
 */
function updateBulkDeleteBtn() {
    const btnBulkDelete = document.getElementById('btnBulkDelete');
    const countSpan = document.getElementById('selectedRowCount');
    const count = AppState.selectedRowIndices.size;
    if (countSpan) countSpan.textContent = count;
    if (btnBulkDelete) {
        btnBulkDelete.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

/**
 * テーブルヘッダーの全選択チェックボックスの同期
 */
function updateSelectAllState() {
    const checkSelectAll = document.getElementById('checkSelectAll');
    if (!checkSelectAll) return;
    const checkboxes = document.querySelectorAll('#previewTableTbody .row-checkbox');
    if (checkboxes.length === 0) {
        checkSelectAll.checked = false;
        checkSelectAll.indeterminate = false;
        return;
    }
    let checkedCount = 0;
    checkboxes.forEach(cb => {
        if (cb.checked) checkedCount++;
    });
    if (checkedCount === 0) {
        checkSelectAll.checked = false;
        checkSelectAll.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
        checkSelectAll.checked = true;
        checkSelectAll.indeterminate = false;
    } else {
        checkSelectAll.checked = false;
        checkSelectAll.indeterminate = true;
    }
}

/**
 * セル編集後の単一行および全体アラートの差分更新
 */
function updateRowAndAlertsAfterEdit(rowIdx) {
    const row = AppState.rawRows[rowIdx];
    if (!row) return;

    const quality = TextPreprocessor.checkQuality(row[AppState.textColumn]);
    const tr = document.getElementById(`previewRow_${rowIdx}`);
    const badge = document.getElementById(`badgeStatus_${rowIdx}`);

    if (tr) {
        if (quality.isProblem) {
            tr.classList.add('row-problem');
        } else {
            tr.classList.remove('row-problem');
        }
    }

    if (badge) {
        const badgeClass = quality.isProblem 
            ? (quality.status === 'empty' ? 'badge-status-empty' : 'badge-status-junk')
            : 'badge-status-valid';
        badge.className = `badge-status ${badgeClass}`;
        badge.textContent = quality.label;
        badge.title = quality.detail;
    }

    // 全体の問題件数を再集計
    let problemCount = 0;
    let emptyCount = 0;
    AppState.rawRows.forEach(r => {
        const q = TextPreprocessor.checkQuality(r[AppState.textColumn]);
        if (q.isProblem) {
            problemCount++;
            if (q.status === 'empty') emptyCount++;
        }
    });
    const junkCount = problemCount - emptyCount;

    const warningAlert = document.getElementById('previewWarningAlert');
    const successAlert = document.getElementById('previewSuccessAlert');
    const warningDesc = document.getElementById('previewWarningDesc');
    const warningRowCount = document.getElementById('warningRowCount');
    const btnFilterWarnings = document.getElementById('btnFilterWarnings');

    if (warningRowCount) warningRowCount.textContent = problemCount;

    if (problemCount > 0) {
        if (warningAlert) warningAlert.style.display = 'flex';
        if (successAlert) successAlert.style.display = 'none';
        if (warningDesc) {
            warningDesc.innerHTML = `選択中の自由記述列に、空欄または分析対象外となる回答が <b>${problemCount}件</b> あります（空欄: ${emptyCount}件, 定型無効・極短文等: ${junkCount}件）。<br><span style="color:#B45309;">※ このままでも分析実行時に自動除外されますが、下の表でクリックして直接テキストを修正・補完するか、不要な行は右端の 🗑️ で削除できます。</span>`;
        }
        if (btnFilterWarnings) btnFilterWarnings.style.display = 'inline-flex';
    } else {
        if (warningAlert) warningAlert.style.display = 'none';
        if (successAlert) successAlert.style.display = 'flex';
        if (btnFilterWarnings) {
            btnFilterWarnings.style.display = 'none';
            AppState.previewFilterWarning = false;
            btnFilterWarnings.classList.remove('active');
        }
    }

    // 問題のみフィルター表示中に修正して問題がなくなった場合は、リスト更新を行う
    if (AppState.previewFilterWarning && !quality.isProblem) {
        renderDataPreview();
    }

    markDataDirty();
}

/**
 * プレビューデータの変更を検知し、分析結果が表示中なら再分析案内を表示
 */
function markDataDirty() {
    const notice = document.getElementById('dataChangedNotice');
    const resultsContainer = document.getElementById('resultsContainer');
    if (notice && resultsContainer && resultsContainer.style.display !== 'none') {
        notice.style.display = 'flex';
    }
}

/**
 * 新しい空行の追加
 */
function addNewRow() {
    const newRow = {};
    AppState.headers.forEach(h => {
        newRow[h] = '';
    });
    if (AppState.headers.includes('ID')) {
        newRow['ID'] = AppState.rawRows.length + 1;
    } else if (AppState.headers.includes('No')) {
        newRow['No'] = AppState.rawRows.length + 1;
    }
    AppState.rawRows.push(newRow);

    document.getElementById('fileNameDisplay').textContent = 
        `📄 ${AppState.loadedFileName} (${AppState.rawRows.length}件のデータ)`;

    // 全行表示モードにして最後のページへ移動
    AppState.previewMode = 'all';
    const btnPreviewLimit = document.getElementById('btnPreviewLimit');
    const btnPreviewAll = document.getElementById('btnPreviewAll');
    if (btnPreviewLimit) btnPreviewLimit.classList.remove('active');
    if (btnPreviewAll) btnPreviewAll.classList.add('active');

    const totalPages = Math.ceil(AppState.rawRows.length / AppState.previewPageSize);
    AppState.previewPage = totalPages;

    renderDataPreview();
    markDataDirty();

    // 追加された行へスクロールしてフォーカス
    setTimeout(() => {
        const lastRowTr = document.getElementById(`previewRow_${AppState.rawRows.length - 1}`);
        if (lastRowTr) {
            lastRowTr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const firstEditable = lastRowTr.querySelector('.cell-editable');
            if (firstEditable) firstEditable.focus();
        }
    }, 50);
}

/**
 * 分析パイプラインの実行
 */
async function runFullPipeline() {
    if (!AppState.textColumn) {
        alert('自由記述の列を選択してください');
        return;
    }

    AppState.mapAttrFilter = '';

    const btnRun = document.getElementById('btnRunAnalysis');
    const btnRunTop = document.getElementById('btnRunAnalysisTop');
    if (btnRun) btnRun.disabled = true;
    if (btnRunTop) btnRunTop.disabled = true;

    showLoading('形態素解析と日本語辞書を読み込み中...');
    try {
        // 1. Kuromojiの初期化
        await TextPreprocessor.init();

        showLoading('アンケートテキストを前処理中...');
        // 2. 有効回答の抽出（無意味回答および自立語なし文のスキップ）
        const validResponses = [];
        let junkCount = 0;

        AppState.rawRows.forEach((r, idx) => {
            const rawText = r[AppState.textColumn];
            const textStr = (rawText !== undefined && rawText !== null) ? String(rawText).trim() : '';

            if (TextPreprocessor.isJunkResponse(textStr)) {
                junkCount++;
            } else {
                // 形態素解析で名詞・動詞・形容詞などの有効語が1つ以上抽出できるか判定
                const tokens = TextPreprocessor.tokenize(textStr);
                if (tokens.length === 0) {
                    // 挨拶文・定型句など、分析対象となる特徴語が抽出できない回答
                    junkCount++;
                } else {
                    validResponses.push({
                        id: r.ID || r.id || r.No || (idx + 1),
                        text: textStr,
                        row: r
                    });
                }
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
        if (btnRun) btnRun.disabled = false;
        if (btnRunTop) btnRunTop.disabled = false;
        hideLoading();
    }
}

/**
 * 分析結果のUI描画
 */
function renderResults(validResponses, junkCount, result, tfidfData) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.style.display = 'block';

    const dataChangedNotice = document.getElementById('dataChangedNotice');
    if (dataChangedNotice) dataChangedNotice.style.display = 'none';

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

    // 属性別分析セクション（属性列が指定されている場合: 図4クロス集計）
    const attrSection = document.getElementById('attributeAnalysisSection');
    if (AppState.attributeColumn) {
        if (attrSection) attrSection.style.display = 'block';
        ChartRenderer.renderCrossTabChart('chartCrossTab', result.responsesWithTheme, result.themes, AppState.attributeColumn);
    } else {
        if (attrSection) attrSection.style.display = 'none';
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

    // 因子数が減った場合の境界チェックとリセット
    if (AppState.mapAxisX >= themes.length) {
        AppState.mapAxisX = 0;
    }
    if (AppState.mapAxisY >= themes.length) {
        AppState.mapAxisY = themes.length > 1 ? 1 : 0;
    }
    // X軸とY軸が同一で、2つ以上の因子がある場合はY軸を別の因子に設定
    if (AppState.mapAxisX === AppState.mapAxisY && themes.length > 1) {
        AppState.mapAxisY = (AppState.mapAxisX + 1) % themes.length;
    }

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

    setupAttrFilterSelector();
}

/**
 * 因子空間マップの属性絞り込みセレクタのセットアップ
 */
function setupAttrFilterSelector() {
    const attrFilterGroup = document.getElementById('attrFilterGroup');
    const selectAttrFilter = document.getElementById('selectMapAttrFilter');
    if (!attrFilterGroup || !selectAttrFilter) return;

    if (!AppState.attributeColumn || !AppState.analysisResult || AppState.mapMode === 'words') {
        attrFilterGroup.style.display = 'none';
        AppState.mapAttrFilter = '';
        return;
    }

    attrFilterGroup.style.display = 'flex';
    selectAttrFilter.innerHTML = '';

    // 全属性表示用オプション
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = '全属性（全体を表示）';
    if (!AppState.mapAttrFilter) optAll.selected = true;
    selectAttrFilter.appendChild(optAll);

    // 属性ごとの集計とソート
    const counts = {};
    AppState.analysisResult.responsesWithTheme.forEach(r => {
        const rawAttr = (r.row && AppState.attributeColumn) ? r.row[AppState.attributeColumn] : null;
        const attrVal = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '')
            ? String(rawAttr).trim()
            : '（未設定）';
        counts[attrVal] = (counts[attrVal] || 0) + 1;
    });

    const ORDER_MAP = {
        '大変不満': 1, '不満': 2, 'やや不満': 3, 'どちらともいえない': 4, '普通': 4, 'やや満足': 5, '満足': 6, '大変満足': 7,
        '非常に不満': 1, '非常に満足': 7, '悪い': 1, 'やや悪い': 2, '良い': 4, '大変良い': 5,
        '低': 1, '中': 2, '高': 3
    };

    const sortedAttrs = Object.keys(counts).sort((a, b) => {
        if (a === '（未設定）') return 1;
        if (b === '（未設定）') return -1;
        if (ORDER_MAP[a] && ORDER_MAP[b]) return ORDER_MAP[a] - ORDER_MAP[b];
        const numA = (a.match(/\d+/) || [])[0];
        const numB = (b.match(/\d+/) || [])[0];
        if (numA !== undefined && numB !== undefined && numA !== numB) {
            return parseInt(numA, 10) - parseInt(numB, 10);
        }
        return a.localeCompare(b, 'ja');
    });

    sortedAttrs.forEach(attrVal => {
        const opt = document.createElement('option');
        opt.value = attrVal;
        opt.textContent = `${attrVal} (N=${counts[attrVal]})`;
        if (AppState.mapAttrFilter === attrVal) opt.selected = true;
        selectAttrFilter.appendChild(opt);
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
        attributeCol: AppState.attributeColumn,
        filterAttrVal: AppState.mapAttrFilter,
        onPointClick: (pointData) => showResponseModal(pointData)
    });

    // レポート／印刷用（全属性並列スモールマルチプルズ）を裏で更新
    if (AppState.attributeColumn) {
        ChartRenderer.renderAttributeSmallMultiples('chartAttrMultiples', {
            xFactorIdx: AppState.mapAxisX,
            yFactorIdx: AppState.mapAxisY,
            themes,
            responsesWithTheme,
            W,
            attributeCol: AppState.attributeColumn,
            onPointClick: (pointData) => showResponseModal(pointData)
        });
    }
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
        const responsesHtml = theme.representativeResponses.map((r, rIdx) => {
            const rawAttr = (r.row && AppState.attributeColumn) ? r.row[AppState.attributeColumn] : null;
            const attrBadge = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '')
                ? `<span class="badge-attr">${escapeHtml(String(rawAttr).trim())}</span>`
                : '';
            return `
                <div class="response-item">
                    <b>${rIdx + 1}.</b> ${attrBadge}「${escapeHtml(r.text)}」
                </div>
            `;
        }).join('') || '<div class="response-item" style="color:#94A3B8;">該当する代表意見がありません</div>';

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
                const cleanedName = newName.trim().replace(/^[【「\[]+|[】」\]]+$/g, '');
                theme.label = `【${cleanedName}】`;
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

    const rawAttr = pointData.attrVal || (pointData.row && AppState.attributeColumn ? pointData.row[AppState.attributeColumn] : null);
    const attrHtml = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '')
        ? `<span class="badge-attr" style="font-size:12px; padding:4px 8px;">${escapeHtml(AppState.attributeColumn)}: ${escapeHtml(String(rawAttr).trim())}</span>`
        : '';

    modalTitle.textContent = `回答詳細 (ID: ${pointData.id || '-'})`;
    modalBody.innerHTML = `
        <div style="margin-bottom: 12px; display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
            <span class="badge-rec" style="font-size:12px; padding:4px 8px;">
                主所属因子: ${escapeHtml(pointData.themeLabel)}
            </span>
            ${attrHtml}
        </div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:8px; font-size:14px; line-height:1.6; white-space: pre-wrap; word-break: break-word;">
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

    const hasAttr = !!AppState.attributeColumn;
    const attrHeaderHtml = hasAttr ? `<th style="padding:8px; width:110px;">${escapeHtml(AppState.attributeColumn)}</th>` : '';

    const rowsHtml = matchedResponses.map((r, i) => {
        const rawAttr = (hasAttr && r.row) ? r.row[AppState.attributeColumn] : '';
        const attrVal = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '') ? String(rawAttr).trim() : '（未設定）';
        const attrCellHtml = hasAttr ? `<td style="padding:10px 8px; color:#475569; font-size:12px;"><span class="badge-attr">${escapeHtml(attrVal)}</span></td>` : '';

        return `
            <tr style="border-bottom:1px solid #E2E8F0;">
                <td style="padding:10px 8px; font-weight:700; color:#64748B;">${i + 1}</td>
                ${attrCellHtml}
                <td style="padding:10px 8px; color:#1E293B; white-space: pre-wrap; word-break: break-word;">${escapeHtml(r.text)}</td>
                <td style="padding:10px 8px; text-align:right; font-weight:600; color:#2563EB;">
                    ${Math.round(r.confidence * 100)}%
                </td>
            </tr>
        `;
    }).join('');

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
                        ${attrHeaderHtml}
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

    const escapeCsv = (val) => {
        const str = (val === null || val === undefined) ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
    };

    const hasAttr = !!AppState.attributeColumn;
    const headerRow = ['No', 'ID', '因子名'];
    if (hasAttr) headerRow.push(AppState.attributeColumn);
    headerRow.push('適合度(%)', '回答本文');

    const csvData = [
        headerRow.map(escapeCsv)
    ];

    matchedResponses.forEach((r, idx) => {
        const rowData = [
            idx + 1,
            r.id,
            theme.label
        ];
        if (hasAttr) {
            const rawAttr = r.row ? r.row[AppState.attributeColumn] : '';
            rowData.push(rawAttr !== undefined && rawAttr !== null ? String(rawAttr).trim() : '');
        }
        rowData.push(Math.round(r.confidence * 100), r.text);
        csvData.push(rowData.map(escapeCsv));
    });

    const csvContent = "\uFEFF" + csvData.map(e => e.join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const cleanFileName = theme.label.replace(/[【】\\/:*?"<>|]/g, '');
    link.download = `因子_${cleanFileName}_回答一覧.csv`;
    link.click();
};

/**
 * 印刷用ヘッダーメタ情報の更新
 */
function updatePrintMetaInfo() {
    const fileName = AppState.loadedFileName || 'アンケートデータ';
    const nowStr = new Date().toLocaleString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const validCount = (AppState.validResponses || []).length;
    const hasAttr = !!AppState.attributeColumn;
    const totalPages = hasAttr ? 3 : 2;

    const printFileName = document.getElementById('printFileName');
    const printDate = document.getElementById('printDate');
    const printDate2 = document.getElementById('printDate2');
    const printDateLast = document.getElementById('printDateLast');
    const printValidCount = document.getElementById('printValidCount');
    const printPage1Label = document.getElementById('printPage1Label');
    const printPage2Title = document.getElementById('printPage2Title');
    const printLastPageTitle = document.getElementById('printLastPageTitle');

    if (printFileName) printFileName.textContent = fileName;
    if (printDate) printDate.textContent = nowStr;
    if (printDate2) printDate2.textContent = `出力日時: ${nowStr}`;
    if (printDateLast) printDateLast.textContent = `出力日時: ${nowStr}`;
    if (printValidCount) printValidCount.textContent = validCount.toLocaleString();

    if (printPage1Label) {
        printPage1Label.textContent = `1 / ${totalPages} ページ (サマリー)`;
    }
    if (printPage2Title) {
        printPage2Title.textContent = `アンケート自由記述 潜在因子分析レポート - 2 / ${totalPages} ページ（属性別クロス集計 ＆ 意見ポジショニング分布）`;
    }
    if (printLastPageTitle) {
        printLastPageTitle.textContent = `アンケート自由記述 潜在因子分析レポート - ${totalPages} / ${totalPages} ページ（各因子の詳細 ＆ 生の声）`;
    }
}

/**
 * A4レポート出力 (印刷 / PDF保存)
 */
function printA4Report() {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer || resultsContainer.style.display === 'none') {
        alert('分析を実行してからレポート出力を行ってください');
        return;
    }

    updatePrintMetaInfo();

    // グラフのリサイズを実行してから印刷ダイアログを起動
    document.querySelectorAll('.js-plotly-plot').forEach(el => {
        try { Plotly.Plots.resize(el); } catch (e) {}
    });

    setTimeout(() => {
        window.print();
    }, 150);
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
