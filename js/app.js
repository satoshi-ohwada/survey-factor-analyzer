/**
 * メインアプリケーション制御スクリプト
 * UI操作・パイプライン実行・結果レンダリングを一元管理する
 */

// グローバル状態
const AppState = {
    rawRows: [],
    headers: [],
    validResponses: [],
    excludedResponses: [], // 分析対象外（除外）となった回答オブジェクトの一覧
    textColumn: null,
    attributeColumn: null,
    kCount: 3,
    analysisResult: null,
    mapMode: 'responses', // 'responses' (回答者スコア) または 'words' (語の関連度)
    mapAxisX: 0,
    mapAxisY: 1,
    mapAttrFilter: '', // '' (全属性) または特定の属性値 (例: '20代')
    loadedFileName: '',

    // カスタム辞書・ルール状態
    customStopWords: new Set(),
    customCompoundWords: new Set(),
    customSynonymRules: new Map(),

    // 形態素解析の抽出品詞選択状態
    selectedPos: {
        noun: true,
        verb: true,
        adj: true,
        adv: false,
        intj: false
    },

    // プレビュー＆データ編集状態
    previewMode: 'limit', // 'limit' (先頭5行) または 'all' (全行表示)
    previewPage: 1,
    previewPageSize: 50,
    previewFilterWarning: false, // true: 問題のある行のみ絞り込み
    selectedRowIndices: new Set(), // 選択された行のインデックス一覧
    columnFilters: {} // 列ごとのフィルター条件 { 列名: 値 }
};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await initCustomRules();
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

    // トピック空間マップのコントロール
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

    // ウィンドウ全体でのドラッグ＆ドロップによる意図しないファイルオープン（ページ離脱）を防止
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    }, false);
    window.addEventListener('drop', (e) => {
        e.preventDefault();
    }, false);

    // ドロップゾーンのドラッグ＆ドロップ
    let dragCounter = 0;
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dropZone.classList.remove('dragover');
        }
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropZone.classList.remove('dragover');

        let file = null;
        if (e.dataTransfer) {
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                file = e.dataTransfer.files[0];
            } else if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                const item = e.dataTransfer.items[0];
                if (item.kind === 'file') {
                    file = item.getAsFile();
                }
            }
        }

        if (file) {
            handleFileUpload(file);
        } else {
            alert('ドロップされたファイルを読み取れませんでした。もう一度お試しいただくか、「クリックして選択」からファイルを選択してください。');
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

    // トピック空間マップの軸変更
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

    // トピック空間マップのモード切替（回答者スコア vs 語の関連度）
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
        document.body.classList.add('is-printing');
        updatePrintMetaInfo();
        document.querySelectorAll('.js-plotly-plot').forEach(el => {
            try { Plotly.Plots.resize(el); } catch (e) {}
        });
    });

    window.addEventListener('afterprint', () => {
        cleanupPrintState();
    });

    // ヘルプ
    btnHelp.addEventListener('click', () => {
        showHelpModal();
    });

    // モーダルクローズ
    function closeDetailModal() {
        if (detailModal) {
            detailModal.style.display = 'none';
            const modalContent = detailModal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.classList.remove('modal-content-lg');
            }
        }
    }
    window.closeDetailModal = closeDetailModal;

    modalClose.addEventListener('click', closeDetailModal);
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            closeDetailModal();
        }
    });

    // 関連キーワード詳細モーダルの閉じるイベント
    const themeKeywordsModal = document.getElementById('themeKeywordsModal');
    const btnKwModalClose = document.getElementById('btnKwModalClose');
    if (btnKwModalClose) {
        btnKwModalClose.addEventListener('click', closeThemeKeywordsModal);
    }
    if (themeKeywordsModal) {
        themeKeywordsModal.addEventListener('click', (e) => {
            if (e.target === themeKeywordsModal) {
                closeThemeKeywordsModal();
            }
        });
    }

    // 除外回答一覧モーダルのイベントリスナー
    const excludedResponsesModal = document.getElementById('excludedResponsesModal');
    const btnExcludedModalClose = document.getElementById('btnExcludedModalClose');
    const btnOpenExcludedModal = document.getElementById('btnOpenExcludedModal');
    const statJunkRowsItem = document.getElementById('statJunkRowsItem');
    const btnExportExcludedCsv = document.getElementById('btnExportExcludedCsv');

    if (btnExcludedModalClose) {
        btnExcludedModalClose.addEventListener('click', closeExcludedResponsesModal);
    }
    if (excludedResponsesModal) {
        excludedResponsesModal.addEventListener('click', (e) => {
            if (e.target === excludedResponsesModal) {
                closeExcludedResponsesModal();
            }
        });
    }
    if (btnOpenExcludedModal) {
        btnOpenExcludedModal.addEventListener('click', () => {
            openExcludedResponsesModal('all');
        });
    }
    if (statJunkRowsItem) {
        statJunkRowsItem.addEventListener('click', () => {
            if (AppState.excludedResponses && AppState.excludedResponses.length > 0) {
                openExcludedResponsesModal('all');
            }
        });
        statJunkRowsItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (AppState.excludedResponses && AppState.excludedResponses.length > 0) {
                    openExcludedResponsesModal('all');
                }
            }
        });
    }
    if (btnExportExcludedCsv) {
        btnExportExcludedCsv.addEventListener('click', exportExcludedResponsesCsv);
    }

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

    // フィルター全クリアボタン
    const btnClearAllFilters = document.getElementById('btnClearAllFilters');
    if (btnClearAllFilters) {
        btnClearAllFilters.addEventListener('click', () => {
            clearAllColumnFilters();
        });
    }

    // コピペ入力ゾーンの初期化
    setupPasteZone();

    // カスタム辞書・除外ワード設定の初期化
    setupDictionaryEventListeners();

    // 形態素解析の抽出品詞選択の初期化
    setupPosEventListeners();
}

/**
 * コピー＆ペースト（Excel貼り付け）入力ゾーンのセットアップ
 */
function setupPasteZone() {
    const tabInputFile = document.getElementById('tabInputFile');
    const tabInputPaste = document.getElementById('tabInputPaste');
    const dropZoneWrapper = document.getElementById('dropZoneWrapper');
    const pasteZoneWrapper = document.getElementById('pasteZoneWrapper');
    const pasteTextarea = document.getElementById('pasteTextarea');
    const checkPasteHasHeader = document.getElementById('checkPasteHasHeader');
    const pasteStatsInfo = document.getElementById('pasteStatsInfo');
    const btnClearPaste = document.getElementById('btnClearPaste');
    const btnLoadPaste = document.getElementById('btnLoadPaste');

    if (!tabInputFile || !tabInputPaste || !pasteZoneWrapper || !pasteTextarea) return;

    // タブ切り替え関数
    const switchTab = (mode) => {
        if (mode === 'paste') {
            tabInputPaste.classList.add('active');
            tabInputFile.classList.remove('active');
            dropZoneWrapper.style.display = 'none';
            pasteZoneWrapper.style.display = 'block';
            pasteTextarea.focus();
        } else {
            tabInputFile.classList.add('active');
            tabInputPaste.classList.remove('active');
            dropZoneWrapper.style.display = 'block';
            pasteZoneWrapper.style.display = 'none';
        }
    };

    tabInputFile.addEventListener('click', () => switchTab('file'));
    tabInputPaste.addEventListener('click', () => switchTab('paste'));

    // 貼り付けテキストの行数・列数リアルタイム分析
    const updatePasteStats = () => {
        const text = pasteTextarea.value.trim();
        if (!text) {
            pasteStatsInfo.textContent = 'データが入力されていません';
            pasteStatsInfo.classList.remove('has-data');
            return;
        }
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) {
            pasteStatsInfo.textContent = 'データが入力されていません';
            pasteStatsInfo.classList.remove('has-data');
            return;
        }

        const sample = lines[0];
        const tabCount = (sample.match(/\t/g) || []).length;
        const commaCount = (sample.match(/,/g) || []).length;
        const colCount = Math.max(tabCount, commaCount) + 1;

        if (colCount > 1) {
            pasteStatsInfo.textContent = `📊 ${lines.length.toLocaleString()} 行 × ${colCount} 列 のデータを検出しました`;
        } else {
            pasteStatsInfo.textContent = `📝 ${lines.length.toLocaleString()} 行（1列テキスト）を検出しました`;
        }
        pasteStatsInfo.classList.add('has-data');
    };

    pasteTextarea.addEventListener('input', updatePasteStats);

    // クリアボタン
    if (btnClearPaste) {
        btnClearPaste.addEventListener('click', () => {
            pasteTextarea.value = '';
            updatePasteStats();
            pasteTextarea.focus();
        });
    }

    // 貼り付けデータ取り込み実行
    if (btnLoadPaste) {
        btnLoadPaste.addEventListener('click', () => {
            const text = pasteTextarea.value.trim();
            if (!text) {
                alert('Excel等からコピーしたデータを貼り付けてください');
                pasteTextarea.focus();
                return;
            }

            const hasHeader = checkPasteHasHeader ? checkPasteHasHeader.checked : true;
            showLoading('貼り付けたデータを解析中...');
            try {
                const parsed = CsvParser.parsePastedText(text, { hasHeader });
                processParsedData(parsed, 'エクセル貼り付けデータ');
            } catch (err) {
                alert('データの取り込みに失敗しました: ' + err.message);
            } finally {
                hideLoading();
            }
        });
    }

    // 画面全体でのCtrl+V検知（ファイル未読み込み時のスマート貼り付け）
    window.addEventListener('paste', (e) => {
        // すでに何らかの入力フォーム・テキストエリアにフォーカスがある場合は通常のペーストに任せる
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
            return;
        }

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;
        const pastedText = clipboardData.getData('text');
        if (pastedText && pastedText.trim().length > 0) {
            // 自動でコピペタブに切り替えて貼り付け
            switchTab('paste');
            pasteTextarea.value = pastedText;
            updatePasteStats();
        }
    });
}

/**
 * 行データが指定の列フィルター条件に合致するか判定
 * @param {Object} row 
 * @param {string} col 
 * @param {string|string[]} filterVal 
 * @returns {boolean}
 */
function isRowMatchFilter(row, col, filterVal) {
    if (filterVal === undefined || filterVal === null || filterVal === '') return true;
    const rawVal = row[col];
    const strVal = (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') ? String(rawVal).trim() : '（未設定）';
    if (Array.isArray(filterVal)) {
        if (filterVal.length === 0) return false;
        return filterVal.includes(strVal);
    }
    return strVal === String(filterVal).trim();
}

/**
 * 列フィルター（オートフィルター）条件を満たす行を元インデックス付きで取得
 * （自由記述列の無効判定は含めず、純粋に属性等の列フィルターで絞り込まれた行を返す）
 * @returns {Array<{ row: object, idx: number }>}
 */
function getColumnFilteredRowsWithIndex() {
    const activeFilters = Object.entries(AppState.columnFilters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });

    const result = [];
    AppState.rawRows.forEach((row, idx) => {
        const matches = activeFilters.every(([col, val]) => isRowMatchFilter(row, col, val));
        if (matches) {
            result.push({ row, idx });
        }
    });
    return result;
}

/**
 * 現在の列フィルターを適用し、かつ分析対象（自由記述）が有効な行一覧を取得
 * （分析対象列が空欄あるいは記号・無効回答の行は自動的に除外）
 */
function getFilteredRows() {
    const activeFilters = Object.entries(AppState.columnFilters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });

    return AppState.rawRows.filter(r => {
        // 1. 各列のオートフィルター条件を満たすか判定
        const matchColFilters = activeFilters.every(([col, val]) => isRowMatchFilter(r, col, val));
        if (!matchColFilters) return false;

        // 2. 分析対象列（自由記述列）が空欄・記号等の無効回答の行は自動的に除外
        if (AppState.textColumn) {
            const rawText = r[AppState.textColumn];
            const textStr = (rawText !== undefined && rawText !== null) ? String(rawText).trim() : '';
            if (TextPreprocessor.isJunkResponse(textStr)) {
                return false;
            }
        }

        return true;
    });
}

/**
 * 列フィルターを設定
 * @param {string} col 
 * @param {string|string[]|null} val 
 */
function setColumnFilter(col, val) {
    if (val === undefined || val === null || val === '') {
        delete AppState.columnFilters[col];
    } else if (Array.isArray(val)) {
        if (val.length === 0) {
            delete AppState.columnFilters[col];
        } else {
            AppState.columnFilters[col] = [...val];
        }
    } else {
        AppState.columnFilters[col] = [String(val).trim()];
    }
    AppState.previewPage = 1;
    renderDataPreview();
    updateRunButtons();
    markDataDirty();
}

