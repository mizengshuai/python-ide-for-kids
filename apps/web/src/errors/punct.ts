/** 中文标点检测与修复（跳过字符串和注释内的内容） */

const PUNCT_MAP: Record<string, string> = {
  '，': ',', '。': '.', '：': ':', '；': ';',
  '（': '(', '）': ')', '【': '[', '】': ']', '｛': '{', '｝': '}',
  '“': '"', '”': '"', '‘': "'", '’': "'",
  '？': '?', '！': '!', '、': ',',
};

export const FULLWIDTH_CHARS = Object.keys(PUNCT_MAP);

export interface PunctFixResult {
  newCode: string;
  count: number;
}

/** 简易扫描状态：普通 / 单行注释 / 单引号 / 双引号 / 三引号 */
function scan(code: string, onCodeChar: (ch: string, index: number) => string | null): string {
  let out = '';
  let i = 0;
  const n = code.length;
  let quote: string | null = null;
  let inComment = false;

  while (i < n) {
    const ch = code[i];
    const triple = code.slice(i, i + 3);

    if (inComment) {
      if (ch === '\n') inComment = false;
      out += ch;
      i += 1;
      continue;
    }

    // 三引号进出
    if (triple === '"""' || triple === "'''") {
      if (quote === triple) {
        quote = null;
      } else if (!quote) {
        quote = triple;
      }
      out += triple;
      i += 3;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        out += ch + (code[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (quote.length === 1 && ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '#') {
      inComment = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    const rep = onCodeChar(ch, i);
    out += rep ?? ch;
    i += 1;
  }
  return out;
}

/** 把代码区（字符串/注释之外）的中文标点替换为英文标点 */
export function fixPunctOutsideStrings(code: string): PunctFixResult {
  let count = 0;
  const newCode = scan(code, (ch) => {
    const rep = PUNCT_MAP[ch];
    if (rep !== undefined) {
      count += 1;
      return rep;
    }
    return null;
  });
  return { newCode, count };
}

/** 找出代码区第一个中文标点及其位置（用于提示），没有则返回 null */
export function firstPunctIssue(code: string): { char: string; index: number } | null {
  let found: { char: string; index: number } | null = null;
  scan(code, (ch, i) => {
    if (!found && FULLWIDTH_CHARS.includes(ch)) {
      found = { char: ch, index: i };
      return '';
    }
    return null;
  });
  return found;
}
