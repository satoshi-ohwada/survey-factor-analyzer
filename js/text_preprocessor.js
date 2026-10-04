/**
 * テキスト前処理モジュール
 * Kuromoji.jsを利用して形態素解析、不要語除去、複合名詞結合、TF-IDF計算を行う
 */
const TextPreprocessor = {
    tokenizer: null,
    isInitializing: false,

    // デフォルトのアンケート用ストップワード（無意味語・意見定型表現など）
    DEFAULT_STOPWORDS: new Set([
        'こと', 'もの', 'ため', 'よう', 'そう', 'これ', 'それ', 'あれ', 'どれ',
        'ところ', 'とき', '時', '事', '物', '方', '人', '者', '点', '分', '回',
        'さん', '様', '私', '僕', '自分', '貴社', '御社', '貴社', '御社',
        'する', 'ある', 'いる', 'なる', 'れる', 'られる', 'せる', 'させる',
        'ない', 'よい', 'いい', '思う', '感じる', '考える', '言う', 'みる',
        'できる', 'わかる', '持つ', 'いく', 'くる', 'おく', 'しまう',
        '使う', '利用', '希望', '要望', 'お願い', '頂く', 'いただく', 'くださる',
        '非常', '大変', 'かなり', '少し', 'ちょっと', 'もっと', '全体', '一部',
        '質問', '回答', 'アンケート', '意見', '感想', '理由', '今日', '今後', '今回'
    ]),

    // 無意味な回答（行全体がこれに該当する場合はスキップ）
    JUNK_RESPONSES: new Set([
        'なし', '特になし', '特にありません', 'ありません', 'ない', 'とくになし',
        '特にない', '無し', '特に無し', '特になし。', 'なし。', '特にありません。',
        'ありません。', '無', 'ー', '-', '―', 'N/A', 'na', 'none', 'nothing'
    ]),

    /**
     * Kuromoji トークナイザーの初期化
     * @param {string} dicPath 
     * @returns {Promise<any>}
     */
    async init(dicPath = 'lib/kuromoji/dict/') {
        if (this.tokenizer) return this.tokenizer;
        if (this.isInitializing) {
            while (this.isInitializing) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.tokenizer;
        }

        this.isInitializing = true;
        return new Promise((resolve, reject) => {
            if (typeof kuromoji === 'undefined') {
                this.isInitializing = false;
                return reject(new Error('Kuromojiライブラリが読み込まれていません'));
            }

            kuromoji.builder({ dicPath }).build((err, tokenizer) => {
                this.isInitializing = false;
                if (err) {
                    reject(err);
                } else {
                    this.tokenizer = tokenizer;
                    resolve(tokenizer);
                }
            });
        });
    },

    /**
     * テキストの入力品質を判定する（プレビューおよびデータ検証用）
     * @param {string} text 
     * @returns {{ status: 'valid' | 'empty' | 'junk', label: string, isProblem: boolean, detail: string }}
     */
    checkQuality(text) {
        if (text === undefined || text === null) {
            return { status: 'empty', label: '空欄', isProblem: true, detail: '未入力です（分析から除外されます）' };
        }
        const textStr = String(text).trim();
        if (textStr.length === 0) {
            return { status: 'empty', label: '空欄', isProblem: true, detail: '空白のみです（分析から除外されます）' };
        }

        const cleaned = textStr.replace(/[\s\r\n\t。、・]/g, '');
        if (cleaned.length === 0) {
            return { status: 'empty', label: '空白のみ', isProblem: true, detail: 'スペース・改行記号のみです（分析から除外されます）' };
        }

        // 定型スキップ単語に合致する場合
        if (this.JUNK_RESPONSES.has(cleaned)) {
            return { status: 'junk', label: '定型無効', isProblem: true, detail: '「なし」「特になし」等の定型回答です（分析から除外されます）' };
        }

        // 数字のみ（例: 999, 0, 99 などコード番号）
        if (/^[0-9０-９]+$/.test(cleaned)) {
            return { status: 'junk', label: '数値コード', isProblem: true, detail: 'アンケートコード等の数値のみです（分析から除外されます）' };
        }

        // 記号・ハイフンのみ（例: ---, ***, /// など）
        if (/^[^\p{L}\p{N}]+$/u.test(cleaned)) {
            return { status: 'junk', label: '記号のみ', isProblem: true, detail: '記号・ハイフンのみです（分析から除外されます）' };
        }

        // 文字数が極端に短い（1文字のみ）
        if (cleaned.length <= 1) {
            return { status: 'junk', label: '極短文', isProblem: true, detail: '1文字以下のため分析から除外されます' };
        }

        return { status: 'valid', label: '正常', isProblem: false, detail: '有効なテキストです' };
    },

    /**
     * テキストが無意味回答かどうかを判定
     * （「特になし」、空白、アンケート用コード数値「999」や記号のみの行を除外）
     * @param {string} text 
     * @returns {boolean}
     */
    isJunkResponse(text) {
        return this.checkQuality(text).isProblem;
    },

    /**
     * 単一のテキスト文を形態素解析し、単語リスト（名詞・動詞・形容詞）を返す
     * 連続する名詞は自動的に結合して1つの複合名詞にする
     * @param {string} text 
     * @returns {string[]}
     */
    tokenize(text) {
        if (!this.tokenizer || !text) return [];

        const tokens = this.tokenizer.tokenize(text);
        const resultWords = [];
        let compoundNoun = '';

        const flushCompoundNoun = () => {
            if (compoundNoun.length >= 2 && !this.DEFAULT_STOPWORDS.has(compoundNoun)) {
                // 数字のみ、または記号のみの単語は除外
                if (!/^[0-9０-９]+$/.test(compoundNoun) && !/^[^\p{L}\p{N}]+$/u.test(compoundNoun)) {
                    resultWords.push(compoundNoun);
                }
            }
            compoundNoun = '';
        };

        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const pos = t.pos;
            const posDetail = t.pos_detail_1;
            const basicForm = (t.basic_form && t.basic_form !== '*') ? t.basic_form : t.surface_form;

            // 名詞の場合（非自立・代名詞・数・接尾を除く）
            if (pos === '名詞') {
                if (posDetail === '非自立' || posDetail === '代名詞' || posDetail === '数' || posDetail === '接尾') {
                    flushCompoundNoun();
                    continue;
                }
                // 複合名詞として蓄積
                compoundNoun += t.surface_form;
            } else {
                // 名詞以外が来たら複合名詞を確定
                flushCompoundNoun();

                // 動詞または形容詞の場合（自立語のみ）
                if (pos === '動詞' || pos === '形容詞') {
                    if (posDetail === '自立' || posDetail === '*') {
                        if (basicForm.length >= 2 && !this.DEFAULT_STOPWORDS.has(basicForm)) {
                            resultWords.push(basicForm);
                        }
                    }
                }
            }
        }
        flushCompoundNoun();

        return resultWords;
    },

    /**
     * 全回答のテキストを処理し、文書-単語行列およびTF-IDFを計算する
     * @param {Array<{id: any, text: string, row: object}>} validResponses 
     * @param {number} maxVocabSize 最大語彙数（デフォルト60）
     * @returns {{
     *   vocabulary: string[],
     *   matrix: number[][],
     *   wordDocCounts: Record<string, number>,
     *   docWordLists: string[][]
     * }}
     */
    buildTfIdfMatrix(validResponses, maxVocabSize = 60) {
        const N = validResponses.length;
        if (N === 0) {
            return { vocabulary: [], matrix: [], wordDocCounts: {}, docWordLists: [] };
        }

        // 1. 各回答の単語リストを抽出
        const docWordLists = validResponses.map(r => this.tokenize(r.text));

        // 2. 単語の文書頻度 (DF) をカウント
        const docFreq = {};
        docWordLists.forEach(words => {
            const uniqueWords = new Set(words);
            uniqueWords.forEach(w => {
                docFreq[w] = (docFreq[w] || 0) + 1;
            });
        });

        // 3. 語彙の選定（あまりに稀な単語(1回のみ)や、全文書の70%以上に出現する一般的すぎる単語をフィルタ）
        const minDf = N >= 20 ? 2 : 1;
        const maxDf = Math.max(3, Math.floor(N * 0.75));

        const candidateWords = Object.keys(docFreq).filter(w => {
            const df = docFreq[w];
            return df >= minDf && df <= maxDf;
        });

        // TF-IDF スコアの総和で単語をランキングして上位 maxVocabSize を選ぶ
        const wordScores = {};
        candidateWords.forEach(w => {
            const idf = Math.log(N / (docFreq[w] + 1)) + 1;
            let tfSum = 0;
            docWordLists.forEach(words => {
                const count = words.filter(word => word === w).length;
                if (count > 0) {
                    tfSum += (1 + Math.log(count));
                }
            });
            wordScores[w] = tfSum * idf;
        });

        const sortedVocab = candidateWords
            .sort((a, b) => (wordScores[b] || 0) - (wordScores[a] || 0))
            .slice(0, maxVocabSize);

        const vocabIndexMap = new Map();
        sortedVocab.forEach((w, idx) => vocabIndexMap.set(w, idx));

        // 4. TF-IDF 行列を構築
        const matrix = [];
        for (let i = 0; i < N; i++) {
            const rowVec = new Array(sortedVocab.length).fill(0);
            const words = docWordLists[i];
            const wordCounts = {};
            words.forEach(w => {
                if (vocabIndexMap.has(w)) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });

            let normSq = 0;
            Object.entries(wordCounts).forEach(([w, count]) => {
                const colIdx = vocabIndexMap.get(w);
                const tf = 1 + Math.log(count);
                const idf = Math.log(N / (docFreq[w] + 1)) + 1;
                const tfidf = tf * idf;
                rowVec[colIdx] = tfidf;
                normSq += tfidf * tfidf;
            });

            // L2正規化（各文書ベクトルの長さを1に揃えて文章長の差異を吸収）
            const norm = Math.sqrt(normSq);
            if (norm > 0) {
                for (let j = 0; j < rowVec.length; j++) {
                    rowVec[j] /= norm;
                }
            }

            matrix.push(rowVec);
        }

        return {
            vocabulary: sortedVocab,
            matrix,
            wordDocCounts: docFreq,
            docWordLists
        };
    }
};
