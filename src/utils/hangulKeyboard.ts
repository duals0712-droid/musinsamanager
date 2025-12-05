const initialKeys = [
  'r',
  'R',
  's',
  'e',
  'E',
  'f',
  'a',
  'q',
  'Q',
  't',
  'T',
  'd',
  'w',
  'W',
  'c',
  'z',
  'x',
  'v',
  'g',
];

const medialKeys = [
  'k',
  'o',
  'i',
  'O',
  'j',
  'p',
  'u',
  'P',
  'h',
  'hk',
  'ho',
  'hl',
  'y',
  'n',
  'nj',
  'np',
  'nl',
  'b',
  'm',
  'ml',
  'l',
];

const finalKeys = [
  '',
  'r',
  'R',
  'rt',
  's',
  'sw',
  'sg',
  'e',
  'f',
  'fr',
  'fa',
  'fq',
  'ft',
  'fx',
  'fv',
  'fg',
  'a',
  'q',
  'qt',
  't',
  'T',
  'd',
  'w',
  'c',
  'z',
  'x',
  'v',
  'g',
];

const compatJamoToKey: Record<string, string> = {
  'ㄱ': 'r',
  'ㄲ': 'R',
  'ㄴ': 's',
  'ㄷ': 'e',
  'ㄸ': 'E',
  'ㄹ': 'f',
  'ㅁ': 'a',
  'ㅂ': 'q',
  'ㅃ': 'Q',
  'ㅅ': 't',
  'ㅆ': 'T',
  'ㅇ': 'd',
  'ㅈ': 'w',
  'ㅉ': 'W',
  'ㅊ': 'c',
  'ㅋ': 'z',
  'ㅌ': 'x',
  'ㅍ': 'v',
  'ㅎ': 'g',
  'ㅏ': 'k',
  'ㅐ': 'o',
  'ㅑ': 'i',
  'ㅒ': 'O',
  'ㅓ': 'j',
  'ㅔ': 'p',
  'ㅕ': 'u',
  'ㅖ': 'P',
  'ㅗ': 'h',
  'ㅘ': 'hk',
  'ㅙ': 'ho',
  'ㅚ': 'hl',
  'ㅛ': 'y',
  'ㅜ': 'n',
  'ㅝ': 'nj',
  'ㅞ': 'np',
  'ㅟ': 'nl',
  'ㅠ': 'b',
  'ㅡ': 'm',
  'ㅢ': 'ml',
  'ㅣ': 'l',
};

export const hangulToKeystrokes = (value: string) => {
  let result = '';

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const syllableIndex = code - 0xac00;
      const initialIndex = Math.floor(syllableIndex / (21 * 28));
      const medialIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
      const finalIndex = syllableIndex % 28;

      result += initialKeys[initialIndex] ?? '';
      result += medialKeys[medialIndex] ?? '';
      result += finalKeys[finalIndex] ?? '';
    } else if (compatJamoToKey[char]) {
      result += compatJamoToKey[char];
    } else {
      result += char;
    }
  }

  return result;
};

export const normalizePassword = (value: string) => {
  return hangulToKeystrokes(value);
};
