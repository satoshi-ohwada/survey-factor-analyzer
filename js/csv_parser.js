/**
 * CSVパーサーモジュール
 * PapaParseを利用してCSV/TSVをパースし、自由記述列・属性列を自動推測する
 */
const CsvParser = {
    /**
     * CSVテキストまたはFileをパースする
     * @param {File|string} input 
     * @returns {Promise<{headers: string[], rows: object[], rawRows: any[][]}>}
     */
    async parse(input) {
        return new Promise((resolve, reject) => {
            const config = {
                header: true,
                skipEmptyLines: 'greedy',
                dynamicTyping: false,
                complete: (results) => {
                    if (results.errors && results.errors.length > 0) {
                        console.warn('CSV Parse Warnings:', results.errors);
                    }
                    const headers = results.meta.fields || [];
                    const rows = results.data.filter(r => Object.values(r).some(v => v !== null && String(v).trim() !== ''));
                    resolve({
                        headers,
                        rows,
                        raw: results
                    });
                },
                error: (err) => {
                    reject(err);
                }
            };

            if (typeof input === 'string') {
                Papa.parse(input, config);
            } else if (input instanceof File) {
                // 文字コード自動判定（Shift_JISかUTF-8か）
                const reader = new FileReader();
                reader.onload = (e) => {
                    const text = e.target.result;
                    // 文字化けチェック（UTF-8として読んだときに置換文字が含まれるかなど）
                    Papa.parse(text, config);
                };
                // まずはUTF-8で試みる
                reader.readAsText(input, 'UTF-8');
            } else {
                reject(new Error('不正な入力です'));
            }
        });
    },

    /**
     * 自由記述列（テキストが最も長くバリエーションが豊富な列）を推測する
     * @param {string[]} headers 
     * @param {object[]} rows 
     * @returns {string|null} 推奨される列名
     */
    guessTextColumn(headers, rows) {
        if (!headers || headers.length === 0 || rows.length === 0) return null;

        let bestCol = null;
        let maxAvgLen = -1;

        headers.forEach(h => {
            const lowerH = h.toLowerCase();
            // 列名に「意見」「記述」「要望」「感想」「コメント」「comment」「text」が含まれていれば優先
            const nameBonus = (/意見|自由|記述|要望|感想|コメント|理由|詳細|comment|text|voice|feedback|note/i.test(lowerH)) ? 50 : 0;

            let totalLen = 0;
            let count = 0;
            rows.forEach(r => {
                const val = r[h];
                if (val !== undefined && val !== null) {
                    const str = String(val).trim();
                    totalLen += str.length;
                    count++;
                }
            });

            const avgLen = count > 0 ? (totalLen / count) + nameBonus : 0;
            if (avgLen > maxAvgLen) {
                maxAvgLen = avgLen;
                bestCol = h;
            }
        });

        return bestCol || headers[headers.length - 1];
    },

    /**
     * 属性列（年代、性別、満足度など、ユニーク値が2〜15個程度の列）の候補を探す
     * @param {string[]} headers 
     * @param {object[]} rows 
     * @param {string} textCol 
     * @returns {string[]} 属性列の候補
     */
    guessAttributeColumns(headers, rows, textCol) {
        if (!headers || rows.length === 0) return [];

        return headers.filter(h => {
            if (h === textCol) return false;
            if (/^id$|^no$|^番号$/i.test(h.trim())) return false;

            const values = new Set();
            rows.forEach(r => {
                const val = r[h];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    values.add(String(val).trim());
                }
            });

            // ユニーク値が2個以上、かつ全体の30%以下または最大15個以内
            return values.size >= 2 && values.size <= Math.min(15, Math.ceil(rows.length * 0.5));
        });
    }
};