/**
 * すべての列フィルターを解除
 */
function clearAllColumnFilters() {
    AppState.columnFilters = {};
    AppState.previewPage = 1;
    renderDataPreview();
    updateRunButtons();
    markDataDirty();
}

/**
 * 分析スタートボタンの表記・ヒントを更新
 */
function updateRunButtons() {
    const btnRun = document.getElementById('btnRunAnalysis');
    const btnRunTop = document.getElementById('btnRunAnalysisTop');
    const runHint = document.querySelector('.run-action-hint');
    const filteredRows = getFilteredRows();
    const activeFilters = Object.entries(AppState.columnFilters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });
    const isFiltered = activeFilters.length > 0;
    const filterDesc = activeFilters.map(([c, v]) => {
        const vStr = Array.isArray(v) ? (v.length <= 2 ? v.join(', ') : `${v.slice(0, 2).join(', ')} ほか${v.length}件`) : v;
        return `${c}＝${vStr}`;
    }).join('; ');

    const totalRaw = AppState.rawRows.length;
    const hasExcluded = filteredRows.length < totalRaw;

    if (btnRun) {
        if (isFiltered) {
            btnRun.innerHTML = `<span class="btn-icon">🚀</span><span class="btn-text">絞り込んだ ${filteredRows.length}件 で分析スタート</span>`;
            if (runHint) runHint.innerHTML = `※ 絞り込み条件（<b>${escapeHtml(filterDesc)}</b>）に合致した有効な ${filteredRows.length}件 のみを対象に分析します`;
        } else if (hasExcluded) {
            btnRun.innerHTML = `<span class="btn-icon">🚀</span><span class="btn-text">有効な ${filteredRows.length}件 で分析スタート</span>`;
            if (runHint) runHint.textContent = `※ 空欄・記号等の無効データを除外した有効な ${filteredRows.length}件（全${totalRaw}件中）を対象に分析を開始します`;
        } else {
            btnRun.innerHTML = `<span class="btn-icon">🚀</span><span class="btn-text">分析スタート</span>`;
            if (runHint) runHint.textContent = `※設定とデータを確認したら、ここをクリックして分析（形態素解析・トピック抽出）を開始します`;
        }
    }
    if (btnRunTop) {
        if (isFiltered) {
            btnRunTop.textContent = `🚀 ${filteredRows.length}件を分析`;
        } else if (hasExcluded) {
            btnRunTop.textContent = `🚀 有効な${filteredRows.length}件を分析`;
        } else {
            btnRunTop.textContent = `🚀 分析スタート`;
        }
    }
}

/**
 * 適用中フィルターバー（#activeFiltersBar）のUI更新
 */
function updateActiveFiltersBar() {
    const bar = document.getElementById('activeFiltersBar');
    const list = document.getElementById('activeFiltersList');
    const countInfo = document.getElementById('activeFiltersCountInfo');
    if (!bar || !list) return;

    const activeEntries = Object.entries(AppState.columnFilters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });
    if (activeEntries.length === 0) {
        bar.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    bar.style.display = 'flex';
    list.innerHTML = '';

    activeEntries.forEach(([col, val]) => {
        const tag = document.createElement('span');
        tag.className = 'filter-tag';
        let valDisplay = '';
        if (Array.isArray(val)) {
            if (val.length === 1) {
                valDisplay = val[0];
            } else if (val.length <= 2) {
                valDisplay = val.join(', ');
            } else {
                valDisplay = `${val.slice(0, 2).join(', ')} ほか計${val.length}件`;
            }
        } else {
            valDisplay = String(val);
        }
        tag.innerHTML = `
            <span>${escapeHtml(col)}: <b>${escapeHtml(valDisplay)}</b></span>
            <button type="button" class="filter-tag-del" title="${escapeHtml(col)}のフィルターを解除" data-col="${escapeHtml(col)}">&times;</button>
        `;
        tag.querySelector('.filter-tag-del').addEventListener('click', () => {
            setColumnFilter(col, null);
        });
        list.appendChild(tag);
    });

    const filteredRows = getFilteredRows();
    if (countInfo) {
        countInfo.textContent = `全 ${AppState.rawRows.length}件中 ${filteredRows.length}件 に絞り込み中`;
    }
}

/**
 * Excel風ヘッダーフィルターメニューの表示（チェックボックス複数選択対応）
 */
