import type * as Monaco from 'monaco-editor';
import { builtinLexicon, createBrowserLexStats, LexStats, type Entry, type MatchResult, type Tier } from '@xm/lexicon';

export interface HintSettings {
  enabled: boolean;
  maxLevel: 0 | 1 | 2;
  /** 熟练度渐退（记忆模式）：生词立即提示 → 学习中延迟 → 掌握只给线索 */
  fading: boolean;
  /** 提示档位：basic 基础语法档（GESP 考试范围）/ creative 创新档（含开放库） */
  tier: Tier;
}

/** 把模板 $n 占位符渲染成中文提示文本：print($1) → print(要显示的内容) */
export function renderInsert(entry: Entry): string {
  const ph = new Map<number, string>();
  for (const p of entry.placeholders ?? []) ph.set(p.n, p.hint);
  return entry.insert.replace(/\$(\d+)/g, (_, n) => ph.get(Number(n)) ?? '…');
}

/** 计算当前位置的三通道匹配结果 */
export function computeHint(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  settings: HintSettings
): MatchResult | null {
  if (!settings.enabled || settings.maxLevel <= 0) return null;
  const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  try {
    return builtinLexicon.match(line, { maxLevel: settings.maxLevel, tier: settings.tier });
  } catch {
    return null;
  }
}

/** 悬停文档：把鼠标放到标识符上显示中文说明与例句 */
export function registerHoverDocs(monaco: typeof Monaco): Monaco.IDisposable {
  return monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const entry = builtinLexicon.byEn(word.word);
      if (!entry) return null;
      const ph = (entry.placeholders ?? []).map((p) => `　• $${p.n}＝${p.hint}`).join('\n');
      const lines = [`**${entry.en}** — ${entry.doc}`];
      if (ph) lines.push(ph);
      if (entry.example) lines.push('```python\n' + entry.example + '\n```');
      return { contents: [{ value: lines.join('\n') }] };
    },
  });
}

/** 候选条状态：普通多候选，或「掌握档」的元提示 chip */
export type BarState =
  | { kind: 'cands'; match: MatchResult; top: number; left: number }
  | { kind: 'meta'; text: string; top: number; left: number };

export interface HintController {
  dispose(): void;
  /** 采纳第 index 个候选（候选条点击/数字键） */
  accept(index: number): void;
  /** 掌握档元提示里「看一眼」：显示完整 ghost 一次 */
  reveal(): void;
}

/** 渐退档位 → 展示行为 */
type FadeMode = 'full' | 'delayed' | 'mastered';

function fadeModeFor(entry: Entry, fading: boolean, stats: LexStats): FadeMode {
  if (!fading || entry.kind === 'pattern') return 'full'; // 句式骨架不参与渐退
  const prof = stats.proficiency(entry.id);
  if (prof >= 2) return 'mastered';
  if (prof === 1) return 'delayed';
  return 'full';
}

/** 掌握档的打码文本：print → p···（保留首字母与长度线索） */
function maskedRender(entry: Entry): string {
  const full = renderInsert(entry);
  const masked = entry.en[0] + '·'.repeat(Math.max(0, entry.en.length - 1));
  return full.replace(entry.en, masked);
}

/**
 * 提示控制器（自绘 ghost + 渐退 + 逐参数导航）：
 * - ghost：token 删除线 + 目标代码绿色斜体；Tab 采纳；数字键选候选；Esc 关闭
 * - 渐退：生词立即 → 学习中延迟 1.9s（先回忆）→ 掌握（B 通道元提示 chip / A 通道打码 ghost）
 * - 采纳后进入逐参数导航：每个占位符依次选中，浮层显示微解释，Tab 跳下一个空
 */
