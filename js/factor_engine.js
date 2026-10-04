/**
 * 潜在因子・テーマ分析エンジン
 * NMF (Non-negative Matrix Factorization) による潜在トピック・因子の抽出と
 * PCAによる2次元ポジショニング座標の計算を行う
 */
const FactorEngine = {
    /**
     * 推奨されるテーマ数を推定する
     * @param {number} docCount 有効回答数
     * @param {number} vocabCount 語彙数
     * @returns {number}
     */
    estimateOptimalK(docCount, vocabCount) {
        if (docCount < 10) return 2;
        if (docCount < 30) return 3;
        if (docCount < 100) return 3;
        if (docCount < 300) return 4;
        return 5;
    },

    /**
     * NMF (非負値行列因子分解) を実行
     * 行列 V (N x M) を W (N x K) と H (K x M) に分解する
     * @param {number[][]} V 入力TF-IDF行列 (N x M)
     * @param {number} K 因子数
     * @param {number} maxIter 最大反復回数 (デフォルト100)
     * @returns {{ W: number[][], H: number[][] }}
     */
    runNMF(V, K, maxIter = 100) {
        const N = V.length;
        if (N === 0) return { W: [], H: [] };
        const M = V[0].length;
        if (M === 0) return { W: [], H: [] };

        const eps = 1e-9;

        // 行列 W, H の初期化 (正の微小乱数)
        // 再現性のため擬似乱数シードを使用
        let seed = 42;
        const pseudoRandom = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        const W = [];
        for (let i = 0; i < N; i++) {
            const row = [];
            for (let k = 0; k < K; k++) {
                row.push(pseudoRandom() * 0.5 + 0.1);
            }
            W.push(row);
        }

        const H = [];
        for (let k = 0; k < K; k++) {
            const row = [];
            for (let j = 0; j < M; j++) {
                row.push(pseudoRandom() * 0.5 + 0.1);
            }
            H.push(row);
        }

        // Lee & Seung 乗法更新
        for (let iter = 0; iter < maxIter; iter++) {
            // --- H の更新: H = H .* (W^T * V) ./ (W^T * W * H + eps) ---
            // 1. W^T * V (K x M)
            const WtV = [];
            for (let k = 0; k < K; k++) {
                const row = new Array(M).fill(0);
                for (let i = 0; i < N; i++) {
                    const w_ik = W[i][k];
                    const v_row = V[i];
                    for (let j = 0; j < M; j++) {
                        row[j] += w_ik * v_row[j];
                    }
                }
                WtV.push(row);
            }

            // 2. W^T * W (K x K)
            const WtW = [];
            for (let k1 = 0; k1 < K; k1++) {
                const row = new Array(K).fill(0);
                for (let k2 = 0; k2 < K; k2++) {
                    let sum = 0;
                    for (let i = 0; i < N; i++) {
                        sum += W[i][k1] * W[i][k2];
                    }
                    row[k2] = sum;
                }
                WtW.push(row);
            }

            // 3. WtW * H (K x M)
            for (let k = 0; k < K; k++) {
                for (let j = 0; j < M; j++) {
                    let denom = 0;
                    for (let l = 0; l < K; l++) {
                        denom += WtW[k][l] * H[l][j];
                    }
                    H[k][j] *= (WtV[k][j] / (denom + eps));
                }
            }

            // --- W の更新: W = W .* (V * H^T) ./ (W * H * H^T + eps) ---
            // 1. V * H^T (N x K)
            const VHt = [];
            for (let i = 0; i < N; i++) {
                const row = new Array(K).fill(0);
                const v_row = V[i];
                for (let k = 0; k < K; k++) {
                    let sum = 0;
                    const h_row = H[k];
                    for (let j = 0; j < M; j++) {
                        sum += v_row[j] * h_row[j];
                    }
                    row[k] = sum;
                }
                VHt.push(row);
            }

            // 2. H * H^T (K x K)
            const HHt = [];
            for (let k1 = 0; k1 < K; k1++) {
                const row = new Array(K).fill(0);
                for (let k2 = 0; k2 < K; k2++) {
                    let sum = 0;
                    for (let j = 0; j < M; j++) {
                        sum += H[k1][j] * H[k2][j];
                    }
                    row[k2] = sum;
                }
                HHt.push(row);
            }

            // 3. W * HHt (N x K)
            for (let i = 0; i < N; i++) {
                for (let k = 0; k < K; k++) {
                    let denom = 0;
                    for (let l = 0; l < K; l++) {
                        denom += W[i][l] * HHt[l][k];
                    }
                    W[i][k] *= (VHt[i][k] / (denom + eps));
                }
            }
        }

        // 各テーマ H[k] のL1正規化と W のスケール調整
        for (let k = 0; k < K; k++) {
            let hSum = 0;
            for (let j = 0; j < M; j++) {
                hSum += H[k][j];
            }
            if (hSum > 0) {
                for (let j = 0; j < M; j++) {
                    H[k][j] /= hSum;
                }
                for (let i = 0; i < N; i++) {
                    W[i][k] *= hSum;
                }
            }
        }

        return { W, H };
    },

    /**
     * 潜在因子・テーマ分析の全体処理を実行
     * @param {Array<{id: any, text: string, row: object}>} responses 
     * @param {string[]} vocabulary 語彙リスト
     * @param {number[][]} V TF-IDF行列
     * @param {number} K テーマ数
     * @returns {object} 分析結果オブジェクト
     */
    analyze(responses, vocabulary, V, K) {
        const N = responses.length;
        const M = vocabulary.length;

        if (N === 0 || M === 0) {
            return {
                themes: [],
                responsesWithTheme: [],
                positioning2D: []
            };
        }

        // 1. NMFの実行
        const { W, H } = this.runNMF(V, K, 80);

        // 2. 各テーマの重要単語（上位7単語）を抽出
        const themes = [];
        for (let k = 0; k < K; k++) {
            const wordWeights = vocabulary.map((word, idx) => ({
                word,
                weight: H[k][idx]
            }));

            // 重み降順ソート
            wordWeights.sort((a, b) => b.weight - a.weight);

            const topWords = wordWeights.slice(0, 7);
            const titleKeywords = topWords.slice(0, 3).map(w => w.word);

            themes.push({
                id: k,
                label: `【${titleKeywords.join('・')}】`,
                keywords: topWords,
                count: 0,
                share: 0,
                representativeResponses: []
            });
        }

        // 3. 各回答の主テーマ判定とスコア付与
        const responsesWithTheme = [];
        const themeScores = new Array(K).fill(0);

        for (let i = 0; i < N; i++) {
            const rowW = W[i];
            let maxK = 0;
            let maxScore = -1;
            let sumScore = 0;

            for (let k = 0; k < K; k++) {
                const score = rowW[k];
                sumScore += score;
                if (score > maxScore) {
                    maxScore = score;
                    maxK = k;
                }
            }

            // 特徴語が抽出できなかった回答 (sumScore <= 1e-9) の場合
            const hasMatchedWords = sumScore > 1e-9;
            let assignedThemeId = maxK;
            let confidence = 0;

            if (hasMatchedWords) {
                confidence = maxScore / sumScore;
            } else {
                // 特徴語を含まない文は、特定因子に偏らせずインデックスを分散
                assignedThemeId = i % K;
                confidence = 0;
            }

            // 各テーマへの適合率 (0%〜100%)
            const probabilities = rowW.map(s => hasMatchedWords ? (s / sumScore) : (1 / K));

            themes[assignedThemeId].count++;
            themeScores[assignedThemeId] += maxScore;

            responsesWithTheme.push({
                index: i,
                id: responses[i].id,
                text: responses[i].text,
                row: responses[i].row,
                primaryThemeId: assignedThemeId,
                confidence: confidence,
                themeProbabilities: probabilities,
                hasMatchedWords
            });
        }

        // 4. 各テーマの全体シェア（％）の計算（最大剰余法により合計が厳密に100%になるよう調整）
        if (N > 0) {
            const rawShares = themes.map(t => (t.count / N) * 100);
            const floorShares = rawShares.map(s => Math.floor(s));
            let remainder = 100 - floorShares.reduce((a, b) => a + b, 0);

            // 小数点以下の端数が大きい順にソートして余りを配分
            const remaindersWithIdx = rawShares.map((s, idx) => ({
                idx,
                rem: s - floorShares[idx]
            })).sort((a, b) => b.rem - a.rem);

            for (let i = 0; i < remainder && i < remaindersWithIdx.length; i++) {
                floorShares[remaindersWithIdx[i].idx]++;
            }

            themes.forEach((t, i) => {
                t.share = floorShares[i];
            });
        }

        // 5. 各テーマの代表回答をピックアップ
        // 8文字以上の回答を優先し、短文中心のデータでも欠落しないようフォールバック
        themes.forEach(t => {
            const pool = responsesWithTheme
                .filter(r => r.primaryThemeId === t.id && r.hasMatchedWords);

            // まず8文字以上の候補を優先
            let candidates = pool
                .filter(r => r.text.length >= 8)
                .sort((a, b) => b.confidence - a.confidence);

            // 8文字以上の候補が3件未満の場合、文字数制限なしの候補で補完
            if (candidates.length < 3) {
                const candidateIds = new Set(candidates.map(c => c.id));
                const fallbackCandidates = pool
                    .filter(r => !candidateIds.has(r.id))
                    .sort((a, b) => b.confidence - a.confidence);
                candidates = candidates.concat(fallbackCandidates);
            }

            // 万一 pool 全体が空の場合は、全体から適合度が最大のものをフォールバック採用
            if (candidates.length === 0) {
                candidates = responsesWithTheme
                    .filter(r => r.primaryThemeId === t.id)
                    .sort((a, b) => b.confidence - a.confidence);
            }

            // 上位3件を代表回答とする
            t.representativeResponses = candidates.slice(0, 3).map(c => ({
                id: c.id,
                text: c.text,
                confidence: Math.round(c.confidence * 100)
            }));
        });

        // 6. 意見ポジショニングマップ用の2次元座標（PCA 2D投影）
        const positioning2D = this.compute2DProjection(W, responsesWithTheme, themes);

        return {
            themes,
            responsesWithTheme,
            positioning2D,
            W,
            H,
            vocabulary
        };
    },

    /**
     * W行列 (N x K) をPCAで2次元に射影して散布図座標を計算する
     * @param {number[][]} W 
     * @param {any[]} responsesWithTheme 
     * @param {any[]} themes 
     * @returns {Array<{x: number, y: number, text: string, themeId: number, themeLabel: string}>}
     */
    compute2DProjection(W, responsesWithTheme, themes) {
        const N = W.length;
        if (N === 0) return [];
        const K = W[0].length;

        // Kが2以下の場合はそのまま、または簡易射影
        if (K === 1) {
            return responsesWithTheme.map((r, i) => ({
                x: W[i][0],
                y: (Math.random() - 0.5) * 0.1,
                text: r.text,
                id: r.id,
                themeId: r.primaryThemeId,
                themeLabel: themes[r.primaryThemeId]?.label || ''
            }));
        }

        // 1. 各列の中心化 (平均を0にする)
        const means = new Array(K).fill(0);
        for (let i = 0; i < N; i++) {
            for (let k = 0; k < K; k++) {
                means[k] += W[i][k];
            }
        }
        for (let k = 0; k < K; k++) {
            means[k] /= N;
        }

        const centered = [];
        for (let i = 0; i < N; i++) {
            const row = [];
            for (let k = 0; k < K; k++) {
                row.push(W[i][k] - means[k]);
            }
            centered.push(row);
        }

        // 2. 共分散行列 C = (X^T * X) / N (K x K)
        const C = [];
        for (let k1 = 0; k1 < K; k1++) {
            const row = new Array(K).fill(0);
            for (let k2 = 0; k2 < K; k2++) {
                let sum = 0;
                for (let i = 0; i < N; i++) {
                    sum += centered[i][k1] * centered[i][k2];
                }
                row[k2] = sum / N;
            }
            C.push(row);
        }

        // 3. べき乗法 (Power Iteration) により上位2つの固有ベクトルを算出
        const powerIteration = (covMatrix, numComponents = 2) => {
            const vectors = [];
            const cov = covMatrix.map(row => [...row]);

            for (let c = 0; c < numComponents; c++) {
                let v = new Array(K).fill(0).map(() => Math.random() - 0.5);
                // 正規化
                let norm = Math.sqrt(v.reduce((s, val) => s + val * val, 0)) || 1;
                v = v.map(val => val / norm);

                for (let iter = 0; iter < 40; iter++) {
                    const nextV = new Array(K).fill(0);
                    for (let r = 0; r < K; r++) {
                        for (let col = 0; col < K; col++) {
                            nextV[r] += cov[r][col] * v[col];
                        }
                    }
                    norm = Math.sqrt(nextV.reduce((s, val) => s + val * val, 0)) || 1;
                    v = nextV.map(val => val / norm);
                }

                vectors.push(v);

                // デフレーション (次の主成分計算のため寄与を引く)
                // eigenvalue = v^T * cov * v
                let eigenvalue = 0;
                for (let r = 0; r < K; r++) {
                    let tmp = 0;
                    for (let col = 0; col < K; col++) {
                        tmp += cov[r][col] * v[col];
                    }
                    eigenvalue += v[r] * tmp;
                }

                for (let r = 0; r < K; r++) {
                    for (let col = 0; col < K; col++) {
                        cov[r][col] -= eigenvalue * v[r] * v[col];
                    }
                }
            }
            return vectors;
        };

        const [pc1, pc2] = powerIteration(C, 2);

        // 4. 各回答を中心化データから2次元 (x, y) に投影
        return responsesWithTheme.map((r, i) => {
            const cRow = centered[i];
            let x = 0;
            let y = 0;
            for (let k = 0; k < K; k++) {
                x += cRow[k] * pc1[k];
                y += cRow[k] * (pc2 ? pc2[k] : 0);
            }
            return {
                x: Math.round(x * 1000) / 1000,
                y: Math.round(y * 1000) / 1000,
                text: r.text,
                id: r.id,
                themeId: r.primaryThemeId,
                themeLabel: themes[r.primaryThemeId]?.label || ''
            };
        });
    }
};