function showColumnFilterMenu(triggerBtn, colName) {
    let menu = document.getElementById('excelFilterMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'excelFilterMenu';
        menu.className = 'excel-filter-menu';
        document.body.appendChild(menu);

        // 外側クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !e.target.closest('.btn-th-filter')) {
                menu.style.display = 'none';
            }
        });
    }

    // 既に開いている同じ列ボタンなら閉じる
    if (menu.style.display === 'flex' && menu.getAttribute('data-target-col') === colName) {
        menu.style.display = 'none';
        return;
    }

    menu.setAttribute('data-target-col', colName);
    menu.innerHTML = '';

    // ヘッダー（タイトル + 閉じるボタン）
    const headerEl = document.createElement('div');
    headerEl.className = 'excel-filter-menu-header';
    headerEl.innerHTML = `
        <span class="excel-filter-menu-title">【${escapeHtml(colName)}】で絞り込み</span>
        <button type="button" class="excel-filter-menu-close" title="閉じる">&times;</button>
    `;
    headerEl.querySelector('.excel-filter-menu-close').addEventListener('click', () => {
        menu.style.display = 'none';
    });
    menu.appendChild(headerEl);

    // その列のユニーク値と件数を集計（他の列フィルターを考慮した候補件数）
    const otherFilters = { ...AppState.columnFilters };
    delete otherFilters[colName];
    const otherFilteredRows = AppState.rawRows.filter(r => {
        return Object.entries(otherFilters).every(([c, v]) => isRowMatchFilter(r, c, v));
    });

    const valCounts = {};
    otherFilteredRows.forEach(r => {
        const raw = r[colName];
        const val = (raw !== undefined && raw !== null && String(raw).trim() !== '') ? String(raw).trim() : '（未設定）';
        valCounts[val] = (valCounts[val] || 0) + 1;
    });

    // 属性の自然順序ソート（評価尺度・数値・未設定対応）
    const sortedVals = ChartRenderer.sortAttributeValues(Object.keys(valCounts));

    // 現在の選択状態
    const currentFilter = AppState.columnFilters[colName];
    let selectedSet;
    if (!currentFilter || (Array.isArray(currentFilter) && currentFilter.length === 0)) {
        // 未設定時は全選択
        selectedSet = new Set(sortedVals);
    } else if (Array.isArray(currentFilter)) {
        selectedSet = new Set(currentFilter);
    } else {
        selectedSet = new Set([String(currentFilter).trim()]);
    }

    // クイックアクションバー（全選択 / 全解除）
    const actionsEl = document.createElement('div');
    actionsEl.className = 'excel-filter-actions';
    actionsEl.innerHTML = `
        <button type="button" class="btn-filter-action" id="btnFilterSelectAll">全選択</button>
        <button type="button" class="btn-filter-action" id="btnFilterClearAll">全解除</button>
    `;
    menu.appendChild(actionsEl);

    // リストコンテナ
    const listEl = document.createElement('div');
    listEl.className = 'excel-filter-list';

    // 「(すべて選択)」チェックボックス項目
    const itemAll = document.createElement('label');
    itemAll.className = 'excel-filter-item';
    const chkAll = document.createElement('input');
    chkAll.type = 'checkbox';
    chkAll.className = 'excel-filter-checkbox';
    itemAll.appendChild(chkAll);

    const lblAll = document.createElement('span');
    lblAll.className = 'excel-filter-label';
    lblAll.innerHTML = '<b>(すべて選択)</b>';
    itemAll.appendChild(lblAll);

    const countAll = document.createElement('span');
    countAll.className = 'excel-filter-item-count';
    countAll.textContent = `${otherFilteredRows.length}件`;
    itemAll.appendChild(countAll);

    listEl.appendChild(itemAll);

    // 区切り線
    const divider = document.createElement('div');
    divider.className = 'excel-filter-divider';
    listEl.appendChild(divider);

    // 各ユニーク値チェックボックス項目
    const itemCheckboxes = [];
    sortedVals.forEach(val => {
        const item = document.createElement('label');
        item.className = 'excel-filter-item';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'excel-filter-checkbox';
        chk.value = val;
        chk.checked = selectedSet.has(val);
        item.appendChild(chk);

        const lbl = document.createElement('span');
        lbl.className = 'excel-filter-label';
        lbl.textContent = val;
        item.appendChild(lbl);

        const countSpan = document.createElement('span');
        countSpan.className = 'excel-filter-item-count';
        countSpan.textContent = `${valCounts[val]}件`;
        item.appendChild(countSpan);

        itemCheckboxes.push(chk);
        listEl.appendChild(item);
    });

    menu.appendChild(listEl);

    // フッター（キャンセル / 適用）
    const footerEl = document.createElement('div');
    footerEl.className = 'excel-filter-footer';
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn-filter-cancel';
    btnCancel.textContent = 'キャンセル';
    btnCancel.addEventListener('click', () => {
        menu.style.display = 'none';
    });

    const btnApply = document.createElement('button');
    btnApply.type = 'button';
    btnApply.className = 'btn-filter-apply';
    btnApply.textContent = '適用';
    footerEl.appendChild(btnCancel);
    footerEl.appendChild(btnApply);
    menu.appendChild(footerEl);

    // チェック状態の同期更新関数
    function syncAllCheckbox() {
        const checkedCount = itemCheckboxes.filter(c => c.checked).length;
        if (checkedCount === 0) {
            chkAll.checked = false;
            chkAll.indeterminate = false;
            btnApply.disabled = true;
            btnApply.title = '1つ以上の項目を選択してください';
        } else if (checkedCount === itemCheckboxes.length) {
            chkAll.checked = true;
            chkAll.indeterminate = false;
            btnApply.disabled = false;
            btnApply.title = '';
        } else {
            chkAll.checked = false;
            chkAll.indeterminate = true;
            btnApply.disabled = false;
            btnApply.title = '';
        }
    }

    syncAllCheckbox();

    // イベント登録
    chkAll.addEventListener('change', () => {
        const checked = chkAll.checked;
        itemCheckboxes.forEach(c => { c.checked = checked; });
        syncAllCheckbox();
    });

    actionsEl.querySelector('#btnFilterSelectAll').addEventListener('click', () => {
        itemCheckboxes.forEach(c => { c.checked = true; });
        syncAllCheckbox();
    });

    actionsEl.querySelector('#btnFilterClearAll').addEventListener('click', () => {
        itemCheckboxes.forEach(c => { c.checked = false; });
        syncAllCheckbox();
    });

    itemCheckboxes.forEach(chk => {
        chk.addEventListener('change', () => {
            syncAllCheckbox();
        });
    });

    // 適用ボタンの処理
    btnApply.addEventListener('click', () => {
        const checkedVals = itemCheckboxes.filter(c => c.checked).map(c => c.value);
        if (checkedVals.length === 0) {
            return;
        }
        if (checkedVals.length === sortedVals.length) {
            // 全て選択された場合はフィルター解除
            setColumnFilter(colName, null);
        } else {
            setColumnFilter(colName, checkedVals);
        }
        menu.style.display = 'none';
    });

    // 位置合わせ（トリガーボタンの直下）
    const rect = triggerBtn.getBoundingClientRect();
    menu.style.display = 'flex';
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.min(window.innerWidth - 260, Math.max(10, rect.left + window.scrollX - 20))}px`;
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
    const fileInput = document.getElementById('csvFileInput');
    try {
        const parsed = await CsvParser.parse(file);
        processParsedData(parsed, file.name);
    } catch (err) {
        console.error('ファイルの読み込みエラー詳細:', err);
        alert(`ファイルの読み込みに失敗しました:\n${err.message}\n\n※ 対応形式: Excel (.xlsx, .xls), CSV, TSV, テキスト (.txt)\n※ 文字コードは UTF-8 および Shift_JIS (CP932) に対応しています。`);
    } finally {
        hideLoading();
        if (fileInput) fileInput.value = '';
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
    AppState.columnFilters = {};
    AppState.validResponses = [];
    AppState.analysisResult = null;
    AppState.mapAttrFilter = '';

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
    } else {
        AppState.textColumn = parsed.headers.length > 0 ? parsed.headers[0] : null;
        if (AppState.textColumn) {
            selectTextCol.value = AppState.textColumn;
        }
    }

    // 属性列の推測
    const guessedAttrCols = CsvParser.guessAttributeColumns(parsed.headers, parsed.rows, AppState.textColumn);
    if (guessedAttrCols.length > 0) {
        selectAttrCol.value = guessedAttrCols[0];
        AppState.attributeColumn = guessedAttrCols[0];
    } else {
        selectAttrCol.value = '';
        AppState.attributeColumn = null;
    }

    // 以前の分析結果コンテナを非表示・リセット
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) resultsContainer.style.display = 'none';
    const dataChangedNotice = document.getElementById('dataChangedNotice');
    if (dataChangedNotice) dataChangedNotice.style.display = 'none';
    const attrSection = document.getElementById('attributeAnalysisSection');
    if (attrSection) attrSection.style.display = 'none';
    const chartCrossTab = document.getElementById('chartCrossTab');
    if (chartCrossTab) chartCrossTab.innerHTML = '';
    const chartAttrMultiples = document.getElementById('chartAttrMultiples');
    if (chartAttrMultiples) chartAttrMultiples.innerHTML = '';

    // テーマ数の推奨初期値
    const optimalK = FactorEngine.estimateOptimalK(parsed.rows.length, 50);
    document.getElementById('inputK').value = optimalK;
    AppState.kCount = optimalK;

    configGrid.style.display = 'block';
    const dictSection = document.getElementById('dictionarySection');
    if (dictSection) dictSection.style.display = 'block';
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

    // 1. 列フィルター（Excelオートフィルター）の適用と入力品質判定
    const activeFilters = Object.entries(AppState.columnFilters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });
    const filteredRowsWithIdx = [];

    AppState.rawRows.forEach((row, idx) => {
        const matches = activeFilters.every(([col, val]) => isRowMatchFilter(row, col, val));
        if (matches) {
            filteredRowsWithIdx.push({ row, idx });
        }
    });

    const allAssessed = filteredRowsWithIdx.map(({ row, idx }) => {
        const quality = TextPreprocessor.checkQuality(row[AppState.textColumn]);
        return { row, idx, quality };
    });

    const totalCount = AppState.rawRows.length;
    const filteredCount = allAssessed.length;
    const problemItems = allAssessed.filter(item => item.quality.isProblem);
    const validItems = allAssessed.filter(item => !item.quality.isProblem);
    const problemCount = problemItems.length;
    const validCount = validItems.length;
    const emptyCount = allAssessed.filter(item => item.quality.status === 'empty').length;
    const junkCount = problemCount - emptyCount;

    // バッジとアラートの更新
    if (previewStatsBadge) {
        if (problemCount > 0) {
            previewStatsBadge.textContent = `分析対象: ${validCount} 件 (自動除外: ${problemCount} 件 / 全 ${totalCount} 件)`;
        } else if (activeFilters.length > 0) {
            previewStatsBadge.textContent = `全 ${totalCount} 件中 ${validCount} 件`;
        } else {
            previewStatsBadge.textContent = `全 ${totalCount} 件`;
        }
    }
    if (warningRowCount) warningRowCount.textContent = problemCount;

    if (problemCount > 0) {
        if (warningAlert) warningAlert.style.display = 'flex';
        if (successAlert) successAlert.style.display = 'none';
        if (warningDesc) {
            warningDesc.innerHTML = `選択中の自由記述列で、空欄や記号・無効回答の <b>${problemCount}件</b> を分析対象から<b>自動的に除外</b>しました（有効な <b>${validCount}件</b> を分析対象とします）。<br><span style="color:#64748B;">※ 自動除外された行（空欄: ${emptyCount}件, 記号・定型等: ${junkCount}件）の内容を確認・編集したい場合は、上の「⚠️ 対象外の行 (${problemCount})」ボタンをクリックしてください。</span>`;
        }
        if (btnFilterWarnings) {
            btnFilterWarnings.style.display = 'inline-flex';
            btnFilterWarnings.innerHTML = `⚠️ 対象外の行 (<span id="warningRowCount">${problemCount}</span>)`;
        }
    } else {
        if (warningAlert) warningAlert.style.display = 'none';
        if (successAlert) successAlert.style.display = 'flex';
        if (btnFilterWarnings) {
            btnFilterWarnings.style.display = 'none';
            AppState.previewFilterWarning = false;
            btnFilterWarnings.classList.remove('active');
        }
    }

    // 適用中フィルターバーと実行ボタンの更新
    updateActiveFiltersBar();
    updateRunButtons();

    // 2. 表示対象リストの決定（品質フィルター反映）
    let itemsToDisplay = AppState.previewFilterWarning ? problemItems : allAssessed;
    const displayCount = itemsToDisplay.length;

    // 3. 表示モード（先頭5件 vs 全件・ページネーション）
    let pageItems = [];
    if (AppState.previewMode === 'limit') {
        pageItems = itemsToDisplay.slice(0, 5);
        if (previewPagination) previewPagination.style.display = 'none';
        if (previewShowingInfo) {
            previewShowingInfo.textContent = `先頭 ${pageItems.length} 件を表示中 (対象: ${displayCount} 件 / 全 ${totalCount} 件)`;
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
            previewShowingInfo.textContent = `${showStart}〜${endIdx} 件を表示中 (対象: ${displayCount} 件 / 全 ${totalCount} 件)`;
        }
    }

    // 4. テーブルヘッダーの描画（各列にExcel風フィルターボタンを付与）
    if (thead) {
        let theadHtml = '<th class="col-check"><input type="checkbox" id="checkSelectAll" title="表示中の行をすべて選択 / 解除"></th>';
        theadHtml += '<th style="width: 45px; text-align: center;">#</th>';
        AppState.headers.forEach(h => {
            const isTarget = (h === AppState.textColumn);
            const isAttr = (h === AppState.attributeColumn);
            const filterVals = AppState.columnFilters[h];
            const hasFilter = Array.isArray(filterVals) ? filterVals.length > 0 : (filterVals !== undefined && filterVals !== null && filterVals !== '');
            const filterBadgeText = hasFilter ? (Array.isArray(filterVals) && filterVals.length > 1 ? `▼ 絞込中(${filterVals.length})` : '▼ 絞込中') : '▼';
            const colClass = isTarget ? 'col-target' : (isAttr ? 'col-attr' : '');
            const badgeHtml = isTarget ? '<span class="badge-col-target">自由記述</span>' : (isAttr ? '<span class="badge-col-attr">属性</span>' : '');

            // 自由記述列以外にフィルターボタンを付与
            const filterBtnHtml = !isTarget ? `
                <button type="button" class="btn-th-filter ${hasFilter ? 'has-filter' : ''}" data-col="${escapeHtml(h)}" title="${escapeHtml(h)} で絞り込み">
                    ${filterBadgeText}
                </button>
            ` : '';

            theadHtml += `<th class="${colClass}">
                <div class="th-header-inner">
                    <span>${escapeHtml(h)} ${badgeHtml}</span>
                    ${filterBtnHtml}
                </div>
            </th>`;
        });
        theadHtml += '<th style="width: 90px; text-align: center;">入力状態</th>';
        theadHtml += '<th style="width: 45px; text-align: center;">削除</th>';
        thead.innerHTML = theadHtml;

        // フィルターボタンのイベントリスナー登録
        thead.querySelectorAll('.btn-th-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const col = btn.getAttribute('data-col');
                if (col) showColumnFilterMenu(btn, col);
            });
        });
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

            const statusLabel = isProblem ? `対象外: ${item.quality.label}` : item.quality.label;
            tbodyHtml += `<td style="text-align:center;"><span class="badge-status ${badgeClass}" id="badgeStatus_${item.idx}" title="${escapeHtml(item.quality.detail)}">${statusLabel}</span></td>`;
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
        badge.textContent = quality.isProblem ? `対象外: ${quality.label}` : quality.label;
        badge.title = quality.detail;
    }

    // 現在の表示対象（絞り込み中データ）の問題件数を再集計
    let problemCount = 0;
    let emptyCount = 0;
    const activeFilters = Object.entries(AppState.columnFilters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });
    const currentRows = AppState.rawRows.filter(r => activeFilters.every(([col, val]) => isRowMatchFilter(r, col, val)));
    currentRows.forEach(r => {
        const q = TextPreprocessor.checkQuality(r[AppState.textColumn]);
        if (q.isProblem) {
            problemCount++;
            if (q.status === 'empty') emptyCount++;
        }
    });
    const junkCount = problemCount - emptyCount;
    const validCount = currentRows.length - problemCount;
    const totalCount = AppState.rawRows.length;

    const warningAlert = document.getElementById('previewWarningAlert');
    const successAlert = document.getElementById('previewSuccessAlert');
    const warningDesc = document.getElementById('previewWarningDesc');
    const warningRowCount = document.getElementById('warningRowCount');
    const btnFilterWarnings = document.getElementById('btnFilterWarnings');
    const previewStatsBadge = document.getElementById('previewStatsBadge');

    if (previewStatsBadge) {
        if (problemCount > 0) {
            previewStatsBadge.textContent = `分析対象: ${validCount} 件 (自動除外: ${problemCount} 件 / 全 ${totalCount} 件)`;
        } else if (activeFilters.length > 0) {
            previewStatsBadge.textContent = `全 ${totalCount} 件中 ${validCount} 件`;
        } else {
            previewStatsBadge.textContent = `全 ${totalCount} 件`;
        }
    }

    if (warningRowCount) warningRowCount.textContent = problemCount;

    if (problemCount > 0) {
        if (warningAlert) warningAlert.style.display = 'flex';
        if (successAlert) successAlert.style.display = 'none';
        if (warningDesc) {
            warningDesc.innerHTML = `選択中の自由記述列で、空欄や記号・無効回答の <b>${problemCount}件</b> を分析対象から<b>自動的に除外</b>しました（有効な <b>${validCount}件</b> を分析対象とします）。<br><span style="color:#64748B;">※ 自動除外された行（空欄: ${emptyCount}件, 記号・定型等: ${junkCount}件）の内容を確認・編集したい場合は、上の「⚠️ 対象外の行 (${problemCount})」ボタンをクリックしてください。</span>`;
        }
        if (btnFilterWarnings) {
            btnFilterWarnings.style.display = 'inline-flex';
            btnFilterWarnings.innerHTML = `⚠️ 対象外の行 (<span id="warningRowCount">${problemCount}</span>)`;
        }
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

    updateRunButtons();
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
        // 現在適用中の列フィルターがある場合はその値を初期セット（表示から消えないようにする）
        if (AppState.columnFilters && AppState.columnFilters[h]) {
            const fVal = AppState.columnFilters[h];
            newRow[h] = Array.isArray(fVal) ? (fVal[0] || '') : fVal;
        } else {
            newRow[h] = '';
        }
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

    const filteredRows = getFilteredRows();
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / AppState.previewPageSize));
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
    // UIの最新の選択状態とAppStateを確実に同期
    const selectTextCol = document.getElementById('selectTextCol');
    const selectAttrCol = document.getElementById('selectAttrCol');
    if (selectTextCol) {
        AppState.textColumn = selectTextCol.value || null;
    }
    if (selectAttrCol) {
        AppState.attributeColumn = selectAttrCol.value || null;
    }

    // 属性列が現在のデータのヘッダーに存在しない場合は無効化
    if (AppState.attributeColumn && !AppState.headers.includes(AppState.attributeColumn)) {
        AppState.attributeColumn = null;
        if (selectAttrCol) selectAttrCol.value = '';
    }

    if (!AppState.textColumn || !AppState.headers.includes(AppState.textColumn)) {
        alert('有効な自由記述の列を選択してください');
        return;
    }

    AppState.mapAttrFilter = '';

    // 形態素解析の抽出品詞のバリデーション（最低1つ選択必須）
    const hasAnyPos = Object.values(AppState.selectedPos).some(v => v);
    if (!hasAnyPos) {
        alert('形態素解析で抽出する品詞を少なくとも1つ選択してください。');
        return;
    }

    const btnRun = document.getElementById('btnRunAnalysis');
    const btnRunTop = document.getElementById('btnRunAnalysisTop');
    if (btnRun) btnRun.disabled = true;
    if (btnRunTop) btnRunTop.disabled = true;

    showLoading('形態素解析と日本語辞書を読み込み中...');
    try {
        // 1. Kuromojiの初期化
        await TextPreprocessor.init();

        // カスタム辞書・ルール（除外語・複合語・表記ゆれ）を前処理モジュールにセット
        TextPreprocessor.setCustomRules({
            stopWords: AppState.customStopWords,
            compoundWords: AppState.customCompoundWords,
            synonymRules: AppState.customSynonymRules
        });

        // 形態素解析の抽出品詞フィルターをセット
        TextPreprocessor.setPosFilter(AppState.selectedPos);

        showLoading('アンケートテキストを前処理中...');
        // 2. 絞り込み条件（オートフィルター）を満たす行を取得
        const filteredItems = getColumnFilteredRowsWithIndex();
        if (filteredItems.length === 0) {
            alert('絞り込み条件に一致するデータが0件です。フィルター条件を変更してください。');
            return;
        }

        const validResponses = [];
        const excludedResponses = [];

        filteredItems.forEach(({ row: r, idx }) => {
            const rawText = r[AppState.textColumn];
            const textStr = (rawText !== undefined && rawText !== null) ? String(rawText).trim() : '';
            const rowId = r.ID || r.id || r.No || (idx + 1);

            const quality = TextPreprocessor.checkQuality(rawText);
            if (quality.isProblem) {
                excludedResponses.push({
                    id: rowId,
                    rowIndex: idx + 1,
                    rawIndex: idx,
                    text: textStr,
                    status: quality.status, // 'empty' | 'junk'
                    label: quality.label,   // '定型無効', '空欄', '記号のみ', etc.
                    detail: quality.detail,
                    row: r
                });
            } else {
                // 形態素解析で指定品詞の有効語が1つ以上抽出できるか判定
                const tokens = TextPreprocessor.tokenize(textStr, AppState.selectedPos);
                if (tokens.length === 0) {
                    // 挨拶文・定型句など、分析対象となる特徴語が抽出できない回答
                    excludedResponses.push({
                        id: rowId,
                        rowIndex: idx + 1,
                        rawIndex: idx,
                        text: textStr,
                        status: 'junk',
                        label: '有効語なし',
                        detail: '指定された品詞（名詞・動詞等）の有効単語が含まれていません',
                        row: r
                    });
                } else {
                    validResponses.push({
                        id: rowId,
                        rawIndex: idx,
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
        AppState.excludedResponses = excludedResponses;
        const junkCount = excludedResponses.length;

        showLoading('重要キーワードと潜在トピックを計算中...');
        // 3. TF-IDF 行列の構築（指定された品詞に基づく）
        const tfidfData = TextPreprocessor.buildTfIdfMatrix(validResponses, 70, AppState.selectedPos);

        if (tfidfData.vocabulary.length < 3) {
            alert('有効なキーワードが十分に抽出できませんでした。除外条件や単語を確認してください。');
            return;
        }

        // 4. 潜在トピック探索の実行 (NMF)
        const K = parseInt(document.getElementById('inputK').value, 10) || 3;
        AppState.kCount = K;

        const result = FactorEngine.analyze(validResponses, tfidfData.vocabulary, tfidfData.matrix, K, tfidfData.wordDocCounts);
        AppState.analysisResult = result;

        showLoading('図とパス図を描画中...');
        // 5. 結果のレンダリング
        renderResults(validResponses, junkCount, result, tfidfData, filteredItems.length);

    } catch (err) {
        console.error(err);
        alert('分析処理中にエラーが発生しました: ' + err.message);
    } finally {
        if (btnRun) btnRun.disabled = false;
        if (btnRunTop) btnRunTop.disabled = false;
        hideLoading();
    }
}
window.runFullPipeline = runFullPipeline;

/**
 * 分析結果のUI描画
 */
function renderResults(validResponses, junkCount, result, tfidfData, analyzedRowsCount) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.style.display = 'block';

    const dataChangedNotice = document.getElementById('dataChangedNotice');
    if (dataChangedNotice) dataChangedNotice.style.display = 'none';

    const validCount = validResponses.length;
    const totalCount = AppState.rawRows.length;
    const isFiltered = (analyzedRowsCount !== undefined && analyzedRowsCount < totalCount);

    // サマリー表示
    const statTotalRows = document.getElementById('statTotalRows');
    const statFilterNote = document.getElementById('statFilterNote');
    if (statTotalRows) {
        statTotalRows.textContent = (analyzedRowsCount || totalCount).toLocaleString();
    }
    if (statFilterNote) {
        if (isFiltered) {
            statFilterNote.textContent = `(全${totalCount.toLocaleString()}件から絞り込み)`;
        } else {
            statFilterNote.textContent = '';
        }
    }
    document.getElementById('statValidRows').textContent = validCount.toLocaleString();
    document.getElementById('statJunkRows').textContent = junkCount.toLocaleString();
    document.getElementById('statThemesCount').textContent = result.themes.length;

    const posNamesText = getSelectedPosNames().join('・');
    const statPosList = document.getElementById('statPosList');
    if (statPosList) statPosList.textContent = posNamesText || 'なし';
    const printPosList = document.getElementById('printPosList');
    if (printPosList) printPosList.textContent = posNamesText || 'なし';

    // 【表】テキスト全体の基本統計・特性プロファイルの描画
    renderTextStatsProfile(validResponses, junkCount, tfidfData, analyzedRowsCount);

    // 【図1】潜在トピックの全体構成比（ドーナツチャート）
    ChartRenderer.renderDonutChart('chartDonut', result.themes, (themeIndex) => {
        scrollToThemeCard(themeIndex);
    });

    // 【図2】パス図（トピック → 重要単語の関連度）
    ChartRenderer.renderPathDiagram('chartPathDiagram', result.themes, (themeIndex) => {
        scrollToThemeCard(themeIndex);
    });

    // 軸セレクタのオプション生成
    setupAxisSelectors(result.themes);

    // 【図3】トピック空間ポジショニングマップ
    updateFactorSpaceMap();

    // 属性別分析セクション（属性列が指定されている場合: 図4クロス集計）
    const attrSection = document.getElementById('attributeAnalysisSection');
    const hasValidAttrCol = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
    if (hasValidAttrCol) {
        if (attrSection) attrSection.style.display = 'block';
        ChartRenderer.renderCrossTabChart('chartCrossTab', result.responsesWithTheme, result.themes, AppState.attributeColumn, (themeIndex) => {
            scrollToThemeCard(themeIndex);
        });
    } else {
        if (attrSection) attrSection.style.display = 'none';
        const crossTabEl = document.getElementById('chartCrossTab');
        if (crossTabEl) crossTabEl.innerHTML = '';
        const multiplesEl = document.getElementById('chartAttrMultiples');
        if (multiplesEl) multiplesEl.innerHTML = '';
    }

    // 【各トピックの詳細カード】
    renderThemeCards(result.themes);

    // スムーズスクロール
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * テキスト全体の基本統計・特性プロファイルの描画
 */
function renderTextStatsProfile(validResponses, junkCount, tfidfData, analyzedRowsCount) {
    const totalRaw = AppState.rawRows.length;
    const analyzedCount = (analyzedRowsCount !== undefined) ? analyzedRowsCount : totalRaw;
    const validRows = validResponses.length;
    const validRate = analyzedCount > 0 ? Math.round((validRows / analyzedCount) * 100) : 100;

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

    const isFiltered = analyzedCount < totalRaw;
    const tblTotalRows = document.getElementById('tblTotalRows');
    if (tblTotalRows) {
        if (isFiltered) {
            tblTotalRows.innerHTML = `${analyzedCount.toLocaleString()} <span style="font-size:11px; color:#2563EB; font-weight:normal;">(全${totalRaw.toLocaleString()}件中)</span>`;
        } else {
            tblTotalRows.textContent = `${totalRaw.toLocaleString()}`;
        }
    }
    document.getElementById('tblValidRate').textContent = `${validRate}%`;
    document.getElementById('tblValidRows').textContent = validRows.toLocaleString();
    document.getElementById('tblJunkRows').textContent = junkCount.toLocaleString();
    document.getElementById('tblTotalChars').textContent = totalChars.toLocaleString();

    // 除外回答モーダル起動ボタンとサマリーバッジの表示制御
    const btnOpenExcludedModal = document.getElementById('btnOpenExcludedModal');
    if (btnOpenExcludedModal) {
        if (junkCount > 0) {
            btnOpenExcludedModal.style.display = 'inline-flex';
            btnOpenExcludedModal.innerHTML = `🔍 内訳を確認 (${junkCount}件)`;
        } else {
            btnOpenExcludedModal.style.display = 'none';
        }
    }
    const statJunkBadge = document.getElementById('statJunkBadge');
    if (statJunkBadge) {
        statJunkBadge.style.display = junkCount > 0 ? 'inline' : 'none';
    }

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
 * トピック空間マップの軸セレクタの更新
 */
function setupAxisSelectors(themes) {
    const selectX = document.getElementById('selectMapAxisX');
    const selectY = document.getElementById('selectMapAxisY');

    // トピック数が減った場合の境界チェックとリセット
    if (AppState.mapAxisX >= themes.length) {
        AppState.mapAxisX = 0;
    }
    if (AppState.mapAxisY >= themes.length) {
        AppState.mapAxisY = themes.length > 1 ? 1 : 0;
    }
    // X軸とY軸が同一で、2つ以上のトピックがある場合はY軸を別のトピックに設定
    if (AppState.mapAxisX === AppState.mapAxisY && themes.length > 1) {
        AppState.mapAxisY = (AppState.mapAxisX + 1) % themes.length;
    }

    selectX.innerHTML = '';
    selectY.innerHTML = '';

    themes.forEach((theme, idx) => {
        const cleanTitle = theme.label.replace(/^【|】$/g, '');
        const labelText = `トピック${idx + 1}: ${cleanTitle}`;

        const optX = document.createElement('option');
        optX.value = idx;
        optX.textContent = labelText;
        if (idx === AppState.mapAxisX) optX.selected = true;
        selectX.appendChild(optX);

        const optY = document.createElement('option');
        optY.value = idx;
        optY.textContent = labelText;
        // Y軸はデフォルトで「トピック2」または「トピック1以外」
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
 * トピック空間マップの属性絞り込みセレクタのセットアップ
 */
function setupAttrFilterSelector() {
    const attrFilterGroup = document.getElementById('attrFilterGroup');
    const selectAttrFilter = document.getElementById('selectMapAttrFilter');
    if (!attrFilterGroup || !selectAttrFilter) return;

    const hasValidAttrCol = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
    if (!hasValidAttrCol || !AppState.analysisResult || AppState.mapMode === 'words') {
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

    const sortedAttrs = ChartRenderer.sortAttributeValues(Object.keys(counts));

    sortedAttrs.forEach(attrVal => {
        const opt = document.createElement('option');
        opt.value = attrVal;
        opt.textContent = `${attrVal} (N=${counts[attrVal]})`;
        if (AppState.mapAttrFilter === attrVal) opt.selected = true;
        selectAttrFilter.appendChild(opt);
    });
}

/**
 * トピック空間ポジショニングマップの更新描画
 */
function updateFactorSpaceMap() {
    if (!AppState.analysisResult) return;

    const { themes, responsesWithTheme, W, H, vocabulary } = AppState.analysisResult;
    const hasValidAttrCol = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));

    ChartRenderer.renderFactorSpaceMap('chartFactorSpace', {
        mode: AppState.mapMode,
        xFactorIdx: AppState.mapAxisX,
        yFactorIdx: AppState.mapAxisY,
        themes,
        responsesWithTheme,
        W,
        H,
        vocabulary,
        attributeCol: hasValidAttrCol ? AppState.attributeColumn : null,
        filterAttrVal: hasValidAttrCol ? AppState.mapAttrFilter : '',
        onPointClick: (pointData) => showResponseModal(pointData)
    });

    // レポート／印刷用（全属性並列スモールマルチプルズ）を裏で更新
    const multiplesEl = document.getElementById('chartAttrMultiples');
    if (hasValidAttrCol) {
        ChartRenderer.renderAttributeSmallMultiples('chartAttrMultiples', {
            xFactorIdx: AppState.mapAxisX,
            yFactorIdx: AppState.mapAxisY,
            themes,
            responsesWithTheme,
            W,
            attributeCol: AppState.attributeColumn,
            onPointClick: (pointData) => showResponseModal(pointData)
        });
    } else {
        if (multiplesEl) multiplesEl.innerHTML = '';
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

        // 代表文章HTML
        const responsesHtml = theme.representativeResponses.map((r, rIdx) => {
            const rawAttr = (r.row && AppState.attributeColumn) ? r.row[AppState.attributeColumn] : null;
            const attrBadge = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '')
                ? `<span class="badge-attr">${escapeHtml(String(rawAttr).trim())}</span>`
                : '';
            return `<div class="response-item"><span class="response-num">${rIdx + 1}.</span>${attrBadge}<span class="response-text">「${escapeHtml(r.text.trim())}」</span></div>`;
        }).join('') || '<div class="response-item" style="color:#94A3B8;">該当する代表文章がありません</div>';

        card.innerHTML = `
            <div class="theme-card-header">
                <div class="theme-title-area">
                    <span class="theme-index-badge" style="background:${color};">トピック ${idx + 1}</span>
                    <span class="theme-title" id="theme-title-${theme.id}" title="クリックして名前を変更">
                        ${escapeHtml(theme.label)} ✏️
                    </span>
                </div>
                <span class="theme-share-badge">全体の <b>${theme.share}%</b> （${theme.count}件）</span>
            </div>
            <div class="theme-body-grid">
                <div class="theme-chart-col">
                    <div class="theme-chart-header">
                        <span class="theme-chart-title">【重要キーワード（関連度）】</span>
                        <button type="button" class="btn-kw-expand" id="btn-kw-expand-${theme.id}" data-theme-id="${theme.id}" data-expanded="false" title="表示単語数を切り替えます">
                            ＋ さらに表示 (12語)
                        </button>
                    </div>
                    <div id="chart-kw-${theme.id}"></div>
                    <div class="card-keywords-toolbar">
                        <div class="card-keywords-header">
                            <span>💡 単語を除外（クリックで除外＆自動再計算）:</span>
                        </div>
                        <div class="card-kw-tags" id="kw-tags-${theme.id}">
                            ${renderKwTagsHtml(theme.keywords, 6)}
                        </div>
                        <div class="card-kw-more-bar">
                            <button type="button" class="btn btn-xs btn-outline btn-open-kw-modal" data-theme-id="${theme.id}" title="上位30件の単語ランキング表・詳細グラフを確認">
                                📊 全関連単語一覧・詳細 (${theme.keywords.length}語)
                            </button>
                        </div>
                    </div>
                </div>
                <div class="theme-responses-col">
                    <div>
                        <div class="responses-list-title">【このトピックを強く反映している代表的な文章例（抜粋）】</div>
                        ${responsesHtml}
                    </div>
                    <div class="theme-card-footer">
                        <button class="btn btn-sm" onclick="showAllThemeResponses(${theme.id})">
                            🔍 このトピックの全回答を見る (${theme.count}件)
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
            const newName = prompt('トピックの名称を編集してください:', currentText);
            if (newName && newName.trim() !== '') {
                const cleanedName = newName.trim().replace(/^[【「\[]+|[】」\]]+$/g, '');
                theme.label = `【${cleanedName}】`;
                titleEl.innerHTML = `${escapeHtml(theme.label)} ✏️`;

                // すべての図（ドーナツ、パス図、トピック空間マップ、クロス集計）を連動再描画
                ChartRenderer.renderDonutChart('chartDonut', themes, scrollToThemeCard);
                ChartRenderer.renderPathDiagram('chartPathDiagram', themes, scrollToThemeCard);
                setupAxisSelectors(themes);
                updateFactorSpaceMap();

                const hasValidAttrCol = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
                if (hasValidAttrCol) {
                    ChartRenderer.renderCrossTabChart('chartCrossTab', AppState.analysisResult.responsesWithTheme, themes, AppState.attributeColumn, (themeIndex) => {
                        scrollToThemeCard(themeIndex);
                    });
                }
            }
        });

        // 重要キーワードの除外ボタンのイベント登録
        const tagsContainer = card.querySelector(`#kw-tags-${theme.id}`);
        if (tagsContainer) {
            attachKwExcludeHandlers(tagsContainer);
        }

        // 「＋ さらに表示 (12語)」トグルボタン
        const expandBtn = card.querySelector(`#btn-kw-expand-${theme.id}`);
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                const isExpanded = expandBtn.getAttribute('data-expanded') === 'true';
                const newExpanded = !isExpanded;
                expandBtn.setAttribute('data-expanded', String(newExpanded));

                const targetLimit = newExpanded ? 12 : 6;
                expandBtn.textContent = newExpanded ? '− 6語に戻す' : '＋ さらに表示 (12語)';

                // 棒グラフ再描画
                ChartRenderer.renderKeywordBarChart(`chart-kw-${theme.id}`, theme.keywords, color, targetLimit);

                // タグ再描画
                if (tagsContainer) {
                    tagsContainer.innerHTML = renderKwTagsHtml(theme.keywords, targetLimit);
                    attachKwExcludeHandlers(tagsContainer);
                }
            });
        }

        // 「📊 全関連単語一覧・詳細」モーダルボタン
        const openModalBtn = card.querySelector(`.btn-open-kw-modal[data-theme-id="${theme.id}"]`);
        if (openModalBtn) {
            openModalBtn.addEventListener('click', () => {
                openThemeKeywordsModal(theme.id);
            });
        }

        // 重要キーワード横棒グラフの初期描画（6語）
        setTimeout(() => {
            ChartRenderer.renderKeywordBarChart(`chart-kw-${theme.id}`, theme.keywords, color, 6);
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
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.classList.remove('modal-content-lg');
    }
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
                主所属トピック: ${escapeHtml(pointData.themeLabel)}
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
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.classList.add('modal-content-lg');
    }
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `${theme.label} の全回答一覧（${matchedResponses.length}件）`;

    const hasAttr = !!AppState.attributeColumn;
    const attrHeaderHtml = hasAttr ? `<th style="padding:10px 8px; width:120px;">${escapeHtml(AppState.attributeColumn)}</th>` : '';

    const rowsHtml = matchedResponses.map((r, i) => {
        const rawAttr = (hasAttr && r.row) ? r.row[AppState.attributeColumn] : '';
        const attrVal = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '') ? String(rawAttr).trim() : '（未設定）';
        const attrCellHtml = hasAttr ? `<td style="padding:10px 8px; color:#475569; font-size:12px;"><span class="badge-attr">${escapeHtml(attrVal)}</span></td>` : '';

        return `
            <tr style="border-bottom:1px solid #E2E8F0;">
                <td style="padding:10px 8px; font-weight:700; color:#64748B;">${i + 1}</td>
                ${attrCellHtml}
                <td style="padding:10px 8px; color:#1E293B; white-space: pre-wrap; word-break: break-word; line-height: 1.5;">${escapeHtml(r.text)}</td>
                <td style="padding:10px 8px; text-align:right; font-weight:600; color:#2563EB;">
                    ${Math.round(r.confidence * 100)}%
                </td>
            </tr>
        `;
    }).join('');

    modalBody.innerHTML = `
        <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="color:#64748B; font-size:13px;">トピックへの適合度（スコア割合）順に並んでいます（右横のスライダーをマウスで動かして上下に移動できます）</span>
            <button class="btn btn-sm" onclick="exportThemeCsv(${themeId})">📥 CSVダウンロード</button>
        </div>
        <div class="theme-responses-table-container" tabindex="0">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead style="background:#F1F5F9; position:sticky; top:0; z-index:2; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
                    <tr>
                        <th style="padding:10px 8px; width:45px;">#</th>
                        ${attrHeaderHtml}
                        <th style="padding:10px 8px;">回答文</th>
                        <th style="padding:10px 8px; width:85px; text-align:right;">適合度</th>
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

    const hasAttr = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
    const headerRow = ['No', 'ID', 'トピック名'];
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
    link.download = `トピック_${cleanFileName}_回答一覧.csv`;
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
    const hasAttr = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
    const totalPages = hasAttr ? 3 : 2;

    const printFileName = document.getElementById('printFileName');
    const printDate = document.getElementById('printDate');
    const printDate2 = document.getElementById('printDate2');
    const printDateLast = document.getElementById('printDateLast');
    const printValidCount = document.getElementById('printValidCount');
    const printPage1Label = document.getElementById('printPage1Label');
    const printPage2Title = document.getElementById('printPage2Title');
    const printLastPageTitle = document.getElementById('printLastPageTitle');

    const totalRaw = (AppState.rawRows || []).length;
    const filteredRows = getFilteredRows();
    const isFiltered = (filteredRows.length < totalRaw);

    if (printFileName) printFileName.textContent = fileName;
    if (printDate) printDate.textContent = nowStr;
    if (printDate2) printDate2.textContent = `出力日時: ${nowStr}`;
    if (printDateLast) printDateLast.textContent = `出力日時: ${nowStr}`;
    if (printValidCount) {
        if (isFiltered) {
            printValidCount.textContent = `${validCount.toLocaleString()} 件（対象: ${filteredRows.length.toLocaleString()}件 / 全${totalRaw.toLocaleString()}件）`;
        } else {
            printValidCount.textContent = `${validCount.toLocaleString()} 件`;
        }
    }

    // 絞り込み条件（オートフィルター）の反映
    const printFilterWrapper = document.getElementById('printFilterWrapper');
    const printFilterConditions = document.getElementById('printFilterConditions');
    const filterEntries = Object.entries(AppState.columnFilters || {}).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined && v !== null && v !== '';
    });
    if (printFilterWrapper && printFilterConditions) {
        if (filterEntries.length > 0) {
            printFilterWrapper.style.display = 'inline';
            printFilterConditions.textContent = filterEntries.map(([col, val]) => {
                const valStr = Array.isArray(val) ? val.join('・') : val;
                return `${col}＝「${valStr}」`;
            }).join(' AND ');
        } else {
            printFilterWrapper.style.display = 'none';
            printFilterConditions.textContent = '-';
        }
    }

    if (printPage1Label) {
        printPage1Label.textContent = `1 / ${totalPages} ページ (サマリー)`;
    }
    if (printPage2Title) {
        printPage2Title.textContent = `アンケート自由記述 潜在トピック探索レポート - 2 / ${totalPages} ページ（属性別クロス集計 ＆ 意見ポジショニング分布）`;
    }
    if (printLastPageTitle) {
        printLastPageTitle.textContent = `アンケート自由記述 潜在トピック探索レポート - ${totalPages} / ${totalPages} ページ（各トピックの詳細 ＆ 生の声）`;
    }
}

let currentPrintRestoreFn = null;

/**
 * 印刷用に全Plotlyグラフを高精細PNG画像に一時置換する
 * （数万件のSVGベクターによるPDF肥大化・印刷スプーラーのフリーズ・メモリ不足を防止）
 * @returns {Promise<Function>} 復元関数
 */
async function rasterizeChartsForPrint() {
    const plots = Array.from(document.querySelectorAll('.js-plotly-plot'));
    const restoreTasks = [];

    const tasks = plots.map(async (plotEl) => {
        // 表示されていないグラフはスキップ
        if (plotEl.offsetParent === null && !plotEl.closest('.print-only-block') && !plotEl.closest('#attributeAnalysisSection')) {
            return;
        }

        const isSubPlot = plotEl.classList.contains('attr-sub-plot');
        const defaultW = isSubPlot ? 320 : 600;
        const defaultH = isSubPlot ? 145 : 350;

        const rect = plotEl.getBoundingClientRect();
        const width = plotEl.clientWidth || Math.round(rect.width) || defaultW;
        const height = isSubPlot ? (plotEl.clientHeight || 145) : (plotEl.clientHeight || Math.round(rect.height) || defaultH);

        if (width <= 0 || height <= 0) return;

        try {
            const dataUrl = await Plotly.toImage(plotEl, {
                format: 'png',
                width: width,
                height: height,
                scale: 2 // 300dpi相当の高精細印刷用
            });

            const img = document.createElement('img');
            img.src = dataUrl;
            img.className = 'print-rasterized-chart';

            const originalChildren = Array.from(plotEl.children);
            originalChildren.forEach(child => {
                child.style.display = 'none';
            });

            plotEl.appendChild(img);

            restoreTasks.push(() => {
                if (img.parentNode === plotEl) {
                    plotEl.removeChild(img);
                }
                originalChildren.forEach(child => {
                    child.style.display = '';
                });
            });
        } catch (err) {
            console.warn('グラフのラスタライズ化スキップ:', err);
        }
    });

    await Promise.all(tasks);

    return () => {
        restoreTasks.forEach(task => task());
    };
}

/**
 * 印刷状態のクリーンアップ・元のインタラクティブ表示へ復元
 */
function cleanupPrintState() {
    if (currentPrintRestoreFn) {
        currentPrintRestoreFn();
        currentPrintRestoreFn = null;
    }
    document.body.classList.remove('is-printing');
    document.querySelectorAll('.js-plotly-plot').forEach(el => {
        try { Plotly.Plots.resize(el); } catch (e) {}
    });
}

/**
 * A4レポート出力 (印刷 / PDF保存)
 */
async function printA4Report() {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer || resultsContainer.style.display === 'none') {
        alert('分析を実行してからレポート出力を行ってください');
        return;
    }

    if (document.body.classList.contains('is-printing')) {
        return;
    }

    updatePrintMetaInfo();
    document.body.classList.add('is-printing');

    showLoading('印刷用レポートを軽量化処理中 (グラフの高速ラスタライズ)...');

    try {
        await new Promise(resolve => setTimeout(resolve, 80));

        document.querySelectorAll('.js-plotly-plot').forEach(el => {
            try { Plotly.Plots.resize(el); } catch (e) {}
        });

        await new Promise(resolve => setTimeout(resolve, 60));

        // SVGベクターを軽量高精細画像（PNG）に一括変換
        currentPrintRestoreFn = await rasterizeChartsForPrint();
    } catch (e) {
        console.error('ラスタライズ処理エラー:', e);
    } finally {
        hideLoading();
    }

    showToast('💡 レポートは「A4縦」で作成されています。印刷設定の【レイアウト】は「縦」をご指定ください', 6000);

    setTimeout(() => {
        window.print();

        // afterprint が発火しなかった環境用のフォールバックタイマー
        setTimeout(() => {
            cleanupPrintState();
        }, 12000);
    }, 150);
}

/**
 * ヘルプモーダルの表示
 */
function showHelpModal() {
    const modal = document.getElementById('detailModal');
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.classList.remove('modal-content-lg');
    }
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = '📖 アンケート自由記述 潜在トピック探索ツールの見方と使い方';
    modalBody.innerHTML = `
        <div style="line-height:1.7;">
            <h4 style="margin-bottom:6px; color:#1E293B;">■ このツールについて</h4>
            <p style="margin-bottom:12px;">アンケートの自由記述テキストから、統計の難しい知識がなくてもワンクリックで背後にある「潜在的なトピック（話題・テーマ）」を発見し、パス図やトピック空間マップで可視化するツールです。</p>
            
            <h4 style="margin-bottom:6px; color:#1E293B;">■ 各図の見方</h4>
            <ul style="margin-left:20px; margin-bottom:14px;">
                <li><b>【図1】トピック構成比ドーナツ:</b> 各潜在トピックが回答全体の何％を占めているかをひと目で把握できます。</li>
                <li><b>【図2】パス図:</b> 各トピック（楕円）から重要単語（四角）へ伸びる矢印の太さと数値が<b>関連度（関連の強さ、最大1.00）</b>を表します。</li>
                <li><b>【図3】トピック空間ポジショニングマップ:</b>
                    <ul>
                        <li><b>回答者スコア:</b> 各回答者が2つのトピックをどれくらい強く持っているかをプロット。ホバーで回答文が読めます。</li>
                        <li><b>語の関連度:</b> 単語ごとの布置図。各語がどのトピック軸と強く関連しているか（語同士の近さ）が分かります。</li>
                    </ul>
                </li>
                <li><b>【図4】属性別クロス集計:</b> 年代や満足度ごとのトピック比率を比較できます。</li>
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

