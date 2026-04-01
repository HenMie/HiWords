/**
 * 日语活用形生成工具
 * 为日语动词/形容词生成常见活用形
 */

import { isJapaneseWord, containsKana } from './japanese-text-utils';

/**
 * 日语动词分类
 */
type VerbType = 'godan' | 'ichidan' | 'suru' | 'kuru' | 'unknown';

/**
 * 五段动词词尾到活用形的映射
 */
const GODAN_CONJUGATIONS: Record<string, {
    masu: string;      // ます形连用形
    te: string;        // て形
    ta: string;        // た形
    nai: string;       // ない形
    potential: string; // 可能形
    imperative: string; // 命令形
    volitional: string; // 意志形
}> = {
    'う': { masu: 'い', te: 'って', ta: 'った', nai: 'わ', potential: 'え', imperative: 'え', volitional: 'おう' },
    'く': { masu: 'き', te: 'いて', ta: 'いた', nai: 'か', potential: 'け', imperative: 'け', volitional: 'こう' },
    'ぐ': { masu: 'ぎ', te: 'いで', ta: 'いだ', nai: 'が', potential: 'げ', imperative: 'げ', volitional: 'ごう' },
    'す': { masu: 'し', te: 'して', ta: 'した', nai: 'さ', potential: 'せ', imperative: 'せ', volitional: 'そう' },
    'つ': { masu: 'ち', te: 'って', ta: 'った', nai: 'た', potential: 'て', imperative: 'て', volitional: 'とう' },
    'ぬ': { masu: 'に', te: 'んで', ta: 'んだ', nai: 'な', potential: 'ね', imperative: 'ね', volitional: 'のう' },
    'ぶ': { masu: 'び', te: 'んで', ta: 'んだ', nai: 'ば', potential: 'べ', imperative: 'べ', volitional: 'ぼう' },
    'む': { masu: 'み', te: 'んで', ta: 'んだ', nai: 'ま', potential: 'め', imperative: 'め', volitional: 'もう' },
    'る': { masu: 'り', te: 'って', ta: 'った', nai: 'ら', potential: 'れ', imperative: 'れ', volitional: 'ろう' },
};

/**
 * 常见的一段动词词尾模式
 * 一段动词以「る」结尾，且る前面是い段或え段假名
 */
const ICHIDAN_PATTERNS = [
    'いる', 'きる', 'ぎる', 'しる', 'じる', 'ちる', 'にる', 'ひる', 'びる', 'みる', 'りる',
    'える', 'ける', 'げる', 'せる', 'ぜる', 'てる', 'でる', 'ねる', 'へる', 'べる', 'める', 'れる',
    // 片假名版本
    'イル', 'キル', 'ギル', 'シル', 'ジル', 'チル', 'ニル', 'ヒル', 'ビル', 'ミル', 'リル',
    'エル', 'ケル', 'ゲル', 'セル', 'ゼル', 'テル', 'デル', 'ネル', 'ヘル', 'ベル', 'メル', 'レル',
];

/**
 * 判断动词类型
 */
function getVerbType(baseWord: string): VerbType {
    if (!baseWord || !containsKana(baseWord)) {
        return 'unknown';
    }

    // サ变动词：以「する」结尾
    if (baseWord.endsWith('する')) {
        return 'suru';
    }

    // カ变动词：「来る」「くる」
    if (baseWord === '来る' || baseWord === 'くる') {
        return 'kuru';
    }

    const lastChar = baseWord.slice(-1);
    if (lastChar && lastChar !== 'る') {
        return GODAN_CONJUGATIONS[lastChar] ? 'godan' : 'unknown';
    }

    // 检查是否以「る」结尾
    if (!baseWord.endsWith('る')) {
        return 'unknown';
    }

    // 检查是否为一段动词（る前面是い段或え段）
    for (const pattern of ICHIDAN_PATTERNS) {
        if (baseWord.endsWith(pattern)) {
            return 'ichidan';
        }
    }

    // 默认为五段动词
    return 'godan';
}

/**
 * 为日语动词生成常见活用形
 * @param baseWord 动词基本形（辞书形）
 * @returns 活用形数组
 */
export function generateVerbInflections(baseWord: string): string[] {
    if (!isJapaneseWord(baseWord)) {
        return [];
    }

    const inflections: string[] = [];
    const verbType = getVerbType(baseWord);

    switch (verbType) {
        case 'ichidan':
            inflections.push(...generateIchidanInflections(baseWord));
            break;
        case 'godan':
            inflections.push(...generateGodanInflections(baseWord));
            break;
        case 'suru':
            inflections.push(...generateSuruInflections(baseWord));
            break;
        case 'kuru':
            inflections.push(...generateKuruInflections(baseWord));
            break;
        default:
            // 未知类型，不生成活用形
            break;
    }

    return inflections;
}

/**
 * 生成一段动词活用形
 */
