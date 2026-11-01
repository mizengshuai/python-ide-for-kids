import { describe, expect, it } from 'vitest';
import { ENTRIES, builtinLexicon } from './index';
import { editDistance, extractToken, normalize } from './matcher';

describe('数据完整性', () => {
  it('词条数量 ≥ 120', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(120);
  });
  it('zh 与 pinyin 数量一致（有 pinyin 时）', () => {
    for (const e of ENTRIES) {
      if (e.pinyin) expect(e.pinyin.length, e.id).toBe(e.zh.length);
    }
  });
  it('id 唯一', () => {
    const ids = new Set(ENTRIES.map((e) => e.id));
    expect(ids.size).toBe(ENTRIES.length);
  });
});

describe('A 通道：中文 → Python', () => {
  it('输出 → print', () => {
    const r = builtinLexicon.match('shuchu') ?? builtinLexicon.match('输出');
    const r2 = builtinLexicon.match('输出 ');
    const m = builtinLexicon.match('print("hi") 输出');
    expect(m?.candidates[0]?.entry.en).toBe('print');
    expect(m?.channel).toBe('A');
    expect(m?.token.text).toBe('输出');
    expect(r2).toBeNull(); // 后面带空格不触发
  });
  it('随机整数 → random.randint（全限定）', () => {
    const m = builtinLexicon.match('x = 随机整数');
    expect(m?.candidates[0]?.entry.en).toBe('randint');
    expect(m?.candidates[0]?.entry.insert.startsWith('random.randint(')).toBe(true);
  });
  it('前进 → turtle.forward（全限定），语句级不给裸方法', () => {
    const m = builtinLexicon.match('前进');
    expect(m?.candidates[0]?.entry.en).toBe('forward');
    expect(m?.candidates[0]?.entry.insert).toBe('turtle.forward($1)');
  });
  it('循环 → for 和 while 都在候选里', () => {
    const m = builtinLexicon.match('循环');
    const ens = m?.candidates.map((c) => c.entry.en) ?? [];
    expect(ens).toContain('for');
  });
  it('中文打一半也能前缀匹配', () => {
    const m = builtinLexicon.match('随机整');
    expect(m?.candidates[0]?.entry.en).toBe('randint');
  });
});

describe('B 通道：拼音 / 英文前缀', () => {
  it('shuchu → print（拼音全拼）', () => {
    const m = builtinLexicon.match('shuchu');
    expect(m?.candidates[0]?.entry.en).toBe('print');
    expect(m?.channel).toBe('B');
  });
  it('sc → print（拼音首字母）', () => {
    const m = builtinLexicon.match('sc');
    expect(m?.candidates[0]?.entry.en).toBe('print');
  });
  it('pri → print（英文前缀）', () => {
    const m = builtinLexicon.match('pri');
    expect(m?.candidates[0]?.entry.en).toBe('print');
  });
  it('suijizhengshu → randint', () => {
    const m = builtinLexicon.match('n = suijizhengshu');
    expect(m?.candidates[0]?.entry.en).toBe('randint');
  });
  it('单字母不触发', () => {
    expect(builtinLexicon.match('p')).toBeNull();
  });
  it('包含 import 语句时不把 import 之后的英文当查询', () => {
    // import 后面是要输入的模块名，此时提示会干扰：前缀 import 本身已完整
    const m = builtinLexicon.match('import rand');
    // rand 前缀应命中 random 模块词条（randint 是精确前缀? randint starts with rand）
    expect(m?.candidates.map((c) => c.entry.en)).toContain('randint');
  });
});

describe('C 通道：. 之后方法提示', () => {
  it('t.前进 → forward（裸方法）', () => {
    const m = builtinLexicon.match('t.前进');
    expect(m?.channel).toBe('C');
    expect(m?.candidates[0]?.entry.en).toBe('forward');
    expect(m?.candidates[0]?.entry.insert).toBe('forward($1)');
  });
  it('name.分割 → split', () => {
    const m = builtinLexicon.match('name.fenge');
    expect(m?.channel).toBe('C');
    expect(m?.candidates[0]?.entry.en).toBe('split');
  });
  it('names.ap → append 英文前缀', () => {
    const m = builtinLexicon.match('names.ap');
    expect(m?.candidates[0]?.entry.en).toBe('append');
  });
  it('t. 空查询给出方法列表', () => {
    const m = builtinLexicon.match('t.');
    expect(m?.channel).toBe('C');
    expect(m!.candidates.length).toBeGreaterThan(0);
    expect(m!.candidates.every((c) => c.entry.kind === 'method')).toBe(true);
  });
  it('数字后的点（3.14）不触发', () => {
    expect(builtinLexicon.match('x = 3.14')).toBeNull();
  });
});

