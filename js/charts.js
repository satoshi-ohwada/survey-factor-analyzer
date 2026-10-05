/**
 * チャート描画モジュール
 * Plotly.js および 動的SVGレンダラーを利用して
 * 因子構成比、因子パス図、因子空間マップ（因子得点・負荷量）、横棒グラフ、クロス集計を描画する
 */
const ChartRenderer = {
    // 洗練されたカラーパレット
    COLORS: [
        '#2563EB', // 青
        '#10B981', // エメラルドグリーン
        '#F59E0B', // アンバー
        '#EF4444', // 赤
        '#8B5CF6', // 紫
        '#EC4899', // ピンク
        '#14B8A6', // ティール
        '#6366F1'  // インディゴ
    ],

    /**
     * テーマ構成比ドーナツチャート（図1）を描画
     * @param {string} containerId 
     * @param {any[]} themes 
     * @param {(themeId: number) => void} onSliceClick 
     */
    renderDonutChart(containerId, themes, onSliceClick) {
        const labels = themes.map(t => t.label);
        const values = themes.map(t => t.count);
        const colors = themes.map((_, i) => this.COLORS[i % this.COLORS.length]);

        const data = [{
            type: 'pie',
            labels: labels,
            values: values,
            hole: 0.55,
            textinfo: 'label+percent',
            textposition: 'outside',
            hoverinfo: 'label+value+percent',
            marker: {
                colors: colors,
                line: { color: '#ffffff', width: 2 }
            },
            insidetextorientation: 'radial'
        }];

        const layout = {
            title: {
                text: '<b>【図1】潜在因子の全体構成比（シェア）</b>',
                font: { size: 15, color: '#1E293B' }
            },
            showlegend: false,
            margin: { l: 40, r: 40, t: 50, b: 40 },
            height: 350,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: 'sans-serif' }
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        Plotly.newPlot(containerId, data, layout, config).then(() => {
            const el = document.getElementById(containerId);
            if (el && onSliceClick) {
                el.removeAllListeners && el.removeAllListeners('plotly_click');
                el.on('plotly_click', (d) => {
                    if (d && d.points && d.points[0]) {
                        const pointIndex = d.points[0].pointNumber;
                        onSliceClick(pointIndex);
                    }
                });
            }
        });
    },

    /**
     * 【図2】因子分析パス図（Factor Path Diagram）をSVGで描画
     * 潜在因子（楕円）から観測単語（四角）への因子負荷量パス（矢印・係数）を表現する
     * @param {string} containerId 
     * @param {any[]} themes 
     * @param {(themeId: number) => void} onFactorClick 
     */
    renderPathDiagram(containerId, themes, onFactorClick) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const K = themes.length;
        // 高さの動的計算（因子数に応じて調整）
        const height = Math.max(380, K * 75 + 40);
        const width = 520;

        // SVG要素の作成
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', height);
        svg.style.display = 'block';

        // 矢印マーカー定義
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B" />
            </marker>
        `;
        svg.appendChild(defs);

        // タイトル
        const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleText.setAttribute('x', '15');
        titleText.setAttribute('y', '22');
        titleText.setAttribute('font-size', '13');
        titleText.setAttribute('font-weight', '700');
        titleText.setAttribute('fill', '#1E293B');
        titleText.textContent = '【図2】因子パス図（潜在因子 → 観測単語）';
        svg.appendChild(titleText);

        // 各因子の描画（左列：潜在因子、右列：観測単語）
        const factorX = 90;
        const wordX = 430;
        const factorYStep = (height - 60) / K;

        // すべての単語ノードを重複なく配置するための追跡
        let globalWordIndex = 0;
        const totalTopWords = themes.reduce((s, t) => s + Math.min(3, t.keywords.length), 0);
        const wordYStep = (height - 60) / Math.max(1, totalTopWords);

        themes.forEach((theme, idx) => {
            const color = this.COLORS[idx % this.COLORS.length];
            const fy = 50 + idx * factorYStep + factorYStep / 2;

            // 1. 潜在因子ノード（楕円）
            const factorG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            factorG.style.cursor = 'pointer';
            factorG.onclick = () => onFactorClick && onFactorClick(theme.id);

            const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            ellipse.setAttribute('cx', factorX);
            ellipse.setAttribute('cy', fy);
            ellipse.setAttribute('rx', '75');
            ellipse.setAttribute('ry', '28');
            ellipse.setAttribute('fill', '#FFFFFF');
            ellipse.setAttribute('stroke', color);
            ellipse.setAttribute('stroke-width', '2.5');
            factorG.appendChild(ellipse);

            // 因子ラベル（2行）
            const fLabel1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            fLabel1.setAttribute('x', factorX);
            fLabel1.setAttribute('y', fy - 5);
            fLabel1.setAttribute('text-anchor', 'middle');
            fLabel1.setAttribute('font-size', '11');
            fLabel1.setAttribute('font-weight', '700');
            fLabel1.setAttribute('fill', color);
            fLabel1.textContent = `因子${idx + 1} (${theme.share}%)`;
            factorG.appendChild(fLabel1);

            const fLabel2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            fLabel2.setAttribute('x', factorX);
            fLabel2.setAttribute('y', fy + 12);
            fLabel2.setAttribute('text-anchor', 'middle');
            fLabel2.setAttribute('font-size', '10');
            fLabel2.setAttribute('fill', '#1E293B');
            const cleanTitle = theme.label.replace(/^【|】$/g, '');
            fLabel2.textContent = cleanTitle.length > 10 ? cleanTitle.substring(0, 9) + '…' : cleanTitle;
            factorG.appendChild(fLabel2);

            svg.appendChild(factorG);

            // 2. 上位単語（上位3語）へのパスと単語ノード（四角）
            const topWords = theme.keywords.slice(0, 3);
            const maxWeight = topWords[0]?.weight || 1;

            topWords.forEach((kw) => {
                const wy = 45 + globalWordIndex * wordYStep + wordYStep / 2;
                globalWordIndex++;

                // 正規化負荷量 (0.4 ~ 0.95 程度で見やすくスケーリング)
                const relWeight = Math.round((kw.weight / maxWeight) * 100) / 100;
                const pathWidth = Math.max(1.2, Math.min(3.5, relWeight * 3.5));

                // 因子ノード右端 (factorX + 75, fy) から 単語ノード左端 (wordX - 45, wy) へのベジェ曲線
                const startX = factorX + 75;
                const startY = fy;
                const endX = wordX - 45;
                const endY = wy;

                const cpX1 = startX + 70;
                const cpY1 = startY;
                const cpX2 = endX - 70;
                const cpY2 = endY;

                // 矢印パス
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${startX} ${startY} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${endX} ${endY}`);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', pathWidth);
                path.setAttribute('stroke-opacity', '0.75');
                path.setAttribute('marker-end', 'url(#arrow)');
                svg.appendChild(path);

                // 負荷量数値ラベル（曲線の中央付近）
                const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 10;
                const midY = (startY + endY) / 2 - 4;

                const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                textBg.setAttribute('x', midX - 12);
                textBg.setAttribute('y', midY - 9);
                textBg.setAttribute('width', '24');
                textBg.setAttribute('height', '13');
                textBg.setAttribute('rx', '3');
                textBg.setAttribute('fill', '#FFFFFF');
                textBg.setAttribute('fill-opacity', '0.9');
                svg.appendChild(textBg);

                const weightText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                weightText.setAttribute('x', midX);
                weightText.setAttribute('y', midY + 1);
                weightText.setAttribute('text-anchor', 'middle');
                weightText.setAttribute('font-size', '9');
                weightText.setAttribute('font-weight', '600');
                weightText.setAttribute('fill', '#475569');
                weightText.textContent = relWeight.toFixed(2);
                svg.appendChild(weightText);

                // 単語ノード（長方形）
                const wordG = document.createElementNS('http://www.w3.org/2000/svg', 'g');

                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', wordX - 42);
                rect.setAttribute('y', wy - 14);
                rect.setAttribute('width', '84');
                rect.setAttribute('height', '28');
                rect.setAttribute('rx', '4');
                rect.setAttribute('fill', '#F8FAFC');
                rect.setAttribute('stroke', '#94A3B8');
                rect.setAttribute('stroke-width', '1.2');
                wordG.appendChild(rect);

                const wordText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                wordText.setAttribute('x', wordX);
                wordText.setAttribute('y', wy + 4);
                wordText.setAttribute('text-anchor', 'middle');
                wordText.setAttribute('font-size', '11');
                wordText.setAttribute('font-weight', '600');
                wordText.setAttribute('fill', '#1E293B');
                const cleanWord = kw.word.length > 7 ? kw.word.substring(0, 6) + '…' : kw.word;
                wordText.textContent = cleanWord;
                wordG.appendChild(wordText);

                svg.appendChild(wordG);
            });
        });

        container.appendChild(svg);
    },

    /**
     * 【図3】因子空間ポジショニングマップを描画
     * PCAではなく、純粋な因子分析の因子軸（因子得点 または 因子負荷量）で描画する
     * @param {string} containerId 
     * @param {object} options 
     */
    renderFactorSpaceMap(containerId, options) {
        const {
            mode = 'responses', // 'responses' (因子得点) または 'words' (因子負荷量)
            xFactorIdx = 0,
            yFactorIdx = 1,
            themes = [],
            responsesWithTheme = [],
            W = [],
            H = [],
            vocabulary = [],
            attributeCol = '',
            filterAttrVal = '',
            onPointClick
        } = options;

        const xTheme = themes[xFactorIdx] || { label: `因子${xFactorIdx + 1}` };
        const yTheme = themes[yFactorIdx] || { label: `因子${yFactorIdx + 1}` };

        let traces = [];
        let xTitle = '';
        let yTitle = '';

        if (mode === 'responses') {
            // --- ① 回答者の因子得点マップ ---
            xTitle = `横軸: 因子${xFactorIdx + 1}【${xTheme.label.replace(/^【|】$/g, '')}】得点`;
            yTitle = `縦軸: 因子${yFactorIdx + 1}【${yTheme.label.replace(/^【|】$/g, '')}】得点`;

            const isFiltered = !!(attributeCol && filterAttrVal);

            // 全回答の基本情報を収集
            const allResponsePoints = [];
            for (let i = 0; i < responsesWithTheme.length; i++) {
                const r = responsesWithTheme[i];
                const scoreX = W[i] ? W[i][xFactorIdx] : 0;
                const scoreY = W[i] ? W[i][yFactorIdx] : 0;
                const rawAttr = (r.row && attributeCol) ? r.row[attributeCol] : null;
                const attrVal = (rawAttr !== undefined && rawAttr !== null && String(rawAttr).trim() !== '')
                    ? String(rawAttr).trim()
                    : '（未設定）';

                allResponsePoints.push({
                    x: scoreX,
                    y: scoreY,
                    text: r.text,
                    id: r.id,
                    themeId: r.primaryThemeId,
                    themeLabel: themes[r.primaryThemeId] ? themes[r.primaryThemeId].label : '',
                    attrVal: attrVal,
                    row: r.row
                });
            }

            if (isFiltered) {
                // 属性絞り込み時: 背景に全回答のゴーストプロットを敷き、該当属性のみ因子色でハイライト
                const ghostTrace = {
                    x: allResponsePoints.map(p => p.x),
                    y: allResponsePoints.map(p => p.y),
                    mode: 'markers',
                    type: 'scatter',
                    name: '全体（比較用）',
                    marker: {
                        size: 5.5,
                        color: '#CBD5E1',
                        opacity: 0.4
                    },
                    hoverinfo: 'none',
                    showlegend: true
                };
                traces.push(ghostTrace);

                // 該当属性の回答をテーマごとにプロット
                themes.forEach((theme, tIdx) => {
                    const matched = allResponsePoints.filter(p => p.themeId === theme.id && p.attrVal === filterAttrVal);
                    if (matched.length > 0) {
                        traces.push({
                            x: matched.map(p => p.x),
                            y: matched.map(p => p.y),
                            text: matched.map(p => {
                                const short = p.text.length > 35 ? p.text.substring(0, 35) + '…' : p.text;
                                return `<b>${p.themeLabel}</b> [${p.attrVal}]<br>${short}`;
                            }),
                            customdata: matched,
                            mode: 'markers',
                            type: 'scatter',
                            name: `因子${tIdx + 1}: ${theme.label.replace(/^【|】$/g, '')} (${matched.length}件)`,
                            marker: {
                                size: 9.5,
                                color: this.COLORS[tIdx % this.COLORS.length],
                                opacity: 0.95,
                                line: { color: '#ffffff', width: 1.5 }
                            },
                            hoverinfo: 'text'
                        });
                    }
                });
            } else {
                // 通常時: テーマごとに全回答を色分け
                traces = themes.map((theme, tIdx) => {
                    const matched = allResponsePoints.filter(p => p.themeId === theme.id);
                    return {
                        x: matched.map(p => p.x),
                        y: matched.map(p => p.y),
                        text: matched.map(p => {
                            const short = p.text.length > 35 ? p.text.substring(0, 35) + '…' : p.text;
                            const attrBadge = p.attrVal && p.attrVal !== '（未設定）' ? ` [${p.attrVal}]` : '';
                            return `<b>${p.themeLabel}</b>${attrBadge}<br>${short}`;
                        }),
                        customdata: matched,
                        mode: 'markers',
                        type: 'scatter',
                        name: `因子${tIdx + 1}: ${theme.label.replace(/^【|】$/g, '')}`,
                        marker: {
                            size: 9,
                            color: this.COLORS[tIdx % this.COLORS.length],
                            opacity: 0.8,
                            line: { color: '#ffffff', width: 1 }
                        },
                        hoverinfo: 'text'
                    };
                });
            }

        } else {
            // --- ② 語の因子負荷量マップ ---
            xTitle = `横軸: 因子${xFactorIdx + 1}【${xTheme.label.replace(/^【|】$/g, '')}】負荷量`;
            yTitle = `縦軸: 因子${yFactorIdx + 1}【${yTheme.label.replace(/^【|】$/g, '')}】負荷量`;

            // 各単語の負荷量座標 (H[xFactorIdx][j], H[yFactorIdx][j])
            const wordPoints = vocabulary.map((word, j) => {
                const loadX = H[xFactorIdx] ? H[xFactorIdx][j] : 0;
                const loadY = H[yFactorIdx] ? H[yFactorIdx][j] : 0;
                // どちらの因子に強く負荷しているかで色付け
                const primaryFactor = loadX >= loadY ? xFactorIdx : yFactorIdx;
                return {
                    word,
                    x: loadX,
                    y: loadY,
                    primaryFactor
                };
            });

            // 負荷量が特に高い重要単語（上位25語）をラベル表示
            const sortedByMagnitude = [...wordPoints].sort((a, b) => (b.x * b.x + b.y * b.y) - (a.x * a.x + a.y * a.y));
            const topWordsSet = new Set(sortedByMagnitude.slice(0, 20).map(w => w.word));

            traces = [{
                x: wordPoints.map(p => p.x),
                y: wordPoints.map(p => p.y),
                text: wordPoints.map(p => topWordsSet.has(p.word) ? p.word : ''),
                textposition: 'top right',
                textfont: { size: 11, color: '#1E293B' },
                customdata: wordPoints,
                mode: 'markers+text',
                type: 'scatter',
                name: '単語',
                marker: {
                    size: wordPoints.map(p => topWordsSet.has(p.word) ? 10 : 6),
                    color: wordPoints.map(p => this.COLORS[p.primaryFactor % this.COLORS.length]),
                    opacity: 0.85,
                    line: { color: '#ffffff', width: 1 }
                },
                hovertemplate: '<b>%{customdata.word}</b><br>' +
                               `${xTheme.label.replace(/^【|】$/g, '')}負荷量: %{x:.3f}<br>` +
                               `${yTheme.label.replace(/^【|】$/g, '')}負荷量: %{y:.3f}<extra></extra>`
            }];
        }

        const modeLabel = mode === 'responses' ? '回答者得点' : '語の負荷量';
        const layout = {
            title: {
                text: `<b>【図3】因子空間ポジショニングマップ（${modeLabel}）</b> <span style="font-size:11px; font-weight:normal; color:#64748B;">[横: 因子${xFactorIdx + 1} × 縦: 因子${yFactorIdx + 1}]</span>`,
                font: { size: 12.5, color: '#1E293B' },
                x: 0.02,
                xanchor: 'left',
                y: 0.98
            },
            showlegend: mode === 'responses',
            xaxis: {
                title: { text: xTitle, font: { size: 11, color: '#475569' } },
                showgrid: true,
                zeroline: true,
                zerolinecolor: '#CBD5E1',
                gridcolor: '#F1F5F9'
            },
            yaxis: {
                title: { text: yTitle, font: { size: 11, color: '#475569' } },
                showgrid: true,
                zeroline: true,
                zerolinecolor: '#CBD5E1',
                gridcolor: '#F1F5F9'
            },
            margin: { l: 55, r: 20, t: 40, b: 50 },
            height: 350,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: '#FAFAFC',
            legend: {
                orientation: 'h',
                y: -0.22,
                x: 0.5,
                xanchor: 'center',
                font: { size: 10 }
            },
            hoverlabel: {
                bgcolor: '#1E293B',
                font: { color: '#ffffff', size: 12 },
                align: 'left'
            }
        };

        const config = {
            responsive: true,
            displaylogo: false,
            toImageButtonOptions: {
                format: 'png',
                filename: `【図3】因子空間ポジショニングマップ（因子${xFactorIdx + 1}×因子${yFactorIdx + 1}_${modeLabel}）`,
                height: 550,
                width: 750,
                scale: 2
            },
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot(containerId, traces, layout, config).then(() => {
            const el = document.getElementById(containerId);
            if (el && onPointClick && mode === 'responses') {
                el.removeAllListeners && el.removeAllListeners('plotly_click');
                el.on('plotly_click', (d) => {
                    if (d && d.points && d.points[0]) {
                        const custom = d.points[0].customdata;
                        if (custom) onPointClick(custom);
                    }
                });
            }
        });
    },

    /**
     * テーマ別・重要単語横棒グラフ（各テーマカード内）を描画
     * @param {string} containerId 
     * @param {Array<{word: string, weight: number}>} keywords 
     * @param {string} color 
     */
    renderKeywordBarChart(containerId, keywords, color = '#2563EB') {
        const reversed = [...keywords].slice(0, 6).reverse(); // 上位を上に表示
        const yWords = reversed.map(k => k.word);
        const xWeights = reversed.map(k => k.weight);

        const data = [{
            type: 'bar',
            x: xWeights,
            y: yWords,
            orientation: 'h',
            marker: {
                color: color,
                opacity: 0.85,
                line: { color: '#ffffff', width: 1 }
            },
            hoverinfo: 'x+y'
        }];

        const layout = {
            margin: { l: 65, r: 15, t: 8, b: 24 },
            height: 145,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: {
                showgrid: true,
                gridcolor: '#F1F5F9',
                zeroline: false,
                title: { text: '負荷量', font: { size: 9.5, color: '#64748B' } },
                tickfont: { size: 9 }
            },
            yaxis: {
                autorange: true,
                tickfont: { size: 10.5 }
            },
            font: { size: 10.5, family: 'sans-serif' }
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        Plotly.newPlot(containerId, data, layout, config);
    },

    /**
     * 属性別クロス集計チャートを描画
     * @param {string} containerId 
     * @param {any[]} responsesWithTheme 
     * @param {any[]} themes 
     * @param {string} attributeCol 
     */
    renderCrossTabChart(containerId, responsesWithTheme, themes, attributeCol) {
        if (!attributeCol) return;

        const attrValues = new Set();
        const counts = {};

        responsesWithTheme.forEach(r => {
            const rawVal = r.row[attributeCol];
            const attrVal = (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') 
                ? String(rawVal).trim() 
                : '（未設定）';

            attrValues.add(attrVal);
            if (!counts[attrVal]) counts[attrVal] = {};
            counts[attrVal][r.primaryThemeId] = (counts[attrVal][r.primaryThemeId] || 0) + 1;
        });

        // 属性の自然順序ソート（年代・数値・評価尺度・未設定対応）
        const ORDER_MAP = {
            '大変不満': 1, '不満': 2, 'やや不満': 3, 'どちらともいえない': 4, '普通': 4, 'やや満足': 5, '満足': 6, '大変満足': 7,
            '非常に不満': 1, '非常に満足': 7, '悪い': 1, 'やや悪い': 2, '良い': 4, '大変良い': 5,
            '低': 1, '中': 2, '高': 3
        };

        const sortedAttrs = Array.from(attrValues).sort((a, b) => {
            if (a === '（未設定）') return 1;
            if (b === '（未設定）') return -1;
            if (ORDER_MAP[a] && ORDER_MAP[b]) return ORDER_MAP[a] - ORDER_MAP[b];
            // 年代や数値を含む場合は数値の昇順で比較（例: '20代' vs '30代'）
            const numA = (a.match(/\d+/) || [])[0];
            const numB = (b.match(/\d+/) || [])[0];
            if (numA !== undefined && numB !== undefined && numA !== numB) {
                return parseInt(numA, 10) - parseInt(numB, 10);
            }
            return a.localeCompare(b, 'ja');
        });

        const traces = themes.map((theme, tIdx) => {
            const percentages = sortedAttrs.map(attr => {
                const totalInAttr = Object.values(counts[attr] || {}).reduce((s, v) => s + v, 0);
                const count = counts[attr]?.[theme.id] || 0;
                return totalInAttr > 0 ? Math.round((count / totalInAttr) * 100) : 0;
            });

            return {
                x: percentages,
                y: sortedAttrs,
                name: theme.label,
                type: 'bar',
                orientation: 'h',
                marker: {
                    color: this.COLORS[tIdx % this.COLORS.length],
                    opacity: 0.9
                },
                hoverinfo: 'name+x+y'
            };
        });

        const layout = {
            barmode: 'stack',
            title: {
                text: `<b>【図4】属性別因子傾向（${attributeCol} ごとの因子内訳）</b>`,
                font: { size: 15, color: '#1E293B' }
            },
            xaxis: {
                title: '割合 (%)',
                range: [0, 100],
                ticksuffix: '%'
            },
            yaxis: {
                autorange: 'reversed'
            },
            margin: { l: 90, r: 30, t: 50, b: 50 },
            height: Math.max(260, sortedAttrs.length * 45 + 100),
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: '#FAFAFC',
            legend: {
                orientation: 'h',
                y: -0.25,
                x: 0.5,
                xanchor: 'center'
            }
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        Plotly.newPlot(containerId, traces, layout, config);
    },

    /**
     * 属性別因子空間マップ（スモールマルチプルズ / Small Multiples）を描画
     * 各属性の小散布図を並べ、背景に全体のゴーストプロットを敷いて偏りを可視化
     * @param {string} containerId 
     * @param {object} options 
     */
    renderAttributeSmallMultiples(containerId, options) {
        const {
            xFactorIdx = 0,
            yFactorIdx = 1,
            themes = [],
            responsesWithTheme = [],
            W = [],
            attributeCol = '',
            onPointClick
        } = options;

        const container = document.getElementById(containerId);
        if (!container || !attributeCol || responsesWithTheme.length === 0) return;

        container.innerHTML = '';

        const safeHtml = (str) => {
            if (typeof escapeHtml === 'function') return escapeHtml(str);
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const xTheme = themes[xFactorIdx] || { label: `因子${xFactorIdx + 1}` };
        const yTheme = themes[yFactorIdx] || { label: `因子${yFactorIdx + 1}` };
        const xClean = xTheme.label.replace(/^【|】$/g, '');
        const yClean = yTheme.label.replace(/^【|】$/g, '');

        // 1. 全回答の座標と属性値を抽出
        const allPoints = [];
        const attrGroups = {};

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < responsesWithTheme.length; i++) {
            const r = responsesWithTheme[i];
            const scoreX = W[i] ? W[i][xFactorIdx] : 0;
            const scoreY = W[i] ? W[i][yFactorIdx] : 0;

            if (scoreX < minX) minX = scoreX;
            if (scoreX > maxX) maxX = scoreX;
            if (scoreY < minY) minY = scoreY;
            if (scoreY > maxY) maxY = scoreY;

            const rawVal = r.row ? r.row[attributeCol] : '';
            const attrVal = (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '')
                ? String(rawVal).trim()
                : '（未設定）';

            const pointObj = {
                x: scoreX,
                y: scoreY,
                id: r.id,
                text: r.text,
                row: r.row,
                primaryThemeId: r.primaryThemeId,
                themeLabel: themes[r.primaryThemeId] ? themes[r.primaryThemeId].label : '',
                confidence: r.confidence,
                attrVal: attrVal
            };

            allPoints.push(pointObj);

            if (!attrGroups[attrVal]) {
                attrGroups[attrVal] = [];
            }
            attrGroups[attrVal].push(pointObj);
        }

        // 座標軸の範囲を全小プロットで完全に共通化（適度な余白を追加）
        const padX = (maxX - minX) * 0.08 || 0.1;
        const padY = (maxY - minY) * 0.08 || 0.1;
        const rangeX = [Math.max(0, minX - padX), maxX + padX];
        const rangeY = [Math.max(0, minY - padY), maxY + padY];

        // 2. 属性値の自然順序ソート
        const ORDER_MAP = {
            '大変不満': 1, '不満': 2, 'やや不満': 3, 'どちらともいえない': 4, '普通': 4, 'やや満足': 5, '満足': 6, '大変満足': 7,
            '非常に不満': 1, '非常に満足': 7, '悪い': 1, 'やや悪い': 2, '良い': 4, '大変良い': 5,
            '低': 1, '中': 2, '高': 3
        };

        const sortedAttrs = Object.keys(attrGroups).sort((a, b) => {
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

        // 3. 全体情報ヘッダー＆スモールマルチプルズのグリッドDOM作成
        const wrapper = document.createElement('div');
        wrapper.className = 'attr-multiples-container';

        const headerEl = document.createElement('div');
        headerEl.className = 'attr-multiples-top-header';
        headerEl.innerHTML = `
            <div class="attr-multiples-title">
                <b>【図5】属性別因子空間マップ比較（${safeHtml(attributeCol)} ごとの意見ポジショニング分布）</b>
            </div>
            <div class="attr-multiples-legend">
                <span class="legend-ghost-item"><span class="legend-dot-ghost"></span> 全体の分布（背景影）</span>
                <span class="legend-highlight-item"><span class="legend-dot-color"></span> 各属性の回答（因子色）</span>
                <span class="legend-axis-info">横軸: 因子${xFactorIdx + 1}【${safeHtml(xClean)}】 │ 縦軸: 因子${yFactorIdx + 1}【${safeHtml(yClean)}】</span>
            </div>
        `;
        wrapper.appendChild(headerEl);

        const gridEl = document.createElement('div');
        gridEl.className = 'attr-multiples-grid';
        wrapper.appendChild(gridEl);
        container.appendChild(wrapper);

        // 4. 各属性のミニ散布図を描画
        sortedAttrs.forEach((attrName, idx) => {
            const points = attrGroups[attrName];
            const count = points.length;

            // この属性で最も多い因子を計算
            const themeCounts = {};
            points.forEach(p => {
                themeCounts[p.primaryThemeId] = (themeCounts[p.primaryThemeId] || 0) + 1;
            });
            let maxThemeId = -1;
            let maxCount = -1;
            Object.keys(themeCounts).forEach(tid => {
                if (themeCounts[tid] > maxCount) {
                    maxCount = themeCounts[tid];
                    maxThemeId = parseInt(tid, 10);
                }
            });
            const topTheme = themes[maxThemeId];
            const topThemePct = count > 0 ? Math.round((maxCount / count) * 100) : 0;
            const topColor = topTheme ? this.COLORS[maxThemeId % this.COLORS.length] : '#2563EB';

            // カードDOM
            const cardEl = document.createElement('div');
            cardEl.className = 'attr-multiples-card';
            const plotId = `${containerId}-sub-${idx}`;

            cardEl.innerHTML = `
                <div class="attr-multiples-card-header">
                    <div class="attr-card-title-group">
                        <span class="attr-card-name">${safeHtml(attrName)}</span>
                        <span class="attr-card-count">N=${count}</span>
                    </div>
                    ${topTheme ? `
                        <span class="attr-card-top-factor" style="color: ${topColor}; background: ${topColor}15; border: 1px solid ${topColor}35;">
                            最多: ${safeHtml(topTheme.label.replace(/^【|】$/g, ''))} (${topThemePct}%)
                        </span>
                    ` : ''}
                </div>
                <div id="${plotId}" class="attr-sub-plot"></div>
            `;
            gridEl.appendChild(cardEl);

            // トレース1: 全体ゴーストプロット（薄いグレーの背景影）
            const ghostTrace = {
                x: allPoints.map(p => p.x),
                y: allPoints.map(p => p.y),
                mode: 'markers',
                type: 'scatter',
                name: '全体（比較用）',
                marker: {
                    size: 5,
                    color: '#CBD5E1',
                    opacity: 0.4
                },
                hoverinfo: 'none',
                showlegend: false
            };

            // トレース2: 当該属性の回答プロット（主所属因子の色で強調）
            const attrTrace = {
                x: points.map(p => p.x),
                y: points.map(p => p.y),
                text: points.map(p => {
                    const short = p.text.length > 30 ? p.text.substring(0, 30) + '…' : p.text;
                    return `<b>${p.themeLabel}</b> (${Math.round(p.confidence * 100)}%)<br>${short}`;
                }),
                customdata: points,
                mode: 'markers',
                type: 'scatter',
                name: attrName,
                marker: {
                    size: 8,
                    color: points.map(p => this.COLORS[p.primaryThemeId % this.COLORS.length]),
                    opacity: 0.9,
                    line: { color: '#ffffff', width: 1.2 }
                },
                hoverinfo: 'text',
                showlegend: false
            };

            const layout = {
                margin: { l: 30, r: 12, t: 8, b: 24 },
                height: 185,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: '#FAFAFC',
                xaxis: {
                    range: rangeX,
                    showgrid: true,
                    gridcolor: '#F1F5F9',
                    zeroline: true,
                    zerolinecolor: '#E2E8F0',
                    tickfont: { size: 8, color: '#94A3B8' }
                },
                yaxis: {
                    range: rangeY,
                    showgrid: true,
                    gridcolor: '#F1F5F9',
                    zeroline: true,
                    zerolinecolor: '#E2E8F0',
                    tickfont: { size: 8, color: '#94A3B8' }
                },
                hoverlabel: {
                    bgcolor: '#1E293B',
                    font: { color: '#ffffff', size: 11 },
                    align: 'left'
                }
            };

            const config = {
                responsive: true,
                displayModeBar: false
            };

            Plotly.newPlot(plotId, [ghostTrace, attrTrace], layout, config).then(() => {
                const el = document.getElementById(plotId);
                if (el && onPointClick) {
                    el.removeAllListeners && el.removeAllListeners('plotly_click');
                    el.on('plotly_click', (d) => {
                        if (d && d.points && d.points[0]) {
                            const custom = d.points[0].customdata;
                            if (custom) onPointClick(custom);
                        }
                    });
                }
            });
        });
    }
};