// ========================================================
// カスタム辞書・除外ワード設定（ストップワード・複合語・表記ゆれ）
// ========================================================
const STORAGE_KEY_STOPWORDS = 'survey_factor_custom_stopwords';
const STORAGE_KEY_COMPOUNDS = 'survey_factor_custom_compounds';
const STORAGE_KEY_SYNONYMS = 'survey_factor_custom_synonyms';

let toastTimer = null;
let pendingImportRules = null;

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'flex';

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

function saveCustomRulesToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY_STOPWORDS, JSON.stringify(Array.from(AppState.customStopWords)));
        localStorage.setItem(STORAGE_KEY_COMPOUNDS, JSON.stringify(Array.from(AppState.customCompoundWords)));
        localStorage.setItem(STORAGE_KEY_SYNONYMS, JSON.stringify(Array.from(AppState.customSynonymRules.entries())));
    } catch (e) {
        console.warn('LocalStorage save failed:', e);
    }
}

async function initCustomRules() {
    AppState.customStopWords = new Set();
    AppState.customCompoundWords = new Set();
    AppState.customSynonymRules = new Map();

    let loadedFromStorage = false;
    try {
        const storedStop = localStorage.getItem(STORAGE_KEY_STOPWORDS);
        if (storedStop) {
            const arr = JSON.parse(storedStop);
            if (Array.isArray(arr) && arr.length > 0) {
                AppState.customStopWords = new Set(arr);
                loadedFromStorage = true;
            }
        }
        const storedComp = localStorage.getItem(STORAGE_KEY_COMPOUNDS);
        if (storedComp) {
            const arr = JSON.parse(storedComp);
            if (Array.isArray(arr) && arr.length > 0) {
                AppState.customCompoundWords = new Set(arr);
                loadedFromStorage = true;
            }
        }
        const storedSyn = localStorage.getItem(STORAGE_KEY_SYNONYMS);
        if (storedSyn) {
            const arr = JSON.parse(storedSyn);
            if (Array.isArray(arr) && arr.length > 0) {
                AppState.customSynonymRules = new Map(arr);
                loadedFromStorage = true;
            }
        }
    } catch (e) {
        console.warn('LocalStorage load failed:', e);
    }

    // 初回起動時、LocalStorage にデータがなければ data/custom_rules.txt を読み込む
    if (!loadedFromStorage && typeof fetch !== 'undefined') {
        try {
            const resp = await fetch('data/custom_rules.txt');
            if (resp.ok) {
                const txt = await resp.text();
                const parsed = TextPreprocessor.parseRulesText(txt);
                if (parsed.compoundWords.size > 0 || parsed.stopWords.size > 0 || parsed.synonymRules.size > 0) {
                    AppState.customCompoundWords = parsed.compoundWords;
                    AppState.customStopWords = parsed.stopWords;
                    AppState.customSynonymRules = parsed.synonymRules;
                    saveCustomRulesToStorage();
                }
            }
        } catch (e) {
            // ローカルファイル制限等の場合は無視
        }
    }

    renderCustomRulesUI();
}

