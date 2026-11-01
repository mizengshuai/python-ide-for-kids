export * from './types';
export * from './matcher';
export * from './stats';
export { ENTRIES } from './data';

import { Lexicon } from './matcher';
import { ENTRIES } from './data';

/** 全局默认词库实例 */
export const builtinLexicon = new Lexicon(ENTRIES);
