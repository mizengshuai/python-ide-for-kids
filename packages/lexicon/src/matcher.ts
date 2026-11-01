import type { Channel, Entry, MatchOptions, MatchResult, ScoredEntry, Tier } from './types';

/** ---------- 归一化 ---------- */

/** 全角字母/数字/标点 → 半角，小写 */
export function normalize(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    let c = ch;
    if (code === 0x3000) c = ' ';
    else if (code > 0xff00 && code < 0xff5f) c = String.fromCharCode(code - 0xfee0);
    out += c;
  }
  return out.toLowerCase();
}

/** ---------- 拼音工具 ---------- */

export function pinyinFull(syllables: string[]): string {
  return syllables.join('');
}

export function pinyinInitials(syllables: string[]): string {
  return syllables.map((s) => s[0]).join('');
}

/** ---------- 编辑距离（Levenshtein，带截断） ---------- */

export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/** ---------- 词库索引 ---------- */

interface IndexedEntry {
  entry: Entry;
  zhSet: Set<string>;          // 全部中文词（原样）
  pyFull: string[];            // 各 zh 对应全拼（同序）
  pyInit: string[];            // 各 zh 对应首字母
}

export class Lexicon {
  private indexed: IndexedEntry[] = [];
  private _byEn = new Map<string, Entry>();

  constructor(entries: Entry[]) {
    for (const entry of entries) {
      const pyFull: string[] = [];
      const pyInit: string[] = [];
      if (entry.pinyin && entry.pinyin.length === entry.zh.length) {
        for (const py of entry.pinyin) {
          pyFull.push(pinyinFull(py.split(' ')));
          pyInit.push(pinyinInitials(py.split(' ')));
        }
      }
      this.indexed.push({ entry, zhSet: new Set(entry.zh), pyFull, pyInit });
      if (!this._byEn.has(entry.en)) this._byEn.set(entry.en, entry);
    }
  }

  get size(): number {
    return this.indexed.length;
  }

  byEn(en: string): Entry | undefined {
    return this._byEn.get(en);
  }

  allEntries(): Entry[] {
    return this.indexed.map((x) => x.entry);
  }

  /** 所有英文标识符（供「是不是想写…」拼写建议） */
  allEnNames(): string[] {
    return [...this._byEn.keys()];
  }

  /** ---------- 通道识别与匹配 ---------- */