function renderCustomRulesUI() {
    const stopwordsList = document.getElementById('stopwordsList');
    const compoundWordsList = document.getElementById('compoundWordsList');
    const synonymRulesList = document.getElementById('synonymRulesList');
    const badgeStop = document.getElementById('badgeStopwordsCount');
    const badgeComp = document.getElementById('badgeCompoundsCount');
    const badgeSyn = document.getElementById('badgeSynonymsCount');
    const summaryBadge = document.getElementById('dictRuleSummaryBadge');

    if (!stopwordsList || !compoundWordsList || !synonymRulesList) return;

    // ① 除外ワード
    stopwordsList.innerHTML = '';
    const sortedStop = Array.from(AppState.customStopWords).sort((a, b) => a.localeCompare(b, 'ja'));
    sortedStop.forEach(w => {
        const tag = document.createElement('span');
        tag.className = 'dict-tag';
        tag.innerHTML = `<span>${escapeHtml(w)}</span><button type="button" class="dict-tag-remove" data-action="remove-stopword" data-word="${escapeHtml(w)}" title="除外を解除">✕</button>`;
        stopwordsList.appendChild(tag);
    });
    if (badgeStop) badgeStop.textContent = sortedStop.length;

    // ② 複合語
    compoundWordsList.innerHTML = '';
    const sortedComp = Array.from(AppState.customCompoundWords).sort((a, b) => a.localeCompare(b, 'ja'));
    sortedComp.forEach(w => {
        const tag = document.createElement('span');
        tag.className = 'dict-tag';
        tag.innerHTML = `<span>${escapeHtml(w)}</span><button type="button" class="dict-tag-remove" data-action="remove-compound" data-word="${escapeHtml(w)}" title="複合語登録を解除">✕</button>`;
        compoundWordsList.appendChild(tag);
    });
    if (badgeComp) badgeComp.textContent = sortedComp.length;

    // ③ 表記ゆれ
    synonymRulesList.innerHTML = '';
    const sortedSyn = Array.from(AppState.customSynonymRules.entries()).sort((a, b) => a[0].localeCompare(b, 'ja'));
    sortedSyn.forEach(([from, to]) => {
        const tag = document.createElement('span');
        tag.className = 'dict-tag dict-tag-synonym';
        tag.innerHTML = `<span>${escapeHtml(from)} → ${escapeHtml(to)}</span><button type="button" class="dict-tag-remove" data-action="remove-synonym" data-from="${escapeHtml(from)}" title="表記ゆれルールを解除">✕</button>`;
        synonymRulesList.appendChild(tag);
    });
    if (badgeSyn) badgeSyn.textContent = sortedSyn.length;

    // サマリーバッジ
    const totalCount = sortedStop.length + sortedComp.length + sortedSyn.length;
    if (summaryBadge) {
        summaryBadge.textContent = `登録: ${totalCount}件`;
        if (totalCount > 0) {
            summaryBadge.classList.add('has-rules');
        } else {
            summaryBadge.classList.remove('has-rules');
        }
    }
}