function generateIchidanInflections(baseWord: string): string[] {
    const stem = baseWord.slice(0, -1); // 去掉「る」
    
    return [
        stem + 'ます',      // ます形
        stem + 'て',        // て形
        stem + 'た',        // た形
        stem + 'ない',      // ない形
        stem + 'なかった',  // なかった形
        stem + 'られる',    // 可能形/受身形
        stem + 'させる',    // 使役形
        stem + 'れば',      // 仮定形
        stem + 'ろ',        // 命令形
        stem + 'よう',      // 意志形
        stem,               // 连用形（中止）
    ];
}

/**
 * 生成五段动词活用形
 */
function generateGodanInflections(baseWord: string): string[] {
    const lastChar = baseWord.slice(-1);
    const stem = baseWord.slice(0, -1);
    
    const conjugation = GODAN_CONJUGATIONS[lastChar];
    if (!conjugation) {
        return [];
    }

    return [
        stem + conjugation.masu + 'ます',        // ます形
        stem + conjugation.te,                   // て形
        stem + conjugation.ta,                   // た形
        stem + conjugation.nai + 'ない',         // ない形
        stem + conjugation.nai + 'なかった',     // なかった形
        stem + conjugation.potential + 'る',     // 可能形
        stem + conjugation.nai + 'せる',         // 使役形
        stem + conjugation.potential + 'ば',     // 仮定形
        stem + conjugation.imperative,           // 命令形
        stem + conjugation.volitional,           // 意志形
        stem + conjugation.masu,                 // 连用形（中止）
    ];
}

/**
 * 生成サ变动词活用形
 */
function generateSuruInflections(baseWord: string): string[] {
    const stem = baseWord.slice(0, -2); // 去掉「する」
    
    return [
        stem + 'します',      // ます形
        stem + 'して',        // て形
        stem + 'した',        // た形
        stem + 'しない',      // ない形
        stem + 'しなかった',  // なかった形
        stem + 'できる',      // 可能形
        stem + 'させる',      // 使役形
        stem + 'すれば',      // 仮定形
        stem + 'しろ',        // 命令形
        stem + 'せよ',        // 命令形（文语）
        stem + 'しよう',      // 意志形
        stem + 'し',          // 连用形（中止）
    ];
}

/**
 * 生成カ变动词（来る）活用形
 */
function generateKuruInflections(baseWord: string): string[] {
    // 「来る」或「くる」
    const isKanji = baseWord.startsWith('来');
    const prefix = isKanji ? '来' : '';
    
    return [
        prefix + 'きます',      // ます形
        prefix + 'きて',        // て形
        prefix + 'きた',        // た形
        prefix + 'こない',      // ない形
        prefix + 'こなかった',  // なかった形
        prefix + 'こられる',    // 可能形/受身形
        prefix + 'こさせる',    // 使役形
        prefix + 'くれば',      // 仮定形
        prefix + 'こい',        // 命令形
        prefix + 'こよう',      // 意志形
        prefix + 'き',          // 连用形（中止）
    ];
}

/**
 * 为日语い形容词生成常见活用形
 * @param baseWord 形容词基本形（以「い」结尾）
 * @returns 活用形数组
 */
export function generateIAdjectiveInflections(baseWord: string): string[] {
    if (!isJapaneseWord(baseWord) || !baseWord.endsWith('い')) {
        return [];
    }

    const stem = baseWord.slice(0, -1); // 去掉「い」
    
    return [
        stem + 'く',          // 连用形
        stem + 'くて',        // て形
        stem + 'かった',      // 过去形
        stem + 'くない',      // 否定形
        stem + 'くなかった',  // 否定过去形
        stem + 'ければ',      // 仮定形
        stem + 'さ',          // 名词化
        stem + 'そう',        // 样态
    ];
}

/**
 * 为日语单词生成常见活用形
 * 自动判断词性并生成相应的活用形
 * @param baseWord 基本形
 * @returns 活用形数组
 */
export function generateJapaneseInflections(baseWord: string): string[] {
    if (!isJapaneseWord(baseWord)) {
        return [];
    }

    // 尝试作为动词处理
    if (baseWord.endsWith('る') || baseWord.endsWith('う') || baseWord.endsWith('く') ||
        baseWord.endsWith('ぐ') || baseWord.endsWith('す') || baseWord.endsWith('つ') ||
        baseWord.endsWith('ぬ') || baseWord.endsWith('ぶ') || baseWord.endsWith('む')) {
        return generateVerbInflections(baseWord);
    }

    // 尝试作为い形容词处理
    if (baseWord.endsWith('い') && baseWord.length > 1) {
        // 排除一些不是形容词的词
        const nonAdjectives = ['ない', 'たい', 'らしい'];
        const isNonAdj = nonAdjectives.some(suffix => baseWord === suffix);
        if (!isNonAdj) {
            return generateIAdjectiveInflections(baseWord);
        }
    }

    // 其他情况不生成活用形
    return [];
}
