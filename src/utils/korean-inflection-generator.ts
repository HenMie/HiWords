/**
 * 韩语活用形生成工具
 * 为韩语动词/形容词生成常见活用形
 */

import { isKoreanWord } from './korean-text-utils';

/**
 * 为韩语单词生成常见活用形
 * @param baseWord 原型单词（以'다'结尾的动词/形容词）
 * @returns 活用形数组
 */
export function generateCommonInflections(baseWord: string): string[] {
  // 只为韩语动词/形容词生成活用形
  if (!isKoreanWord(baseWord) || !baseWord.endsWith('다')) {
    return [];
  }

  const stem = baseWord.slice(0, -1); // 去掉 '다'
  const inflections: string[] = [];

  // 检查词干最后一个字符是否有收音（받침）
  const lastChar = stem[stem.length - 1];
  const hasFinalConsonant = checkHasFinalConsonant(lastChar);

  // 检查是否为ㅂ不规则动词（如 사납다）
  const isBIrregular = checkIsBIrregular(lastChar);

  if (isBIrregular) {
    // ㅂ不规则：사납다 -> 사나우 + 어 = 사나워
    const irregularStem = applyBIrregular(stem);

    // 基本连接语尾
    inflections.push(irregularStem + '어');     // 사나워
    inflections.push(irregularStem + '니');     // 사나우니
    inflections.push(irregularStem + '면');     // 사나우면
    inflections.push(stem + '고');              // 사납고（保持原形）

    // 连体语尾（需要将ㄴ和ㄹ添加为收音）
    const stemWithN = addFinalConsonant(irregularStem, 4); // ㄴ的终声值是4
    const stemWithL = addFinalConsonant(irregularStem, 8); // ㄹ的终声值是8
    inflections.push(stemWithN);     // 사나운
    inflections.push(stemWithL);     // 사나울

    // 敬语
    inflections.push(irregularStem + '어요');   // 사나워요
  } else {
    // 规则动词
    // 基本连接语尾
    inflections.push(stem + '고');      // 거론되고
    inflections.push(stem + '어');      // 거론되어
    inflections.push(stem + '면');      // 거론되면
    inflections.push(stem + '니');      // 거론되니
    inflections.push(stem + '며');      // 거론되며

    // 敬语形式
    inflections.push(stem + '어요');    // 거론되어요
    inflections.push(stem + '습니다');  // 거론됩니다

    // 过去时
    inflections.push(stem + '었다');    // 거론되었다
    inflections.push(stem + '었어요');  // 거론되었어요

    // 连体语尾
    inflections.push(stem + '는');      // 거론되는
    inflections.push(stem + '은');      // 거론된
    inflections.push(stem + '던');      // 거론되던

    // 未来/推测语尾 (ㄹ语尾) - 需要根据是否有收音决定
    if (hasFinalConsonant) {
      inflections.push(stem + '을');      // 거론될（有收音：거론되 + 을）
      inflections.push(stem + '을까');
    } else {
      // 无收音：需要将ㄹ添加为收音
      const stemWithL = addFinalConsonant(stem, 8); // ㄹ的终声值是8
      inflections.push(stemWithL);      // 찢어질（无收音：찢어지 + ㄹ = 찢어질）
      inflections.push(stemWithL + '까');
    }

    // 其他常见语尾
    inflections.push(stem + '지');      // 거론되지
    inflections.push(stem + '서');      // 거론되서
    inflections.push(stem + '지만');    // 거론되지만
  }

  return inflections;
}

/**
 * 检查韩文字符是否有收音（받침）
 * @param char 韩文字符
 * @returns 是否有收音
 */
export function checkHasFinalConsonant(char: string): boolean {
  if (!char || char.length !== 1) return false;
  const code = char.charCodeAt(0);
  // 韩文音节范围：0xAC00-0xD7A3
  if (code < 0xAC00 || code > 0xD7A3) return false;

  // 韩文音节结构：(初声 * 21 + 中声) * 28 + 终声 + 0xAC00
  // 终声为0表示无收音
  const finalConsonant = (code - 0xAC00) % 28;
  return finalConsonant !== 0;
}

/**
 * 检查是否为ㅂ不规则动词
 * @param char 韩文字符
 * @returns 是否为ㅂ不规则
 */
export function checkIsBIrregular(char: string): boolean {
  if (!char || char.length !== 1) return false;
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;

  // 检查收音是否为ㅂ (17)
  const finalConsonant = (code - 0xAC00) % 28;
  return finalConsonant === 17; // ㅂ的终声值
}

/**
 * 应用ㅂ不规则变化：사납 -> 사나우
 * @param stem 词干
 * @returns 应用不规则变化后的词干
 */
export function applyBIrregular(stem: string): string {
  if (!stem) return stem;

  const lastChar = stem[stem.length - 1];
  const code = lastChar.charCodeAt(0);

  if (code < 0xAC00 || code > 0xD7A3) return stem;

  // 分解韩文字符
  const base = code - 0xAC00;
  const initialConsonant = Math.floor(base / 588); // 初声
  const medialVowel = Math.floor((base % 588) / 28); // 中声
  const finalConsonant = base % 28; // 终声

  // 如果终声是ㅂ(17)，去掉ㅂ并添加우
  if (finalConsonant === 17) {
    // 去掉收音ㅂ
    const newChar = String.fromCharCode(0xAC00 + initialConsonant * 588 + medialVowel * 28);
    return stem.slice(0, -1) + newChar + '우';
  }

  return stem;
}

/**
 * 给韩文字符串的最后一个字符添加收音
 * @param text 韩文字符串
 * @param finalConsonantValue 收音值（0-27，0表示无收音）
 * @returns 添加收音后的字符串
 */
export function addFinalConsonant(text: string, finalConsonantValue: number): string {
  if (!text || text.length === 0) return text;

  const lastChar = text[text.length - 1];
  const code = lastChar.charCodeAt(0);

  // 检查是否为韩文音节
  if (code < 0xAC00 || code > 0xD7A3) return text;

  // 分解韩文字符
  const base = code - 0xAC00;
  const initialConsonant = Math.floor(base / 588); // 初声
  const medialVowel = Math.floor((base % 588) / 28); // 中声

  // 构造新字符（添加指定的收音）
  const newChar = String.fromCharCode(
    0xAC00 + initialConsonant * 588 + medialVowel * 28 + finalConsonantValue
  );

  return text.slice(0, -1) + newChar;
}

// isKoreanWord 现在从 korean-text-utils.ts 导入