function setupDictionaryEventListeners() {
    const dictHeader = document.getElementById('dictionaryHeader');
    const dictSection = document.getElementById('dictionarySection');
    const dictBody = document.getElementById('dictionaryBody');

    // アコーディオン開閉
    if (dictHeader && dictSection && dictBody) {
        const dictAccordionIcon = document.getElementById('dictAccordionIcon');
        dictHeader.addEventListener('click', () => {
            const isOpen = dictSection.classList.contains('is-open');
            if (isOpen) {
                dictSection.classList.remove('is-open');
                dictBody.style.display = 'none';
                if (dictAccordionIcon) dictAccordionIcon.textContent = '▼';
            } else {
                dictSection.classList.add('is-open');
                dictBody.style.display = 'block';
                if (dictAccordionIcon) dictAccordionIcon.textContent = '▲';
            }
        });
        dictHeader.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dictHeader.click();
            }
        });
    }

    // ① 除外ワード追加
    const inputStopword = document.getElementById('inputNewStopword');
    const btnAddStopword = document.getElementById('btnAddStopword');
    const addStopwordAction = () => {
        const word = (inputStopword.value || '').trim();
        if (!word) return;
        AppState.customStopWords.add(word);
        inputStopword.value = '';
        saveCustomRulesToStorage();
        renderCustomRulesUI();
        showToast(`除外ワードに「${word}」を追加しました`);
        markDataDirty();
    };
    if (btnAddStopword) btnAddStopword.addEventListener('click', addStopwordAction);
    if (inputStopword) {
        inputStopword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addStopwordAction();
            }
        });
    }

    // 除外ワードリスト内の削除ボタン
    const stopwordsList = document.getElementById('stopwordsList');
    if (stopwordsList) {
        stopwordsList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-stopword"]');
            if (btn) {
                const word = btn.getAttribute('data-word');
                if (word && AppState.customStopWords.has(word)) {
                    AppState.customStopWords.delete(word);
                    saveCustomRulesToStorage();
                    renderCustomRulesUI();
                    showToast(`除外ワード「${word}」を削除しました`);
                    markDataDirty();
                }
            }
        });
    }

    // 除外ワード初期化
    const btnResetStopwords = document.getElementById('btnResetStopwords');
    if (btnResetStopwords) {
        btnResetStopwords.addEventListener('click', () => {
            if (AppState.customStopWords.size === 0) return;
            if (confirm('登録した除外ワードをすべてクリアし、標準ストップワードのみに戻しますか？')) {
                AppState.customStopWords.clear();
                saveCustomRulesToStorage();
                renderCustomRulesUI();
                showToast('除外ワードを初期状態に戻しました');
                markDataDirty();
            }
        });
    }

    // ② 複合語追加
    const inputCompound = document.getElementById('inputNewCompound');
    const btnAddCompound = document.getElementById('btnAddCompound');
    const addCompoundAction = () => {
        const word = (inputCompound.value || '').trim();
        if (!word) return;
        AppState.customCompoundWords.add(word);
        inputCompound.value = '';
        saveCustomRulesToStorage();
        renderCustomRulesUI();
        showToast(`複合語に「${word}」を追加しました`);
        markDataDirty();
    };
    if (btnAddCompound) btnAddCompound.addEventListener('click', addCompoundAction);
    if (inputCompound) {
        inputCompound.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCompoundAction();
            }
        });
    }

    // 複合語リスト内の削除ボタン
    const compoundWordsList = document.getElementById('compoundWordsList');
    if (compoundWordsList) {
        compoundWordsList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-compound"]');
            if (btn) {
                const word = btn.getAttribute('data-word');
                if (word && AppState.customCompoundWords.has(word)) {
                    AppState.customCompoundWords.delete(word);
                    saveCustomRulesToStorage();
                    renderCustomRulesUI();
                    showToast(`複合語「${word}」を削除しました`);
                    markDataDirty();
                }
            }
        });
    }

    // 複合語クリア
    const btnClearCompounds = document.getElementById('btnClearCompounds');
    if (btnClearCompounds) {
        btnClearCompounds.addEventListener('click', () => {
            if (AppState.customCompoundWords.size === 0) return;
            if (confirm('登録した複合語をすべてクリアしますか？')) {
                AppState.customCompoundWords.clear();
                saveCustomRulesToStorage();
                renderCustomRulesUI();
                showToast('複合語をすべてクリアしました');
                markDataDirty();
            }
        });
    }

    // ③ 表記ゆれ追加
    const inputSynFrom = document.getElementById('inputSynonymFrom');
    const inputSynTo = document.getElementById('inputSynonymTo');
    const btnAddSynonym = document.getElementById('btnAddSynonym');
    const addSynonymAction = () => {
        const from = (inputSynFrom.value || '').trim();
        const to = (inputSynTo.value || '').trim();
        if (!from || !to) {
            alert('「元の語」と「統一後の語」を両方入力してください');
            return;
        }
        AppState.customSynonymRules.set(from, to);
        inputSynFrom.value = '';
        inputSynTo.value = '';
        saveCustomRulesToStorage();
        renderCustomRulesUI();
        showToast(`表記ゆれルール「${from} → ${to}」を追加しました`);
        markDataDirty();
    };
    if (btnAddSynonym) btnAddSynonym.addEventListener('click', addSynonymAction);
    if (inputSynTo) {
        inputSynTo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addSynonymAction();
            }
        });
    }

    // 表記ゆれリスト内の削除ボタン
    const synonymRulesList = document.getElementById('synonymRulesList');
    if (synonymRulesList) {
        synonymRulesList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-synonym"]');
            if (btn) {
                const from = btn.getAttribute('data-from');
                if (from && AppState.customSynonymRules.has(from)) {
                    AppState.customSynonymRules.delete(from);
                    saveCustomRulesToStorage();
                    renderCustomRulesUI();
                    showToast(`表記ゆれルール「${from}」を削除しました`);
                    markDataDirty();
                }
            }
        });
    }

    // 表記ゆれクリア
    const btnClearSynonyms = document.getElementById('btnClearSynonyms');
    if (btnClearSynonyms) {
        btnClearSynonyms.addEventListener('click', () => {
            if (AppState.customSynonymRules.size === 0) return;
            if (confirm('登録した表記ゆれルールをすべてクリアしますか？')) {
                AppState.customSynonymRules.clear();
                saveCustomRulesToStorage();
                renderCustomRulesUI();
                showToast('表記ゆれルールをすべてクリアしました');
                markDataDirty();
            }
        });
    }

    // エクスポートボタン（text-analysis-test 共通フォーマット）
    const btnExportRules = document.getElementById('btnExportRules');
    if (btnExportRules) {
        btnExportRules.addEventListener('click', () => {
            const text = TextPreprocessor.generateRulesText(
                AppState.customCompoundWords,
                AppState.customStopWords,
                AppState.customSynonymRules
            );
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const filename = `factor_analysis_rules_${yyyy}${mm}${dd}.txt`;

            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`設定ファイルを「${filename}」として出力しました`);
        });
    }

    // インポートボタン ＆ ファイル選択
    const btnImportRules = document.getElementById('btnImportRules');
    const rulesFileInput = document.getElementById('rulesFileInput');
    if (btnImportRules && rulesFileInput) {
        btnImportRules.addEventListener('click', () => {
            rulesFileInput.value = '';
            rulesFileInput.click();
        });

        rulesFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target.result;
                openRulesImportModal(text);
            };
            reader.readAsText(file, 'utf-8');
        });
    }

    // インポート確認モーダルボタン
    const rulesImportModal = document.getElementById('rulesImportModal');
    const btnRulesModalClose = document.getElementById('btnRulesModalClose');
    const btnImportReplace = document.getElementById('btnImportReplace');
    const btnImportMerge = document.getElementById('btnImportMerge');

    if (btnRulesModalClose && rulesImportModal) {
        btnRulesModalClose.addEventListener('click', () => {
            rulesImportModal.style.display = 'none';
            pendingImportRules = null;
        });
    }

    if (btnImportReplace && btnImportMerge && rulesImportModal) {
        btnImportReplace.addEventListener('click', () => {
            if (!pendingImportRules) return;
            AppState.customStopWords = new Set(pendingImportRules.stopWords);
            AppState.customCompoundWords = new Set(pendingImportRules.compoundWords);
            AppState.customSynonymRules = new Map(pendingImportRules.synonymRules);
            finalizeRulesImport('上書き');
        });

        btnImportMerge.addEventListener('click', () => {
            if (!pendingImportRules) return;
            pendingImportRules.stopWords.forEach(w => AppState.customStopWords.add(w));
            pendingImportRules.compoundWords.forEach(w => AppState.customCompoundWords.add(w));
            pendingImportRules.synonymRules.forEach((v, k) => AppState.customSynonymRules.set(k, v));
            finalizeRulesImport('追加（マージ）');
        });
    }

    function finalizeRulesImport(modeLabel) {
        saveCustomRulesToStorage();
        renderCustomRulesUI();
        rulesImportModal.style.display = 'none';
        pendingImportRules = null;
        showToast(`辞書設定を${modeLabel}しました`);
        markDataDirty();
    }

    // 全設定クリアボタン
    const btnClearAllRules = document.getElementById('btnClearAllRules');
    if (btnClearAllRules) {
        btnClearAllRules.addEventListener('click', () => {
            const total = AppState.customStopWords.size + AppState.customCompoundWords.size + AppState.customSynonymRules.size;
            if (total === 0) return;
            if (confirm('登録されているすべての除外ワード・複合語・表記ゆれルールをクリアしますか？')) {
                AppState.customStopWords.clear();
                AppState.customCompoundWords.clear();
                AppState.customSynonymRules.clear();
                saveCustomRulesToStorage();
                renderCustomRulesUI();
                showToast('すべての辞書設定をクリアしました');
                markDataDirty();
            }
        });
    }
}

