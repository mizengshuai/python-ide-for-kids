/**
 * 词汇熟练度统计（纯本地，localStorage 持久化）。
 *
 * 计分：采纳提示 +1 分，自己默写出来 +2 分（更强的掌握证据）。
 * 渐退梯度：
 *   0-3 分 → 生词：完整 ghost 立即出现（T3）
 *   4-7 分 → 学习中：ghost 延迟 ~2 秒出现，先给回忆窗口（T1）
 *   8+ 分 → 掌握：英文通道给元提示 chip、中文通道给打码 ghost（T0/T2）
 * 由 typed 跨过 8 分时触发一次「已掌握」通知。
 */

export interface LexStatCell {
  /** 采纳提示次数 */
  a: number;
  /** 自己默写次数 */
  t: number;
  /** 最近使用时间戳 */
  last: number;
  /** 已发过掌握通知 */
  toast?: 1;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'xm.lexStats.v1';

export class LexStats {
  private data: Record<string, LexStatCell> = {};
  private storage: StorageLike | null;

  constructor(storage?: StorageLike) {
    this.storage = storage ?? null;
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* 存储不可用时静默降级为内存模式 */
    }
  }

  cell(id: string): LexStatCell | undefined {
    return this.data[id];
  }

  /** 熟练度档位：0 生词 / 1 学习中 / 2 掌握 */
  proficiency(id: string): 0 | 1 | 2 {
    const c = this.data[id];
    if (!c) return 0;
    const pts = c.a + c.t * 2;
    if (pts >= 8) return 2;
    if (pts >= 4) return 1;
    return 0;
  }

  /** 分数（测试/调试用） */
  points(id: string): number {
    const c = this.data[id];
    return c ? c.a + c.t * 2 : 0;
  }

  recordAccepted(id: string): { prof: 0 | 1 | 2 } {
    const c = (this.data[id] ??= { a: 0, t: 0, last: 0 });
    c.a += 1;
    c.last = Date.now();
    this.save();
    return { prof: this.proficiency(id) };
  }

  /** 自己写出了这个词；处于掌握档且是首次默写时返回 mastered=true（每个词条只通知一次） */
  recordTyped(id: string): { prof: 0 | 1 | 2; mastered: boolean } {
    const c = (this.data[id] ??= { a: 0, t: 0, last: 0 });
    c.t += 1;
    c.last = Date.now();
    const after = this.proficiency(id);
    let mastered = false;
    if (!c.toast && this.points(id) >= 8) {
      c.toast = 1;
      mastered = true;
    }
    this.save();
    return { prof: after, mastered };
  }

  /** 最近使用的友好描述（元提示用） */
  lastUsedText(id: string): string {
    const c = this.data[id];
    if (!c || !c.last) return '';
    const days = (Date.now() - c.last) / 86400000;
    if (days < 1) return '你今天用过';
    if (days < 2) return '你昨天用过';
    if (days < 8) return '你最近用过';
    return '';
  }

  /** 测试辅助：直接设分数 */
  _setForTest(id: string, a: number, t: number): void {
    this.data[id] = { a, t, last: Date.now() };
    this.save();
  }
}

/** 浏览器默认实例（安全探测） */
export function createBrowserLexStats(): LexStats {
  try {
    const ls = (globalThis as any).localStorage;
    if (ls) return new LexStats(ls as StorageLike);
  } catch {
    /* ignore */
  }
  return new LexStats();
}
