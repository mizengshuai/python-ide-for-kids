/** 词库词条类型定义 */

export type EntryKind = 'keyword' | 'function' | 'method' | 'module' | 'constant' | 'pattern' | 'class';

/**
 * 提示档位：
 * - basic    基础语法档（GESP 等级考试范围）：内置语法、内置函数、字符串/列表/字典方法、文件读写
 * - creative 创新档：在 basic 之上加入开放库（turtle/random/time/math 等）
 */
export type Tier = 'basic' | 'creative';

/** 参数占位符：插入后光标/提示的位置 */
export interface Placeholder {
  n: number;
  /** 中文提示，如「要显示的内容」 */
  hint: string;
  /** 逐参数导航时显示的微解释（可选） */
  tip?: string;
}

export interface Entry {
  id: string;
  /** 中文词与同义词 */
  zh: string[];
  /** 拼音（按音节分块，如 ["shu","chu"]）；构建/编写时人工标注 */
  pinyin?: string[];
  /** Python 标识符（英文），如 print / randint / forward */
  en: string;
  kind: EntryKind;
  /** 插入模板，$n 为占位符位置 */
  insert: string;
  placeholders?: Placeholder[];
  /** 一句话中文说明 */
  doc: string;
  /** 例句 */
  example?: string;
  /** 所属模块：builtin / str / list / dict / turtle / random / time / math / file / syntax */
  module: string;
  /** 档位（构建时按 module 自动推导，basic = GESP 考试范围） */
  tier: Tier;
  /** 教学单元（1 起步；99 表示进阶） */
  unit: number;
  /** L1 词汇 / L2 句式骨架 */
  level: 1 | 2;
}

/** 匹配触发通道 */
export type Channel = 'A' /* 中文 */ | 'B' /* 拼音/英文 */ | 'C' /* . 后成员 */;

export interface ScoredEntry {
  entry: Entry;
  score: number;
  /** 命中方式，用于调试与展示 */
  via: string;
}

export interface MatchResult {
  /** 触发通道 */
  channel: Channel;
  /** 需要被替换的源文本（光标左侧的 token）及其起止列 */
  token: { text: string; startCol: number; endCol: number };
  /** 候选，按分数降序，至多 maxCandidates 个 */
  candidates: ScoredEntry[];
}

export interface MatchOptions {
  /** 允许的最大教学单元（默认不限） */
  maxUnit?: number;
  /** 允许的最大提示级别（默认 2，含句式） */
  maxLevel?: number;
  /** 档位过滤：basic 只匹配基础语法档词条；creative/缺省为全量 */
  tier?: Tier;
  /** 每次返回的候选上限 */
  maxCandidates?: number;
}