function openRulesImportModal(text) {
    const parsed = TextPreprocessor.parseRulesText(text);
    const total = parsed.stopWords.size + parsed.compoundWords.size + parsed.synonymRules.size;

    if (total === 0) {
        if (parsed.unclassifiedWords && parsed.unclassifiedWords.length > 0) {
            const sample = parsed.unclassifiedWords.slice(0, 5).join('、');
            if (confirm(`ファイル内にセクション見出しが見つかりませんでしたが、${parsed.unclassifiedWords.length} 個の単語が検出されました。\n（例: ${sample}...）\n\nこれらを「除外ワード」として登録しますか？`)) {
                parsed.unclassifiedWords.forEach(w => AppState.customStopWords.add(w));
                saveCustomRulesToStorage();
                renderCustomRulesUI();
                showToast(`除外ワードに ${parsed.unclassifiedWords.length} 件を追加しました`);
                markDataDirty();
            }
            return;
        }
        alert('有効な除外ワード、複合語、表記ゆれルールが見つかりませんでした。\n「見本ファイル」の書き方を参考にしてください。');
        return;
    }

    pendingImportRules = parsed;
    const modal = document.getElementById('rulesImportModal');
    const modalStop = document.getElementById('modalStopwordCount');
    const modalComp = document.getElementById('modalCompoundCount');
    const modalSyn = document.getElementById('modalSynonymCount');

    if (modalStop) modalStop.textContent = parsed.stopWords.size;
    if (modalComp) modalComp.textContent = parsed.compoundWords.size;
    if (modalSyn) modalSyn.textContent = parsed.synonymRules.size;

    if (modal) modal.style.display = 'flex';
}

/**
 * 形態素解析の抽出品詞選択イベントリスナーの登録
 */
function setupPosEventListeners() {
    const posCheckboxes = document.querySelectorAll('.pos-checkbox');
    const btnPosReset = document.getElementById('btnPosReset');
    const btnPosSelectAll = document.getElementById('btnPosSelectAll');

    posCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const posKey = cb.dataset.pos;
            if (!posKey) return;

            // 最低1つ選択のバリデーション
            const checkedCount = Array.from(posCheckboxes).filter(c => c.checked).length;
            if (checkedCount === 0) {
                alert('形態素解析で抽出する品詞を少なくとも1つ選択してください。');
                cb.checked = true;
                return;
            }

            AppState.selectedPos[posKey] = cb.checked;
            TextPreprocessor.setPosFilter(AppState.selectedPos);

            const parentChip = cb.closest('.pos-chip');
            if (parentChip) {
                if (cb.checked) {
                    parentChip.classList.add('is-checked');
                } else {
                    parentChip.classList.remove('is-checked');
                }
            }

            // 分析結果表示中なら再分析案内バナーを表示
            markDataDirty();
        });
    });

    if (btnPosReset) {
        btnPosReset.addEventListener('click', () => {
            AppState.selectedPos = { noun: true, verb: true, adj: true, adv: false, intj: false };
            TextPreprocessor.setPosFilter(AppState.selectedPos);
            updatePosUI();
            markDataDirty();
        });
    }

    if (btnPosSelectAll) {
        btnPosSelectAll.addEventListener('click', () => {
            AppState.selectedPos = { noun: true, verb: true, adj: true, adv: true, intj: true };
            TextPreprocessor.setPosFilter(AppState.selectedPos);
            updatePosUI();
            markDataDirty();
        });
    }
}

/**
 * 品詞選択UIのチェック状態とスタイルを AppState.selectedPos に同期
 */
function updatePosUI() {
    const posCheckboxes = document.querySelectorAll('.pos-checkbox');
    posCheckboxes.forEach(cb => {
        const posKey = cb.dataset.pos;
        if (posKey && AppState.selectedPos[posKey] !== undefined) {
            cb.checked = AppState.selectedPos[posKey];
            const parentChip = cb.closest('.pos-chip');
            if (parentChip) {
                if (cb.checked) {
                    parentChip.classList.add('is-checked');
                } else {
                    parentChip.classList.remove('is-checked');
                }
            }
        }
    });
}

/**
 * 選択されている品詞の名称リストを取得
 * @returns {string[]}
 */
function getSelectedPosNames() {
    const names = [];
    if (AppState.selectedPos.noun) names.push('名詞');
    if (AppState.selectedPos.verb) names.push('動詞');
    if (AppState.selectedPos.adj) names.push('形容詞');
    if (AppState.selectedPos.adv) names.push('副詞');
    if (AppState.selectedPos.intj) names.push('感動詞');
    return names;
}

/**
 * トピックカード内のキーワードタグHTMLを生成
 * @param {Array<{word: string, weight: number}>} keywords 
 * @param {number} limit 
 * @returns {string}
 */
function renderKwTagsHtml(keywords, limit = 6) {
    if (!keywords) return '';
    return keywords.slice(0, limit).map(kw => `
        <span class="card-kw-tag" title="「${escapeHtml(kw.word)}」を除外ワードに追加して再分析">
            <span>${escapeHtml(kw.word)}</span>
            <button type="button" class="card-kw-exclude-btn" data-word="${escapeHtml(kw.word)}" title="「${escapeHtml(kw.word)}」を除外">✕</button>
        </span>
    `).join('');
}

/**
 * キーワード除外ボタンのクリックイベントをバインド
 * @param {HTMLElement} parentEl 
 */
function attachKwExcludeHandlers(parentEl) {
    if (!parentEl) return;
    const btns = parentEl.querySelectorAll('.card-kw-exclude-btn, .btn-kw-table-exclude');
    btns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const word = btn.getAttribute('data-word');
            if (!word) return;

            if (confirm(`単語「${word}」を除外ワード（ストップワード）に追加して再分析しますか？`)) {
                AppState.customStopWords.add(word);
                saveCustomRulesToStorage();
                renderCustomRulesUI();
                showToast(`「${word}」を除外ワードに追加して再計算中...`);
                closeThemeKeywordsModal();
                await runFullPipeline();
                showToast(`「${word}」を除外して再分析が完了しました`);
            }
        });
    });
}

/**
 * トピックIDに応じたテーマカラーを取得
 * @param {number} themeId 
 * @returns {string} カラーコード (HEX)
 */
function getThemeColor(themeId) {
    if (typeof ChartRenderer !== 'undefined' && ChartRenderer.COLORS && ChartRenderer.COLORS.length > 0) {
        return ChartRenderer.COLORS[themeId % ChartRenderer.COLORS.length];
    }
    return '#2563EB';
}
window.getThemeColor = getThemeColor;

/**
 * トピック関連キーワード詳細モーダルを開く
 * @param {number} themeId 
 */
