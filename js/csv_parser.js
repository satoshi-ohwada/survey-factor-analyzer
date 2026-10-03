/**
 * CSV / テキストパーサーモジュール
 * CSV, TSVだけでなく、1行1回答のプレーンテキスト(.txt)にも柔軟に対応
 * UTF-8 (BOM付き含む) と Shift_JIS を自動判別してデコード
 */
const CsvParser = {
    /**
     * Fileまたは文字列をパースする
     * @param {File|string} input 
     * @returns {Promise<{headers: string[], rows: object[], fileName?: string}>}
     */
    async parse(input) {
        if (typeof input === 'string') {
            return this.parseTextContent(input, 'input.txt');
        }

        if (input instanceof File) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const buffer = e.target.result;
                    let text = '';
                    try {
                        // まずは厳密なUTF-8としてデコード
                        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                        text = utf8Decoder.decode(buffer);
                    } catch (err) {
                        // UTF-8で不正なバイト列の場合はShift_JISにフォールバック
                        console.log('UTF-8 decoding failed, falling back to Shift_JIS');
                        const sjisDecoder = new TextDecoder('shift-jis');
                        text = sjisDecoder.decode(buffer);
                    }

                    // 先頭のBOM (\uFEFF) を確実に除去
                    text = text.replace(/^\uFEFF/, '');

                    try {
                        const result = this.parseTextContent(text, input.name);
                        resolve(result);
                    } catch (pErr) {
                        reject(pErr);
                    }
                };
                reader.onerror = (err) => reject(err);
                reader.readAsArrayBuffer(input);
            });
        }

        throw new Error('サポートされていない入力形式です');
    },

    /**
     * テキスト内容を判定してパース
     * @param {string} text 
     * @param {string} fileName 
     * @returns {{headers: string[], rows: object[]}}
     */
    parseTextContent(text, fileName = '') {
        const cleanText = text.replace(/^\uFEFF/, '').trim();
        const lowerName = fileName.toLowerCase();
        const isTxtFile = lowerName.endsWith('.txt');

        // 改行で行分割してサンプリング
        const rawLines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (rawLines.length === 0) {
            throw new Error('ファイル内に有効なテキストが見つかりませんでした');
        }

        // CSV/TSV判定: 複数行をチェックしてカンマまたはタブが規則的に含まれているか
        const sampleLines = rawLines.slice(0, Math.min(20, rawLines.length));
        const commaCounts = sampleLines.map(l => (l.match(/,/g) || []).length);
        const tabCounts = sampleLines.map(l => (l.match(/\t/g) || []).length);

        const hasConsistentCommas = commaCounts.length > 1 && commaCounts[0] >= 1 && commaCounts.every(c => c === commaCounts[0]);
        const hasConsistentTabs = tabCounts.length > 1 && tabCounts[0] >= 1 && tabCounts.every(c => c === tabCounts[0]);

        // .txt でカンマ/タブが一定でなければ「1行1回答のプレーンテキスト」として処理
        if (isTxtFile && !hasConsistentCommas && !hasConsistentTabs) {
            return this.parsePlainText(rawLines);
        }

        // CSV/TSVの場合、PapaParseで解析
        const parsed = Papa.parse(cleanText, {
            header: true,
            skipEmptyLines: 'greedy',
            dynamicTyping: false
        });

        // もしPapaParseで列が1列しかなく、かつヘッダー名が長すぎる場合はテキストファイルとみなす
        const fields = (parsed.meta.fields || []).map(f => f.replace(/^\uFEFF/, '').trim());
        if (fields.length === 1 && fields[0].length > 25) {
            return this.parsePlainText(rawLines);
        }

        if (fields.length > 0 && parsed.data.length > 0) {
            // フィールド名のBOMを除去してキーを正規化
            const sanitizedRows = parsed.data.map(row => {
                const newRow = {};
                fields.forEach(f => {
                    newRow[f] = row[f] || row['\uFEFF' + f] || '';
                });
                return newRow;
            }).filter(r => Object.values(r).some(v => v !== null && String(v).trim() !== ''));

            return {
                headers: fields,
                rows: sanitizedRows
            };
        }

        // フォールバック: プレーンテキストとして処理
        return this.parsePlainText(rawLines);
    },

    /**
     * 1行1回答のテキスト（watcher.txtのようなファイル）をパースする
     * @param {string[]} lines 
     * @returns {{headers: string[], rows: object[]}}
     */
    parsePlainText(lines) {
        if (lines.length === 0) {
            return { headers: ['自由記述テキスト'], rows: [] };
        }

        const firstLine = lines[0].trim();
        let headerName = '自由記述テキスト';
        let startIndex = 0;

        // 1行目が短いキーワード（見出し/ラベル）っぽい場合、それをヘッダー名にする
        // 例: 「理由」「ご意見」「回答」「アンケート」「自由記述」「text」など
        const isHeaderLike = firstLine.length <= 15 && !/[。、！？]$/.test(firstLine);
        if (isHeaderLike) {
            headerName = firstLine;
            startIndex = 1;
        }

        const rows = [];
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length > 0) {
                const rowObj = { ID: i + (startIndex === 1 ? 0 : 1) };
                rowObj[headerName] = line;
                rows.push(rowObj);
            }
        }

        return {
            headers: ['ID', headerName],
            rows: rows
        };
    },

    /**
     * 自由記述列（テキストが最も長くバリエーションが豊富な列）を推測する
     * @param {string[]} headers 
     * @param {object[]} rows 
     * @returns {string|null}
     */
    guessTextColumn(headers, rows) {
        if (!headers || headers.length === 0 || rows.length === 0) return null;

        let bestCol = null;
        let maxAvgLen = -1;

        headers.forEach(h => {
            if (/^id$|^no$|^番号$/i.test(h.trim())) return;

            const lowerH = h.toLowerCase();
            const nameBonus = (/意見|自由|記述|要望|感想|コメント|理由|詳細|comment|text|voice|feedback|note/i.test(lowerH)) ? 60 : 0;

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
     * @returns {string[]}
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

            return values.size >= 2 && values.size <= Math.min(15, Math.ceil(rows.length * 0.5));
        });
    }
};
