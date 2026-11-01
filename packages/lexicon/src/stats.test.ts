import { describe, expect, it } from 'vitest';
import { LexStats, type StorageLike } from './stats';

function memStorage(): StorageLike & { dump(): string } {
  let s = '';
  return {
    getItem: () => s,
    setItem: (_k, v) => {
      s = v;
    },
    dump: () => s,
  };
}

describe('LexStats 熟练度渐退', () => {
  it('新词 proficiency=0', () => {
    const st = new LexStats(memStorage());
    expect(st.proficiency('bi-print')).toBe(0);
  });

  it('采纳 3 次仍是生词（0-3 分 → T3 立即提示）', () => {
    const st = new LexStats(memStorage());
    st._setForTest('bi-print', 3, 0);
    expect(st.proficiency('bi-print')).toBe(0);
  });

  it('4 次采纳进入学习中（T1 延迟提示）', () => {
    const st = new LexStats(memStorage());
    st._setForTest('bi-print', 4, 0);
    expect(st.proficiency('bi-print')).toBe(1);
  });

  it('默写权重更高：2 次默写 + 0 采纳 = 4 分 → 学习中', () => {
    const st = new LexStats(memStorage());
    st._setForTest('bi-print', 0, 2);
    expect(st.points('bi-print')).toBe(4);
    expect(st.proficiency('bi-print')).toBe(1);
  });

  it('8 分进入掌握（T0/T2）', () => {
    const st = new LexStats(memStorage());
    st._setForTest('bi-print', 8, 0);
    expect(st.proficiency('bi-print')).toBe(2);
  });

  it('由默写跨入掌握时触发一次 mastered 通知，之后不再触发', () => {
    const st = new LexStats(memStorage());
    st._setForTest('bi-print', 3, 2); // 3+4=7 分，还差一步
    const r1 = st.recordTyped('bi-print'); // +2 → 9 分
    expect(r1.mastered).toBe(true);
    expect(r1.prof).toBe(2);
    const r2 = st.recordTyped('bi-print');
    expect(r2.mastered).toBe(false);
  });

  it('由采纳跨入掌握不触发通知（通知只认默写）', () => {
    const st = new LexStats(memStorage());
    st._setForTest('bi-print', 7, 0);
    st.recordAccepted('bi-print'); // 8 分
    expect(st.proficiency('bi-print')).toBe(2);
    const r = st.recordTyped('bi-print');
    expect(r.mastered).toBe(true); // 首次 typed 且未通知过
  });

  it('持久化：新实例从 storage 恢复', () => {
    const s = memStorage();
    const st1 = new LexStats(s);
    st1._setForTest('bi-print', 5, 0);
    const st2 = new LexStats(s);
    expect(st2.proficiency('bi-print')).toBe(1);
    expect(JSON.parse(s.dump())['bi-print'].a).toBe(5);
  });

  it('lastUsedText 按天数给出描述', () => {
    const st = new LexStats(memStorage());
    st.recordAccepted('bi-print');
    expect(st.lastUsedText('bi-print')).toBe('你今天用过');
    expect(st.lastUsedText('bi-none')).toBe('');
  });
});