function openThemeKeywordsModal(themeId) {
    if (!AppState.analysisResult || !AppState.analysisResult.themes) return;
    const theme = AppState.analysisResult.themes.find(t => t.id === themeId);
    if (!theme) return;

    const modal = document.getElementById('themeKeywordsModal');
    if (!modal) return;

    const color = getThemeColor(theme.id);
    const badge = document.getElementById('kwModalTopicBadge');
    if (badge) {
        badge.textContent = `トピック ${theme.id + 1}`;
        badge.style.background = color;
    }

    const titleEl = document.getElementById('kwModalTitle');
    if (titleEl) {
        titleEl.textContent = `${theme.label} 関連キーワード詳細`;
    }

    const countEl = document.getElementById('kwModalWordCount');
    if (countEl) countEl.textContent = theme.keywords.length;

    const filterInput = document.getElementById('kwModalFilterInput');
    if (filterInput) filterInput.value = '';

    // モーダルを先に表示してDOMの寸法を確定させる
    modal.style.display = 'flex';

    // 左カラム: 上位横棒グラフの描画（表示確定後にレンダリング＆リサイズ）
    setTimeout(() => {
        ChartRenderer.renderKeywordModalChart('kwModalBarChart', theme.keywords, color, 20);
    }, 50);

    // 右カラム: テーブル描画
    renderKwModalTable(theme.keywords, '');

    // 検索入力時のインクリメンタルフィルタ
    if (filterInput) {
        filterInput.oninput = (e) => {
            renderKwModalTable(theme.keywords, e.target.value.trim());
        };
    }

    // CSVエクスポートボタン
    const exportBtn = document.getElementById('btnExportKwCsv');
    if (exportBtn) {
        exportBtn.onclick = () => {
            exportThemeKeywordsCsv(theme);
        };
    }
}
window.openThemeKeywordsModal = openThemeKeywordsModal;

/**
 * キーワード詳細モーダルのテーブル行を描画
 * @param {Array<{word: string, weight: number, docCount?: number}>} keywords 
 * @param {string} filterQuery 
 */
function renderKwModalTable(keywords, filterQuery = '') {
    const tbody = document.getElementById('kwModalTableBody');
    if (!tbody || !keywords) return;

    let filtered = keywords;
    if (filterQuery) {
        const q = filterQuery.toLowerCase();
        filtered = keywords.filter(k => k.word.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94A3B8; padding: 24px;">一致する単語がありません</td></tr>`;
        return;
    }

    const maxWeight = keywords[0]?.weight || 1;

    tbody.innerHTML = filtered.map((k, idx) => {
        const rank = idx + 1;
        const rankClass = rank === 1 ? 'kw-rank-1' : (rank === 2 ? 'kw-rank-2' : (rank === 3 ? 'kw-rank-3' : ''));
        const percent = Math.min(100, Math.max(4, Math.round((k.weight / maxWeight) * 100)));
        const docCountText = (k.docCount !== undefined && k.docCount > 0) ? `${k.docCount}件` : '-';

        return `
            <tr>
                <td style="text-align: center;">
                    <span class="kw-rank-badge ${rankClass}">${rank}</span>
                </td>
                <td style="font-weight: 600;">
                    ${escapeHtml(k.word)}
                </td>
                <td>
                    <div class="kw-score-bar-wrap" title="関連度: ${k.weight.toFixed(4)}">
                        <div class="kw-score-bar-bg">
                            <div class="kw-score-bar-fill" style="width: ${percent}%;"></div>
                        </div>
                        <span class="kw-score-val">${k.weight.toFixed(3)}</span>
                    </div>
                </td>
                <td style="text-align: right; color: #64748B;">
                    ${docCountText}
                </td>
                <td style="text-align: center;">
                    <button type="button" class="btn-kw-table-exclude" data-word="${escapeHtml(k.word)}" title="「${escapeHtml(k.word)}」を除外ワードに追加して再分析">
                        🚫 除外
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    attachKwExcludeHandlers(tbody);
}

/**
 * 関連キーワード詳細モーダルを閉じる
 */
function closeThemeKeywordsModal() {
    const modal = document.getElementById('themeKeywordsModal');
    if (modal) modal.style.display = 'none';
}
window.closeThemeKeywordsModal = closeThemeKeywordsModal;

/**
 * トピックの関連キーワード一覧をCSVダウンロード
 * @param {object} theme 
 */
function exportThemeKeywordsCsv(theme) {
    if (!theme || !theme.keywords) return;
    const rows = [
        ['順位', '単語', '関連度スコア', '出現回答件数']
    ];
    theme.keywords.forEach((k, idx) => {
        rows.push([
            idx + 1,
            k.word,
            k.weight.toFixed(6),
            k.docCount || 0
        ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `トピック${theme.id + 1}_関連単語一覧.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------
// 除外された無効・定型回答の確認モーダル＆エクスポート機能
// ----------------------------------------------------

let currentExcludedFilter = 'all';

/**
 * 除外された無効・定型回答一覧モーダルを開く
 * @param {string} [initialFilter='all']
 */
function openExcludedResponsesModal(initialFilter = 'all') {
    const modal = document.getElementById('excludedResponsesModal');
    if (!modal) return;

    currentExcludedFilter = initialFilter;
    renderExcludedModal();
    modal.style.display = 'flex';
}
window.openExcludedResponsesModal = openExcludedResponsesModal;

/**
 * 除外回答一覧モーダルを閉じる
 */
function closeExcludedResponsesModal() {
    const modal = document.getElementById('excludedResponsesModal');
    if (modal) modal.style.display = 'none';
}
window.closeExcludedResponsesModal = closeExcludedResponsesModal;

/**
 * 除外回答モーダルの内容を描画
 */
function renderExcludedModal() {
    const excluded = AppState.excludedResponses || [];
    const countBadge = document.getElementById('excludedModalCountBadge');
    if (countBadge) countBadge.textContent = `全 ${excluded.length} 件`;

    // 理由ごとの集計
    const counts = {
        all: excluded.length
    };
    excluded.forEach(item => {
        const key = item.label || 'その他';
        counts[key] = (counts[key] || 0) + 1;
    });

    // フィルタータブの生成
    const tabsContainer = document.getElementById('excludedFilterTabs');
    if (tabsContainer) {
        tabsContainer.innerHTML = '';
        
        const reasons = ['all', ...Object.keys(counts).filter(k => k !== 'all')];
        reasons.forEach(r => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `btn btn-xs ${currentExcludedFilter === r ? 'btn-primary' : 'btn-outline'}`;
            btn.style.fontSize = '11px';
            btn.style.padding = '3px 9px';
            const label = r === 'all' ? 'すべて' : r;
            const count = counts[r] || 0;
            btn.textContent = `${label} (${count})`;
            btn.onclick = () => {
                currentExcludedFilter = r;
                renderExcludedModal();
            };
            tabsContainer.appendChild(btn);
        });
    }

    // テーブルヘッダー（属性列の有無対応）
    const thead = document.getElementById('excludedThead');
    const hasAttr = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
    if (thead) {
        let theadHtml = '<tr>';
        theadHtml += '<th style="padding: 10px 8px; width: 45px; text-align: center;">#</th>';
        theadHtml += '<th style="padding: 10px 8px; width: 60px;">ID</th>';
        if (hasAttr) {
            theadHtml += `<th style="padding: 10px 8px; width: 110px;">${escapeHtml(AppState.attributeColumn)}</th>`;
        }
        theadHtml += '<th style="padding: 10px 8px;">自由記述テキスト</th>';
        theadHtml += '<th style="padding: 10px 8px; width: 105px; text-align: center;">除外区分</th>';
        theadHtml += '<th style="padding: 10px 8px; width: 220px;">除外理由・詳細</th>';
        theadHtml += '<th style="padding: 10px 8px; width: 85px; text-align: center;">元データ</th>';
        theadHtml += '</tr>';
        thead.innerHTML = theadHtml;
    }

    // テーブルボディのフィルタリングと描画
    const tbody = document.getElementById('excludedResponsesTbody');
    if (!tbody) return;

    const filtered = (currentExcludedFilter === 'all')
        ? excluded
        : excluded.filter(item => item.label === currentExcludedFilter);

    if (filtered.length === 0) {
        const colSpan = hasAttr ? 7 : 6;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: #94A3B8; padding: 30px;">除外された回答はありません</td></tr>`;
        return;
    }

    let tbodyHtml = '';
    filtered.forEach(item => {
        let badgeClass = 'badge-status-junk';
        if (item.status === 'empty' || item.label === '空欄') {
            badgeClass = 'badge-status-empty';
        } else if (item.label === '有効語なし') {
            badgeClass = 'badge-status-noword';
        }

        const rawAttr = (hasAttr && item.row) ? item.row[AppState.attributeColumn] : '';
        const attrVal = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '') ? String(rawAttr).trim() : '（未設定）';
        const attrCellHtml = hasAttr ? `<td style="padding: 10px 8px; color: #475569;"><span class="badge-attr">${escapeHtml(attrVal)}</span></td>` : '';

        const displayText = item.text
            ? escapeHtml(item.text)
            : '<span style="color: #94A3B8; font-style: italic;">（未入力・空欄）</span>';

        tbodyHtml += `
            <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 10px 8px; text-align: center; color: #64748B; font-weight: 600;">${item.rowIndex}</td>
                <td style="padding: 10px 8px; color: #475569;">${escapeHtml(String(item.id))}</td>
                ${attrCellHtml}
                <td style="padding: 10px 8px; color: #1E293B; white-space: pre-wrap; word-break: break-word; line-height: 1.5;">${displayText}</td>
                <td style="padding: 10px 8px; text-align: center;">
                    <span class="badge-status ${badgeClass}">${escapeHtml(item.label)}</span>
                </td>
                <td style="padding: 10px 8px; font-size: 11.5px; color: #64748B; line-height: 1.4;">${escapeHtml(item.detail)}</td>
                <td style="padding: 10px 8px; text-align: center;">
                    <button type="button" class="btn btn-xs btn-outline" onclick="jumpToPreviewRow(${item.rawIndex})" title="プレビュー画面でこの行を確認・編集する">
                        ✏️ 編集
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tbodyHtml;
}

/**
 * プレビュー画面の指定行へスクロールしてハイライト
 * @param {number} rawIdx
 */
function jumpToPreviewRow(rawIdx) {
    closeExcludedResponsesModal();

    const previewSection = document.getElementById('previewSection');
    if (!previewSection) return;
    previewSection.style.display = 'block';

    // プレビューの全行モードに切り替え
    AppState.previewMode = 'all';
    AppState.previewFilterWarning = false;
    const btnPreviewLimit = document.getElementById('btnPreviewLimit');
    const btnPreviewAll = document.getElementById('btnPreviewAll');
    const btnFilterWarnings = document.getElementById('btnFilterWarnings');
    if (btnPreviewLimit) btnPreviewLimit.classList.remove('active');
    if (btnPreviewAll) btnPreviewAll.classList.add('active');
    if (btnFilterWarnings) btnFilterWarnings.classList.remove('active');

    // 該当行が含まれるページを計算
    const page = Math.floor(rawIdx / AppState.previewPageSize) + 1;
    AppState.previewPage = page;

    renderDataPreview();

    // プレビューセクションへスクロール
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setTimeout(() => {
        const rowEl = document.getElementById(`previewRow_${rawIdx}`);
        if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            rowEl.classList.remove('row-highlight-target');
            // リフロー強制
            void rowEl.offsetWidth;
            rowEl.classList.add('row-highlight-target');

            const textCell = rowEl.querySelector('.col-target-cell');
            if (textCell) {
                textCell.focus();
            }
        }
    }, 300);
}
window.jumpToPreviewRow = jumpToPreviewRow;

/**
 * 除外された回答一覧のCSVダウンロード
 */
function exportExcludedResponsesCsv() {
    const excluded = AppState.excludedResponses || [];
    if (excluded.length === 0) {
        alert('除外された回答データがありません');
        return;
    }

    const hasAttr = !!(AppState.attributeColumn && AppState.headers.includes(AppState.attributeColumn));
    const headerRow = ['行番号', 'ID'];
    if (hasAttr) {
        headerRow.push(AppState.attributeColumn);
    }
    headerRow.push('自由記述回答', '除外区分', '除外理由・詳細');

    const escapeCsv = (val) => {
        const str = (val === null || val === undefined) ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
    };

    const csvRows = [
        headerRow.map(escapeCsv).join(',')
    ];

    excluded.forEach(item => {
        const rowCols = [
            item.rowIndex,
            item.id
        ];
        if (hasAttr) {
            const rawAttr = item.row ? item.row[AppState.attributeColumn] : '';
            rowCols.push(rawAttr !== undefined && rawAttr !== null ? String(rawAttr) : '');
        }
        rowCols.push(item.text, item.label, item.detail);
        csvRows.push(rowCols.map(escapeCsv).join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    link.download = `除外回答一覧_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
window.exportExcludedResponsesCsv = exportExcludedResponsesCsv;