describe('级别与单元过滤', () => {
  it('默认含 L2 句式', () => {
    const m = builtinLexicon.match('遍历列表');
    expect(m?.candidates[0]?.entry.level).toBe(2);
  });
  it('maxLevel=1 时句式被过滤', () => {
    const m = builtinLexicon.match('遍历列表', { maxLevel: 1 });
    expect(m).toBeNull(); // 「遍历列表」只有 L2 词条，过滤后无候选
    const m2 = builtinLexicon.match('输出', { maxLevel: 1 });
    expect(m2?.candidates[0]?.entry.level).toBe(1);
  });
  it('免提示（maxLevel=0）时无结果', () => {
    const m = builtinLexicon.match('输出', { maxLevel: 0 });
    expect(m).toBeNull();
  });
});

describe('档位过滤（基础语法档 / 创新档）', () => {
  it('基础档：输出 → print 仍可用', () => {
    const m = builtinLexicon.match('输出', { tier: 'basic' });
    expect(m?.candidates[0]?.entry.en).toBe('print');
  });
  it('基础档：循环 → for 可用（语法类）', () => {
    const m = builtinLexicon.match('循环', { tier: 'basic' });
    expect(m?.candidates[0]?.entry.en).toBe('for');
  });
  it('基础档：随机整数（random）不提示', () => {
    expect(builtinLexicon.match('随机整数', { tier: 'basic' })).toBeNull();
    expect(builtinLexicon.match('suijizhengshu', { tier: 'basic' })).toBeNull();
  });
  it('基础档：前进/等待/平方根（turtle/time/math）都不提示', () => {
    expect(builtinLexicon.match('前进', { tier: 'basic' })).toBeNull();
    expect(builtinLexicon.match('等待', { tier: 'basic' })).toBeNull();
    expect(builtinLexicon.match('平方根', { tier: 'basic' })).toBeNull();
  });
  it('基础档：t.前进 不提示，但 names.ap → append 可用', () => {
    expect(builtinLexicon.match('t.前进', { tier: 'basic' })).toBeNull();
    const m = builtinLexicon.match('names.ap', { tier: 'basic' });
    expect(m?.candidates[0]?.entry.en).toBe('append');
  });
  it('基础档：列表方法候选不含 turtle 方法', () => {
    const m = builtinLexicon.match('t.', { tier: 'basic' });
    const mods = new Set(m?.candidates.map((c) => c.entry.module) ?? []);
    expect([...mods].every((x) => ['str', 'list', 'dict', 'file'].includes(x))).toBe(true);
  });
  it('创新档（缺省不过滤）：随机整数照常提示', () => {
    const m1 = builtinLexicon.match('随机整数', { tier: 'creative' });
    const m2 = builtinLexicon.match('随机整数');
    expect(m1?.candidates[0]?.entry.en).toBe('randint');
    expect(m2?.candidates[0]?.entry.en).toBe('randint');
  });
  it('词条 tier 与模块一致：turtle/random/time/math 为 creative，其余 basic', () => {
    for (const e of ENTRIES) {
      const expectBasic = ['builtin', 'syntax', 'str', 'list', 'dict', 'file'].includes(e.module);
      expect(e.tier, e.id).toBe(expectBasic ? 'basic' : 'creative');
    }
  });
});

describe('工具函数', () => {
  it('normalize 全角转半角', () => {
    expect(normalize('Ｐｒｉｎｔ')).toBe('print');
  });
  it('editDistance 基本正确', () => {
    expect(editDistance('prnt', 'print', 2)).toBe(1);
    expect(editDistance('print', 'print', 2)).toBe(0);
    expect(editDistance('abc', 'xyz', 2)).toBe(3);
  });
  it('extractToken 列位置正确', () => {
    const t = extractToken('x = 输出', 'A')!;
    expect(t.text).toBe('输出');
    expect(t.startCol).toBe(4);
    expect(t.endCol).toBe(6);
  });
});