  /**
   * @param lineBeforeCursor 光标前的整行内容（已 trim 行尾）
   */
  match(lineBeforeCursor: string, opts: MatchOptions = {}): MatchResult | null {
    const maxUnit = opts.maxUnit ?? Infinity;
    const maxLevel = opts.maxLevel ?? 2;
    const maxCandidates = opts.maxCandidates ?? 3;
    const tier: Tier | undefined = opts.tier;

    const channel = this.detectChannel(lineBeforeCursor);
    if (!channel) return null;

    const token = extractToken(lineBeforeCursor, channel);
    if (!token) return null;

    const allowed = (e: Entry) =>
      e.unit <= maxUnit && e.level <= maxLevel && (tier !== 'basic' || e.tier === 'basic');
    let candidates: ScoredEntry[] = [];

    if (channel === 'C') {
      // 成员通道：. 之后，只匹配 method；token 可为空（列出常用方法）
      for (const it of this.indexed) {
        if (it.entry.kind !== 'method' || !allowed(it.entry)) continue;
        const q = token.text;
        let score = 0;
        let via = '';
        if (!q) {
          score = 40 + Math.max(0, 20 - it.entry.unit * 2); // 空查询按单元靠前
          via = '成员列表';
        } else if (it.entry.en.startsWith(q)) {
          score = 88;
          via = '英文前缀';
        } else if (it.zhSet.has(q)) {
          score = 100;
          via = '中文精确';
        } else if (containsAny(it.entry.zh, q)) {
          score = 70;
          via = '中文包含';
        } else if (it.entry.en.includes(q)) {
          score = 60;
          via = '英文包含';
        } else if (it.pyFull.some((p) => p === q)) {
          score = 90;
          via = '拼音全拼';
        } else if (it.pyInit.some((p) => p === q)) {
          score = 85;
          via = '拼音首字母';
        } else if (q.length >= 3 && it.entry.zh.some((z) => editDistance(z, q, 1) <= 1)) {
          score = 50;
          via = '模糊';
        }
        if (score > 0) candidates.push({ entry: it.entry, score, via });
      }
    } else if (channel === 'A') {
      // 中文通道（方法词条只在 . 之后出现，语句级不提示裸方法名）
      const q = token.text;
      for (const it of this.indexed) {
        if (!allowed(it.entry) || it.entry.kind === 'method') continue;
        let score = 0;
        let via = '';
        if (it.zhSet.has(q)) {
          score = 100;
          via = '中文精确';
        } else if (it.pyFull.includes(q) || it.pyInit.includes(q)) {
          // 中文段里一般不含拼音，但保留以防输入法半转换状态
          score = 90;
          via = '拼音';
        } else if (startsWithAny(it.entry.zh, q)) {
          score = 70;
          via = '中文前缀';
        } else if (it.entry.zh.some((z) => z.startsWith(q) === false && q.startsWith(z) && q.length <= z.length + 3)) {
          // 学生打了更长的词，词条是它的前缀（如「输出内容」→ 输出）
          score = 60;
          via = '词条前缀';
        } else if (q.length >= 3 && it.entry.zh.some((z) => editDistance(z, q, 1) <= 1)) {
          score = 50;
          via = '模糊';
        }
        if (score > 0) candidates.push({ entry: it.entry, score, via });
      }
    } else {
      // B 通道：拼音 / 英文前缀（方法词条只走 C 通道）
      const q = normalize(token.text);
      if (q.length < 2) return null;
      for (const it of this.indexed) {
        if (!allowed(it.entry) || it.entry.kind === 'method') continue;
        let score = 0;
        let via = '';
        const en = it.entry.en;
        if (en === q) {
          score = 100;
          via = '英文精确';
        } else if (en.startsWith(q)) {
          score = 88;
          via = '英文前缀';
        } else if (it.pyFull.some((p) => p === q)) {
          score = 90;
          via = '拼音全拼';
        } else if (it.pyInit.some((p) => p === q)) {
          score = 85;
          via = '拼音首字母';
        } else if (it.pyFull.some((p) => p.startsWith(q))) {
          score = 80;
          via = '拼音前缀';
        } else if (it.pyInit.some((p) => p.startsWith(q))) {
          score = 75;
          via = '首字母前缀';
        } else if (en.includes(q)) {
          score = 60;
          via = '英文包含';
        } else if (q.length >= 4 && en.length <= q.length + 1 && editDistance(en, q, 1) <= 1) {
          score = 50;
          via = '模糊';
        }
        if (score > 0) candidates.push({ entry: it.entry, score, via });
      }
    }

    // 排序：分数降序 → 单元升序（先学优先）→ 标识符短优先
    candidates.sort(
      (a, b) => b.score - a.score || a.entry.unit - b.entry.unit || a.entry.en.length - b.entry.en.length
    );
    // 去重同一 en
    const seen = new Set<string>();
    candidates = candidates.filter((c) => {
      if (seen.has(c.entry.en)) return false;
      seen.add(c.entry.en);
      return true;
    });
    if (candidates.length === 0) return null;
    return { channel, token, candidates: candidates.slice(0, maxCandidates) };
  }

  /** 通道识别：看行尾内容 */
  private detectChannel(line: string): Channel | null {
    // C：以 . 结尾（允许 . 后已有部分字母/中文）
    if (/[.\u3002]\s*[\u4e00-\u9fa5A-Za-z_]*$/.test(line) && /[.\u3002]/.test(line)) {
      const afterDot = line.split(/[.\u3002]/).pop() ?? '';
      // 确保 . 前是标识符（变量名），比如 "abc." 而不是数字 "3."
      const beforeDot = line.slice(0, line.length - afterDot.length - 1);
      if (/[A-Za-z_\)\]]$/.test(beforeDot) && /^[\u4e00-\u9fa5A-Za-z_]{0,20}$/.test(afterDot)) {
        return 'C';
      }
    }
    // A：行尾是连续中文
    if (/[\u4e00-\u9fa5]{1,}$/.test(line)) return 'A';
    // B：行尾是连续字母（≥2，由 match 里再判）
    if (/[A-Za-z_]{2,}$/.test(line)) return 'B';
    return null;
  }
}

/** 从行尾提取要替换的 token，返回起止列（0 基） */
export function extractToken(line: string, channel: Channel): { text: string; startCol: number; endCol: number } | null {
  if (channel === 'C') {
    const m = line.match(/[\u4e00-\u9fa5A-Za-z_]*$/);
    if (!m) return null;
    const text = m[0];
    return { text, startCol: line.length - text.length, endCol: line.length };
  }
  const re = channel === 'A' ? /[\u4e00-\u9fa5]+$/ : /[A-Za-z_]+$/;
  const m = line.match(re);
  if (!m) return null;
  const text = m[0];
  if (channel === 'B' && text.length < 2) return null;
  if (channel === 'A' && text.length < 1) return null;
  return { text, startCol: line.length - text.length, endCol: line.length };
}

function startsWithAny(list: string[], q: string): boolean {
  return list.some((z) => z.startsWith(q));
}
function containsAny(list: string[], q: string): boolean {
  return list.some((z) => z.includes(q));
}