export function attachHints(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  getSettings: () => HintSettings,
  onBarUpdate: (st: BarState | null) => void,
  onNotice?: (msg: string) => void
): HintController {
  const stats = createBrowserLexStats();
  let current: MatchResult | null = null;
  let curLine = 0; // 当前提示所在行（供光标离开判断）
  let revealed = false;
  let decos: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  // —— 逐参数导航状态（仅选区与 Tab 跳空，无浮层） ——
  let nav: { startLine: number; endLine: number; items: { text: string; tip?: string }[]; idx: number } | null = null;

  // —— 默写检测 ——
  let lastWord: string | null = null;
  let skipNextTyped = false; // 采纳插入的词不计为默写

  const model = () => editor.getModel();

  const endNav = () => {
    nav = null;
  };

  const clearAll = () => {
    current = null;
    curLine = 0;
    revealed = false;
    const m = model();
    if (m) decos = m.deltaDecorations(decos, []);
    onBarUpdate(null);
  };

  /** 在导航区域内找剩余占位符的位置（学生可能已填掉一部分） */
  const findNavRanges = (): { item: { text: string; tip?: string }; line: number; startCol: number; endCol: number }[] => {
    const m = model();
    if (!nav || !m) return [];
    const out: { item: { text: string; tip?: string }; line: number; startCol: number; endCol: number }[] = [];
    const lastLine = Math.min(nav.endLine, m.getLineCount());
    for (let ln = nav.startLine; ln <= lastLine; ln++) {
      const text = m.getLineContent(ln);
      for (const item of nav.items) {
        let from = 0;
        for (;;) {
          const i = text.indexOf(item.text, from);
          if (i < 0) break;
          out.push({ item, line: ln, startCol: i + 1, endCol: i + 1 + item.text.length });
          from = i + item.text.length;
        }
      }
    }
    out.sort((a, b) => a.line - b.line || a.startCol - b.startCol);
    return out;
  };

  /** 选中第 idx 个剩余占位符（静默导航：只做选区与 Tab 跳空，无浮层提示） */
  const focusNav = (idx: number) => {
    const ranges = findNavRanges();
    if (!nav || ranges.length === 0) {
      endNav();
      return;
    }
    nav.idx = Math.min(idx, ranges.length - 1);
    const r = ranges[nav.idx];
    editor.setSelection(new monaco.Range(r.line, r.startCol, r.line, r.endCol));
  };

  /** 提示重算：按熟练度决定 立即/延迟/元提示/打码 */
  const recomputeWithFade = () => {
    if (nav) return; // 逐参数导航期间不弹新提示
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const position = editor.getPosition();
      const m = model();
      if (!position || !m) return clearAll();
      const settings = getSettings();
      const match = computeHint(m, position, settings);
      if (!match || match.candidates.length === 0) return clearAll();
      // 已完整写出的词不再提示（如光标停在写好的 for/print 后敲了个字符）
      if (match.candidates[0].entry.en.toLowerCase() === match.token.text.toLowerCase()) {
        return clearAll();
      }
      const mode = fadeModeFor(match.candidates[0].entry, settings.fading, stats);
      current = match;
      curLine = position.lineNumber;
      if (mode === 'delayed') {
        // 先静默，让学生先回忆
        decos = m.deltaDecorations(decos, []);
        onBarUpdate(null);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          // 时间到且光标没动地方 → 显示
          if (current === match) recomputeNow(match);
        }, 1900);
      } else {
        recomputeNow(match);
      }
    }, 120);
  };

  const recomputeNow = (match: MatchResult) => {
    const m = model();
    const position = editor.getPosition();
    if (!m || !position) return;
    const top = match.candidates[0];
    const settings = getSettings();
    const mode = fadeModeFor(top.entry, settings.fading, stats);
    const ln = position.lineNumber;
    if (mode === 'mastered' && match.channel === 'B' && !revealed) {
      const pos = editor.getScrolledVisiblePosition({ lineNumber: ln, column: match.token.endCol + 1 });
      const dom = editor.getDomNode();
      decos = m.deltaDecorations(decos, []);
      if (pos && dom) {
        const last = stats.lastUsedText(top.entry.id);
        onBarUpdate({
          kind: 'meta',
          text: `记得吗？${top.entry.en} · ${top.entry.en.length} 个字母${last ? ' · ' + last : ''}`,
          top: dom.offsetTop + pos.top + 22,
          left: dom.offsetLeft + pos.left,
        });
      }
      return;
    }
    const ghostText = mode === 'mastered' && !revealed ? maskedRender(top.entry) : renderInsert(top.entry);
    decos = m.deltaDecorations(decos, [
      {
        range: new monaco.Range(ln, match.token.startCol + 1, ln, match.token.endCol + 1),
        options: {
          after: { content: ` ${ghostText.split('\n')[0]}`, inlineClassName: 'xm-ghost' },
        },
      },
    ]);
    if (match.candidates.length > 1 && !(mode === 'mastered' && !revealed)) {
      const pos = editor.getScrolledVisiblePosition({ lineNumber: ln, column: match.token.endCol + 1 });
      const dom = editor.getDomNode();
      if (pos && dom) onBarUpdate({ kind: 'cands', match, top: dom.offsetTop + pos.top + 22, left: dom.offsetLeft + pos.left });
      else onBarUpdate(null);
    } else {
      onBarUpdate(null);
    }
  };

  const accept = (index: number) => {
    const st = current;
    const m = model();
    if (!st || !m) return;
    const c = st.candidates[index];
    if (!c) return;
    const ln = editor.getPosition()?.lineNumber ?? 1;
    const text = renderInsert(c.entry);
    decos = m.deltaDecorations(decos, []);
    m.pushEditOperations(
      [],
      [{ range: new monaco.Range(ln, st.token.startCol + 1, ln, st.token.endCol + 1), text }],
      () => null
    );
    stats.recordAccepted(c.entry.id);
    skipNextTyped = true;
    onBarUpdate(null);

    const phs = c.entry.placeholders ?? [];
    if (phs.length > 0) {
      // 进入逐参数导航
      nav = {
        startLine: ln,
        endLine: ln + (text.split('\n').length - 1),
        items: phs.map((p) => ({ text: p.hint, tip: p.tip })),
        idx: 0,
      };
      current = null;
      revealed = false;
      focusNav(0);
    } else {
      current = null;
      revealed = false;
      editor.setPosition({ lineNumber: ln, column: st.token.startCol + 1 + text.length });
    }
    editor.focus();
  };

  const reveal = () => {
    revealed = true;
    if (current) recomputeNow(current);
  };

  // ---------- 事件 ----------
  const d1 = editor.onDidChangeModelContent(() => {
    // 占位符被填掉一个后，重新定位剩余的
    if (nav) {
      const ranges = findNavRanges();
      if (ranges.length === 0) endNav();
      else {
        nav.items = ranges.map((r) => r.item);
        // 保持当前选中，选区由学生输入自然替换
      }
    }
    recomputeWithFade();
  });
  const d2 = editor.onDidChangeCursorPosition((e) => {
    if (nav) {
      const ranges = findNavRanges();
      const inside = ranges.some(
        (r) => e.position.lineNumber === r.line && e.position.column >= r.startCol && e.position.column <= r.endCol
      );
      if (!inside) endNav();
    }
    // 提示只在打字（内容变化）时出现：光标离开当前 token 范围就收起，纯移动不产生新提示
    if (current) {
      const ln = e.position.lineNumber;
      const col = e.position.column;
      const outside =
        ln !== curLine || col < current.token.startCol + 1 || col > current.token.endCol + 1;
      if (outside) clearAll();
    }
    // 默写检测：光标离开一个完整英文词
    const m = model();
    if (m && e.source !== 'mouse') {
      const word = m.getWordAtPosition(e.position)?.word ?? '';
      if (lastWord && lastWord !== word && /^[A-Za-z_]\w*$/.test(lastWord)) {
        if (!skipNextTyped) {
          const entry = builtinLexicon.byEn(lastWord);
          if (entry) {
            const r = stats.recordTyped(entry.id);
            if (r.mastered && onNotice) onNotice(`🎉 太棒了，你已经掌握 ${entry.en}！`);
          }
        } else {
          skipNextTyped = false;
        }
      }
      lastWord = word || null;
    }
  });
  const d4 = editor.onKeyDown((e) => {
    // 1) 逐参数导航优先
    if (nav) {
      const key = (e.browserEvent as KeyboardEvent).key;
      if (e.keyCode === monaco.KeyCode.Tab) {
        e.preventDefault();
        e.stopPropagation();
        const ranges = findNavRanges();
        if (nav.idx + 1 < ranges.length) focusNav(nav.idx + 1);
        else endNav(); // 最后一个空完成，结束导航
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endNav();
        return;
      }
      return; // 导航期间不处理其他提示按键
    }
    if (!current) return;
    const key = (e.browserEvent as KeyboardEvent).key;
    if (e.keyCode === monaco.KeyCode.Tab) {
      e.preventDefault();
      e.stopPropagation();
      accept(0);
    } else if (key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      clearAll();
    } else if (/^[1-5]$/.test(key)) {
      const idx = Number(key) - 1;
      if (idx < current.candidates.length) {
        e.preventDefault();
        e.stopPropagation();
        accept(idx);
      }
    }
  });

  return {
    accept,
    reveal,
    dispose() {
      d1.dispose();
      d2.dispose();
      d4.dispose();
      if (timer) clearTimeout(timer);
      const m = model();
      if (m) decos = m.deltaDecorations(decos, []);
    },
  };
}
