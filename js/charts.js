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

            // テーマごとにトレースを色分け
            traces = themes.map((theme, tIdx) => {
                const matchingResponses = [];
                for (let i = 0; i < responsesWithTheme.length; i++) {
                    const r = responsesWithTheme[i];
                    if (r.primaryThemeId === theme.id) {
                        const scoreX = W[i] ? W[i][xFactorIdx] : 0;
                        const scoreY = W[i] ? W[i][yFactorIdx] : 0;
                        matchingResponses.push({
                            x: scoreX,
                            y: scoreY,
                            text: r.text,
                            id: r.id,
                            themeLabel: theme.label
                        });
                    }
                }

                return {
                    x: matchingResponses.map(p => p.x),
                    y: matchingResponses.map(p => p.y),
                    text: matchingResponses.map(p => {
                        const short = p.text.length > 35 ? p.text.substring(0, 35) + '…' : p.text;
                        return `<b>${p.themeLabel}</b><br>${short}`;
                    }),
                    customdata: matchingResponses,
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

        const layout = {
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
            margin: { l: 55, r: 20, t: 15, b: 50 },
            height: 340,
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
            margin: { l: 80, r: 20, t: 10, b: 30 },
            height: 180,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: {
                showgrid: true,
                gridcolor: '#F1F5F9',
                zeroline: false,
                title: '因子負荷量（関連度）'
            },
            yaxis: {
                autorange: true
            },
            font: { size: 12 }
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

        const sortedAttrs = Array.from(attrValues);

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
    }
};
