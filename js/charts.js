/**
 * チャート描画モジュール
 * Plotly.jsを利用して直感的で美しい図（ドーナツ、ポジショニングマップ、横棒グラフ、クロス集計）を描画する
 */
const ChartRenderer = {
    // 洗練されたカラーパレット
    COLORS: [
        '#3B82F6', // 青
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
                text: '<b>意見テーマの全体構成比</b>',
                font: { size: 16, color: '#1E293B' }
            },
            showlegend: false,
            margin: { l: 40, r: 40, t: 50, b: 40 },
            height: 340,
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
     * 意見ポジショニングマップ（2次元散布図）（図2）を描画
     * @param {string} containerId 
     * @param {any[]} positioning2D 
     * @param {any[]} themes 
     * @param {(response: any) => void} onPointClick 
     */
    renderPositioningMap(containerId, positioning2D, themes, onPointClick) {
        // テーマごとにトレースを分ける
        const traces = themes.map((theme, idx) => {
            const points = positioning2D.filter(p => p.themeId === theme.id);
            const color = this.COLORS[idx % this.COLORS.length];

            return {
                x: points.map(p => p.x),
                y: points.map(p => p.y),
                text: points.map(p => {
                    const shortText = p.text.length > 40 ? p.text.substring(0, 40) + '...' : p.text;
                    return `<b>${theme.label}</b><br>${shortText}`;
                }),
                customdata: points,
                mode: 'markers',
                type: 'scatter',
                name: theme.label,
                marker: {
                    size: 9,
                    color: color,
                    opacity: 0.85,
                    line: { color: '#ffffff', width: 1 }
                },
                hoverinfo: 'text'
            };
        });

        const layout = {
            title: {
                text: '<b>意見のポジショニングマップ（意味の近さ）</b>',
                font: { size: 16, color: '#1E293B' }
            },
            xaxis: {
                title: '主成分 1 (第1の潜在軸)',
                showgrid: true,
                zeroline: true,
                zerolinecolor: '#E2E8F0',
                gridcolor: '#F1F5F9'
            },
            yaxis: {
                title: '主成分 2 (第2の潜在軸)',
                showgrid: true,
                zeroline: true,
                zerolinecolor: '#E2E8F0',
                gridcolor: '#F1F5F9'
            },
            margin: { l: 50, r: 20, t: 50, b: 50 },
            height: 340,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: '#FAFAFC',
            legend: {
                orientation: 'h',
                y: -0.22,
                x: 0.5,
                xanchor: 'center'
            },
            hoverlabel: {
                bgcolor: '#1E293B',
                font: { color: '#ffffff', size: 13 },
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
    },

    /**
     * テーマ別・重要単語横棒グラフ（図3）を描画
     * @param {string} containerId 
     * @param {Array<{word: string, weight: number}>} keywords 
     * @param {string} color 
     */
    renderKeywordBarChart(containerId, keywords, color = '#3B82F6') {
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
                title: 'キーワード重要度'
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
     * 属性別クロス集計チャート（図4）を描画
     * @param {string} containerId 
     * @param {any[]} responsesWithTheme 
     * @param {any[]} themes 
     * @param {string} attributeCol 
     */
    renderCrossTabChart(containerId, responsesWithTheme, themes, attributeCol) {
        if (!attributeCol) return;

        // 1. 属性値ごとのテーマ集計
        const attrValues = new Set();
        const counts = {}; // { attrVal: { themeId: count } }

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

        // 2. 100%積み上げの比率計算
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
                text: `<b>属性別テーマ傾向（${attributeCol} ごとの内訳）</b>`,
                font: { size: 16, color: '#1E293B' }
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
