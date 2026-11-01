import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { builtinLexicon } from '@xm/lexicon';

// 调试钩子（自动化测试/诊断用）
if (typeof window !== 'undefined') {
  (window as any).__xm = { builtinLexicon };
}
import CandidateBar from './components/CandidateBar';
import ErrorCard from './components/ErrorCard';
import TurtleCanvas from './components/TurtleCanvas';
import { attachHints, registerHoverDocs, type BarState, type HintController, type HintSettings } from './editor/hints';
import monacoSetup, { THEMES } from './editor/monacoSetup';
import { fixPunctOutsideStrings } from './errors/punct';
import { translateError, type ErrAction, type TranslatedError } from './errors/translate';
import { XmSession, type KernelError, type StreamChunk, type TurtleOp } from './jupyter/session';

void monacoSetup; // 主题与 worker 已在导入时注册

type Phase = 'connecting' | 'ready' | 'failed';

const STARTER = `# 欢迎来到 Python 编程工具 🐍
# 试着把下面的代码改一改，然后点右上角的「运行」
print("你好，世界！")

# 打中文试试：删掉下面这行的井号，然后输入 输出 两个字
# 输出
`;

export default function App() {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [connectErr, setConnectErr] = useState('');
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [running, setRunning] = useState(false);
  const [kernelStatus, setKernelStatus] = useState('启动中…');
  const [outputs, setOutputs] = useState<StreamChunk[]>([]);
  const [errCard, setErrCard] = useState<TranslatedError | null>(null);
  const [turtlePending, setTurtlePending] = useState<TurtleOp[]>([]);
  const [turtleReset, setTurtleReset] = useState(0);
  const [hint, setHint] = useState<HintSettings>(() => ({
    enabled: true,
    maxLevel: 2,
    fading: localStorage.getItem('xm.fading') !== '0',
    tier: localStorage.getItem('xm.tier') === 'creative' ? 'creative' : 'basic',
  }));
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [bar, setBar] = useState<BarState | null>(null);
  const [pkgInput, setPkgInput] = useState('');
  const [pkgLog, setPkgLog] = useState<string[]>([]);
  const [pkgRunning, setPkgRunning] = useState(false);
  const [pkgStatus, setPkgStatus] = useState<'idle' | 'installing' | 'ok' | 'fail'>('idle');
  const [leftView, setLeftView] = useState<'files' | 'pkgs' | null>(() => {
    const v = localStorage.getItem('xm.leftView');
    return v === 'pkgs' || v === 'files' ? v : v === 'none' ? null : 'files';
  });
  const [installedPkgs, setInstalledPkgs] = useState<{ name: string; version: string }[]>([]);
  const [snapOpen, setSnapOpen] = useState(false);
  // 可拖拽分隔条：侧栏宽 / 控制台高（localStorage 记忆）
  const clampSideW = (w: number) => Math.min(480, Math.max(150, Math.round(w)));
  const clampConH = (h: number) => Math.min(Math.max(window.innerHeight - 280, 100), Math.max(90, Math.round(h)));
  const [sideW, setSideW] = useState(() => clampSideW(Number(localStorage.getItem('xm.sideW')) || 225));
  const [conH, setConH] = useState(() => clampConH(Number(localStorage.getItem('xm.conH')) || 218));
  const sideWRef = useRef(sideW);
  const conHRef = useRef(conH);
  sideWRef.current = sideW;
  conHRef.current = conH;

  const startSplitDrag = (dir: 'x' | 'y', base: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const start = dir === 'x' ? e.clientX : e.clientY;
    document.body.classList.add(dir === 'x' ? 'xm-resizing-x' : 'xm-resizing-y');
    const move = (ev: PointerEvent) => {
      const delta = (dir === 'x' ? ev.clientX : ev.clientY) - start;
      if (dir === 'x') {
        const w = clampSideW(base + delta);
        setSideW(w);
        localStorage.setItem('xm.sideW', String(w));
      } else {
        // VS Code 语义：往上拖 = 控制台变大（编辑区让位），往下拖 = 变小
        const h = clampConH(base - delta);
        setConH(h);
        localStorage.setItem('xm.conH', String(h));
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('xm-resizing-x');
      document.body.classList.remove('xm-resizing-y');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const resetSplits = () => {
    setSideW(225);
    setConH(218);
    localStorage.setItem('xm.sideW', '225');
    localStorage.setItem('xm.conH', '218');
    showToast('布局已复位（双击分隔条即可复位）');
  };
  const [snapFiles, setSnapFiles] = useState<{ name: string; path: string }[]>([]);
  const [toast, setToast] = useState('');
  const [stdinPrompt, setStdinPrompt] = useState<string | null>(null);
  const [stdinValue, setStdinValue] = useState('');
  const stdinInputRef = useRef<HTMLInputElement | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const consoleBodyRef = useRef<HTMLDivElement | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [wordWrap, setWordWrap] = useState(false);
  const [theme, setTheme] = useState(() => {
    const v = localStorage.getItem('xm.theme') ?? '';
    return THEMES.some((t) => t.id === v) ? v : 'xm-light';
  });
  const [helpModal, setHelpModal] = useState<'keys' | 'about' | null>(null);
  const [dialog, setDialog] = useState<{
    kind: 'prompt' | 'confirm';
    title: string;
    label?: string;
    def?: string;
    resolve: (v: any) => void;
  } | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const dialogRef = useRef<HTMLInputElement | null>(null);
  const localFileRef = useRef<HTMLInputElement | null>(null);
  const saveNowRef = useRef<() => void>(() => {});

  /** 桌面化对话框：替代浏览器 prompt/confirm（无网址栏） */
  const appPrompt = (title: string, def = '') =>
    new Promise<string | null>((resolve) => {
      setDialogValue(def);
      setDialog({ kind: 'prompt', title, def, resolve });
      setTimeout(() => dialogRef.current?.focus(), 50);
    });
  const appConfirm = (title: string, label = '') =>
    new Promise<boolean>((resolve) => {
      setDialog({ kind: 'confirm', title, label, resolve });
    });
  const closeDialog = (val: string | null | boolean) => {
    dialog?.resolve(val);
    setDialog(null);
  };

  const sessionRef = useRef<XmSession | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const hintsCtlRef = useRef<HintController | null>(null);
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map());
  const hintRef = useRef(hint);
  const opsBufRef = useRef<TurtleOp[]>([]);
  const opsFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef('');

  hintRef.current = hint;
  currentPathRef.current = currentPath;

  // 控制台新内容自动贴底（终端行为）
  useEffect(() => {
    const el = consoleBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputs, stdinPrompt, stdinValue]);

  // 查看菜单：字号 / 自动换行 / 主题
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
  }, [wordWrap]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    monaco.editor.setTheme(theme);
  }, [theme]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const flushTurtleOps = () => {
    if (opsBufRef.current.length === 0) return;
    const ops = opsBufRef.current;
    opsBufRef.current = [];
    setTurtlePending(ops);
    setCanvasOpen(true); // 有绘图指令 → 自动弹出画布
  };

  // ---------- 启动 ----------
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const session = new XmSession();
        session.onTurtleOp = (op) => {
          const w = window as any;
          w.__xmOps = (w.__xmOps ?? 0) + 1;
          w.__xmLastOp = op;
          opsBufRef.current.push(op);

          if (!opsFlushTimer.current) {
            opsFlushTimer.current = setTimeout(() => {
              opsFlushTimer.current = null;
              flushTurtleOps();
            }, 60);
          }
        };
        session.onStatus = (s) => setKernelStatus(s === 'idle' ? '空闲' : s === 'busy' ? '运行中' : s);
        await session.start();
        if (disposed) return;
        // 页面关闭时释放内核进程，避免泄漏
        window.addEventListener('beforeunload', () => {
          void session.kernel?.shutdown();
        });
        sessionRef.current = session;
        (window as any).__xmSession = session;
        // 诊断：原始 comm 消息探针
        (window as any).__xmRawComms = 0;
        session.kernel?.anyMessage.connect((_: any, info: any) => {
          const t = info?.msg?.header?.msg_type;
          if (t === 'comm_open' || t === 'comm_msg') {
            const w = window as any;
            w.__xmRawComms++;
            w.__xmLastRaw = t + ' ' + String(JSON.stringify(info?.msg?.content?.data ?? '')).slice(0, 90);
          }
        });
        let list = await session.listPyFiles();
        if (list.length === 0) {
          await session.save('main.py', STARTER);
          list = await session.listPyFiles();
        }
        setFiles(list);
        setPhase('ready');
      } catch (e: any) {
        if (!disposed) {
          setConnectErr(String(e?.message ?? e));
          setPhase('failed');
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  // ---------- 编辑器（phase ready 后创建一次） ----------
  const openFile = useCallback(async (path: string) => {
    const session = sessionRef.current;
    const editor = editorRef.current;
    if (!session || !editor) return;
    let model = modelsRef.current.get(path);
    if (!model) {
      const content = await session.read(path);
      model = monaco.editor.createModel(content || '', 'python', monaco.Uri.parse('inmemory://xm/' + path));
      model.onDidChangeContent(() => {
        setSaveState('dirty');
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          setSaveState('saving');
          try {
            await session.save(path, model!.getValue());
            setSaveState('saved');
          } catch {
            setSaveState('dirty');
          }
        }, 900);
      });
      modelsRef.current.set(path, model);
    }
    editor.setModel(model);
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    const editor = monaco.editor.create(document.getElementById('xm-editor')!, {
      theme: 'xm-light',
      language: 'python',
      automaticLayout: true,
      fontSize: 18,
      fontFamily: '"Cascadia Code", Consolas, "Microsoft YaHei", monospace',
      minimap: { enabled: false },
      lineNumbers: (n) => String(n),
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 14 },
      tabSize: 4,
      scrollBeyondLastLine: false,
      wordBasedSuggestions: 'off',
      occurrencesHighlight: 'off',
      quickSuggestions: false,
      bracketPairColorization: { enabled: true },
      guides: { indentation: true },
      inlineSuggest: { enabled: true },
      suggest: { showWords: false },
    });
    editorRef.current = editor;
    (window as any).__xmEditor = editor;

    registerHoverDocs(monaco);
    hintsCtlRef.current = attachHints(monaco, editor, () => hintRef.current, setBar, (msg) => showToast(msg));
    (window as any).__xmHints = hintsCtlRef.current;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void runCode(false));
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => void runCode(true));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveNowRef.current());

    void openFile(files[0]?.path ?? 'main.py');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- 运行 ----------
  const appendChunk = (c: StreamChunk) => {
    setOutputs((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.kind === c.kind && c.text !== undefined && last.text !== undefined) {
        return [...prev.slice(0, -1), { ...last, text: last.text + c.text }];
      }
      return [...prev, c];
    });
  };

  const runningRef = useRef(false);
  const runCode = useCallback(
    async (selectionOnly: boolean) => {
      const session = sessionRef.current;
      const editor = editorRef.current;
      if (!session || !editor || runningRef.current) return;
      const model = editor.getModel();
      if (!model) return;
      let code = model.getValue();
      if (selectionOnly) {
        const sel = editor.getSelection();
        const selText = sel ? model.getValueInRange(sel) : '';
        if (selText.trim().length > 0) code = selText;
      }
      setOutputs([]);
      setErrCard(null);
      runningRef.current = true;
      setRunning(true);
      setStdinPrompt(null);
      setStdinValue('');
      await session.snapshot(currentPathRef.current || 'main.py', model.getValue());
      try {
        await session.execute(code, {
          onChunk: appendChunk,
          onError: (e: KernelError) => {
            setErrCard(translateError(e));
            setOutputs((prev) => [...prev, { kind: 'err', text: `${e.ename}: ${e.evalue}\n` }]);
          },
          onStdin: (prompt) => {
            setStdinPrompt(prompt);
            setStdinValue('');
            setTimeout(() => stdinInputRef.current?.focus(), 50);
          },
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/dead|restart/i.test(msg)) {
          setOutputs((prev) => [...prev, { kind: 'out', text: 'Python 引擎重新启动中…\n' }]);
          try {
            await session.restart();
            setTurtleReset((n) => n + 1);
            showToast('引擎已重启，请再点一次运行');
          } catch {
            setOutputs((prev) => [...prev, { kind: 'err', text: `引擎重启失败，请关闭页面重开\n` }]);
          }
        } else {
          setOutputs((prev) => [...prev, { kind: 'err', text: `运行中断：${msg}\n` }]);
        }
      } finally {
        runningRef.current = false;
        setRunning(false);
        setStdinPrompt(null);
      }
    },
    []
  );

  const stopRun = async () => {
    await sessionRef.current?.interrupt();
    setStdinPrompt(null);
  };

  const restartKernel = async () => {
    await sessionRef.current?.restart();
    setTurtleReset((n) => n + 1);
    setOutputs([{ kind: 'out', text: '内核已重启，变量清空了。\n' }]);
    setErrCard(null);
    setStdinPrompt(null);
  };

  /** 提交 input() 输入 */
  const submitStdin = () => {
    const v = stdinValue;
    sessionRef.current?.sendInputReply(v);
    setOutputs((prev) => [...prev, { kind: 'out', text: `${stdinPrompt ?? ''}${v}\n` }]);
    setStdinPrompt(null);
    setStdinValue('');
  };

  // ---------- 菜单栏动作 ----------
  const trig = (id: string) => editorRef.current?.trigger('menu', id, null);

  const saveNow = async () => {
    const s = sessionRef.current;
    const model = editorRef.current?.getModel();
    if (!s || !model || !currentPathRef.current) return;
    try {
      await s.save(currentPathRef.current, model.getValue());
      setSaveState('saved');
      showToast('已保存');
    } catch {
      showToast('保存失败，请稍后再试');
    }
  };
  saveNowRef.current = () => void saveNow();

  const renameCurrent = async () => {
    const s = sessionRef.current;
    if (!s || !currentPath) return;
    const oldName = currentPath.replace(/\.py$/, '');
    const name = await appPrompt('重命名文件（不用加 .py）', oldName);
    if (!name || name === oldName) return;
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(name)) {
      showToast('名字里只能用中文、英文、数字、下划线');
      return;
    }
    const newPath = `${name}.py`;
    try {
      await s.renameFile(currentPath, newPath);
      const model = modelsRef.current.get(currentPath);
      if (model) {
        modelsRef.current.delete(currentPath);
        modelsRef.current.set(newPath, model);
      }
      await refreshFiles();
      setCurrentPath(newPath);
      showToast(`已重命名为 ${newPath}`);
    } catch {
      showToast('重命名失败');
    }
  };

  const deleteCurrent = async () => {
    const s = sessionRef.current;
    if (!s || !currentPath) return;
    if (!(await appConfirm(`删除 ${currentPath}？`, '删除后不可恢复，运行前的快照也会一起删掉。'))) return;
    try {
      await s.deleteFile(currentPath);
      modelsRef.current.delete(currentPath);
      await refreshFiles();
      const rest = await s.listPyFiles();
      if (rest.length > 0) await openFile(rest[0].path);
      else {
        await s.save('main.py', STARTER);
        await refreshFiles();
        await openFile('main.py');
      }
      showToast(`已删除 ${currentPath}`);
    } catch {
      showToast('删除失败');
    }
  };

  /** 桌面化：文件本来就在本机，直接在资源管理器中打开工作区 */
  const openWorkspaceFolder = async () => {
    try {
      const r = await fetch('/xm/open-workspace');
      if (!r.ok) throw new Error();
    } catch {
      showToast('打开文件夹失败');
    }
  };

  const openLocalPy = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.endsWith('.py') ? file.name : `${file.name}.py`;
    const reader = new FileReader();
    reader.onload = async () => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        await s.save(name, String(reader.result ?? ''));
        await refreshFiles();
        await openFile(name);
        showToast(`已打开 ${name}`);
      } catch {
        showToast('打开失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) editorRef.current?.trigger('menu', 'type', { text });
    } catch {
      showToast('浏览器未允许读取剪贴板，请直接按 Ctrl+V');
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  // ---------- 报错修复动作 ----------
  const applyFix = (a: ErrAction) => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    if (a.kind === 'replace_ident' && a.from && a.to) {
      const matches = model.findMatches(a.from, false, false, true, null, false);
      const whole = matches.filter((m) => {
        const before = model.getValueInRange({
          startLineNumber: m.range.startLineNumber,
          startColumn: m.range.startColumn - 1,
          endLineNumber: m.range.startLineNumber,
          endColumn: m.range.startColumn,
        });
        const after = model.getValueInRange({
          startLineNumber: m.range.endLineNumber,
          startColumn: m.range.endColumn,
          endLineNumber: m.range.endLineNumber,
          endColumn: m.range.endColumn + 1,
        });
        return !/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after);
      });
      if (whole.length === 0) {
        showToast(`没找到「${a.from}」，可能已经改过了`);
        return;
      }
      model.pushEditOperations(
        [],
        whole.map((m) => ({ range: m.range, text: a.to! })),
        () => null
      );
      showToast(`已替换 ${whole.length} 处：${a.from} → ${a.to}`);
      setErrCard(null);
    } else if (a.kind === 'fix_punct') {
      const r = fixPunctOutsideStrings(model.getValue());
      if (r.count === 0) {
        showToast('代码区没发现中文标点（字符串里的中文标点不算）');
        return;
      }
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: r.newCode }],
        () => null
      );
      showToast(`已修复 ${r.count} 处中文标点`);
      setErrCard(null);
    } else if (a.kind === 'install_pkg' && a.pkg) {
      switchView('pkgs');
      setPkgInput(a.pkg);
    }
  };

  // ---------- 文件操作 ----------
  const refreshFiles = async () => {
    const s = sessionRef.current;
    if (!s) return;
    setFiles(await s.listPyFiles());
    try {
      setSnapFiles(await s.listSnapshots());
    } catch {
      /* 快照列表失败不影响 */
    }
  };

  const newFile = async () => {
    const s = sessionRef.current;
    if (!s) return;
    const name = await appPrompt('新文件叫什么名字？（不用加 .py）');
    if (!name) return;
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(name)) {
      showToast('名字里只能用中文、英文、数字、下划线');
      return;
    }
    const path = `${name}.py`;
    if (files.some((f) => f.path === path)) {
      showToast('已经有同名文件啦');
      return;
    }
    await s.save(path, `# ${name}\n`);
    await refreshFiles();
    await openFile(path);
  };




  /** 活动栏切视图（VS Code 式：点同图标折叠/展开，状态记忆） */
  const switchView = (v: 'files' | 'pkgs') => {
    const next = leftView === v ? null : v;
    setLeftView(next);
    localStorage.setItem('xm.leftView', next ?? 'none');
    if (next === 'pkgs' && installedPkgs.length === 0) void refreshInstalled();
  };

  /** 解析 pip list → 已安装库 */
  const refreshInstalled = async () => {
    const s = sessionRef.current;
    if (!s) return;
    let text = '';
    await s.execute('%pip list', {
      onChunk: (ch) => {
        text += ch.text ?? '';
      },
      onError: () => {},
    });
    const rows = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('-') && !l.toLowerCase().startsWith('package'))
      .map((l) => {
        const [name, version] = l.split(/\s+/);
        return { name: name ?? '', version: version ?? '' };
      })
      .filter((r) => /^[A-Za-z0-9_.\-]+$/.test(r.name));
    setInstalledPkgs(rows.sort((a, b) => a.name.localeCompare(b.name)));
  };

  /** 常用库一键安装建议 */
  const PKG_SUGGEST = ['pillow', 'requests', 'wordcloud', 'jieba', 'numpy', 'matplotlib', 'pandas', 'pygame'];

  /** 装库：过程与结论写进控制台（底部），装完自动验证 import 并刷新已装列表 */
  const installPkg = async (rawName?: string) => {
    const s = sessionRef.current;
    if (!s || pkgStatus === 'installing') return;
    const name = (rawName ?? pkgInput).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_\-.]*$/.test(name)) {
      setPkgStatus('fail');
      setOutputs([{ kind: 'err', text: `装库失败：名字「${name}」看起来不对。只能用英文字母、数字、- _ . ，并且以字母或数字开头。\n` }]);
      return;
    }
    const pyName = name.split(/[=<>~!\[;]/)[0];
    setPkgStatus('installing');
    setOutputs([{ kind: 'out', text: `$ pip install ${name}\n` }]);
    try {
      const mirror = localStorage.getItem('xm.pipIndex') ?? '';
      await s.execute(`%pip install ${name}${mirror ? ` -i ${mirror}` : ''}`, {
        onChunk: (ch) => {
          const t = (ch.text ?? '').replace(/\s+$/, '');
          if (t) setOutputs((prev) => [...prev, { kind: 'out', text: t + '\n' }]);
        },
        onError: (e) => setOutputs((prev) => [...prev, { kind: 'err', text: `${e.ename}: ${e.evalue}\n` }]),
      });
      let importOk = true;
      await s.execute(`import ${pyName}`, {
        onChunk: () => {},
        onError: () => {
          importOk = false;
        },
      });
      setOutputs((prev) => [
        ...prev,
        {
          kind: importOk ? 'result' : 'err',
          text: importOk
            ? `✅ ${name} 安装完成 · import ${pyName} 验证通过，可以用啦
`
            : `⚠ ${name} 安装完成，但 import ${pyName} 没成功（有的库导入名和安装名不同，比如 opencv-python 要 import cv2）
`,
        },
      ]);
      setPkgStatus('ok');
      void refreshInstalled();
    } catch {
      setOutputs((prev) => [...prev, { kind: 'err', text: `❌ ${name} 安装中断。常见原因：名字拼错、网络不通。
` }]);
      setPkgStatus('fail');
    } finally {
      setPkgRunning(false);
    }
  };

  // ---------- 渲染 ----------
  if (phase !== 'ready') {
    return (
      <div className="boot">
        <div className="boot-logo">🐍</div>
        <div className="boot-title">Python 编程工具</div>
        <div className="boot-msg">
          {phase === 'connecting' ? '正在启动 Python 引擎…' : `启动失败：${connectErr}`}
        </div>
        {phase === 'failed' && <button onClick={() => location.reload()}>重试</button>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" title="Python 编程工具">
          <img src="/icon.svg" alt="Python 编程工具" className="brand-icon" />
        </div>

        <nav className="menubar" aria-label="菜单栏">
          {openMenu && <div className="menu-backdrop" onClick={() => setOpenMenu(null)} />}
          {/* 文件 */}
          <div className="menu-wrap">
            <button className={`menu-title ${openMenu === 'file' ? 'active' : ''}`} onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}>
              文件
            </button>
            {openMenu === 'file' && (
              <div className="menu-drop">
                <button className="menu-item" onClick={() => { setOpenMenu(null); void newFile(); }}>
                  <span>新建文件</span><span className="menu-key">—</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); void saveNow(); }}>
                  <span>保存</span><span className="menu-key">Ctrl+S</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); void renameCurrent(); }}>
                  <span>重命名…</span><span className="menu-key">—</span>
                </button>
                <button className="menu-item danger" onClick={() => { setOpenMenu(null); void deleteCurrent(); }}>
                  <span>删除文件…</span><span className="menu-key">—</span>
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setOpenMenu(null); localFileRef.current?.click(); }}>
                  <span>打开本地 .py 文件…</span><span className="menu-key">—</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); void openWorkspaceFolder(); }}>
                  <span>在文件夹中查看全部文件</span><span className="menu-key">—</span>
                </button>
              </div>
            )}
          </div>
          {/* 编辑 */}
          <div className="menu-wrap">
            <button className={`menu-title ${openMenu === 'edit' ? 'active' : ''}`} onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}>
              编辑
            </button>
            {openMenu === 'edit' && (
              <div className="menu-drop">
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('undo'); }}>
                  <span>撤销</span><span className="menu-key">Ctrl+Z</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('redo'); }}>
                  <span>重做</span><span className="menu-key">Ctrl+Y</span>
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('cut'); }}>
                  <span>剪切</span><span className="menu-key">Ctrl+X</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('copy'); }}>
                  <span>复制</span><span className="menu-key">Ctrl+C</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); void pasteFromClipboard(); }}>
                  <span>粘贴</span><span className="menu-key">Ctrl+V</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.selectAll'); }}>
                  <span>全选</span><span className="menu-key">Ctrl+A</span>
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('actions.find'); }}>
                  <span>查找</span><span className="menu-key">Ctrl+F</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.startFindReplaceAction'); }}>
                  <span>替换</span><span className="menu-key">Ctrl+H</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.commentLine'); }}>
                  <span>注释 / 取消注释</span><span className="menu-key">Ctrl+/</span>
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.moveLinesUpAction'); }}>
                  <span>上移一行</span><span className="menu-key">Alt+↑</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.moveLinesDownAction'); }}>
                  <span>下移一行</span><span className="menu-key">Alt+↓</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.deleteLines'); }}>
                  <span>删除当前行</span><span className="menu-key">—</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); trig('editor.action.gotoLine'); }}>
                  <span>转到行…</span><span className="menu-key">Ctrl+G</span>
                </button>
              </div>
            )}
          </div>
          {/* 查看 */}
          <div className="menu-wrap">
            <button className={`menu-title ${openMenu === 'view' ? 'active' : ''}`} onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}>
              查看
            </button>
            {openMenu === 'view' && (
              <div className="menu-drop">
                <button className="menu-item" onClick={() => setFontSize((f) => Math.min(30, f + 1))}>
                  <span>放大字体</span><span className="menu-key">{fontSize}px→</span>
                </button>
                <button className="menu-item" onClick={() => setFontSize((f) => Math.max(12, f - 1))}>
                  <span>缩小字体</span><span className="menu-key">→{fontSize}px</span>
                </button>
                <button className="menu-item" onClick={() => setFontSize(18)}>
                  <span>重置字号（18px）</span><span className="menu-key">—</span>
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => setWordWrap((w) => !w)}>
                  <span>自动换行 {wordWrap ? '✓' : ''}</span><span className="menu-key">—</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); toggleFullscreen(); }}>
                  <span>全屏</span><span className="menu-key">F11</span>
                </button>
              </div>
            )}
          </div>
          {/* 帮助 */}
          <div className="menu-wrap">
            <button className={`menu-title ${openMenu === 'help' ? 'active' : ''}`} onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}>
              帮助
            </button>
            {openMenu === 'help' && (
              <div className="menu-drop">
                <button className="menu-item" onClick={() => { setOpenMenu(null); setHelpModal('keys'); }}>
                  <span>键盘快捷键</span><span className="menu-key">—</span>
                </button>
                <button className="menu-item" onClick={() => { setOpenMenu(null); setHelpModal('about'); }}>
                  <span>关于 Python 编程工具</span><span className="menu-key">—</span>
                </button>
              </div>
            )}
          </div>
                  </nav>

        <div className="spacer" />
        <span className="file-name-display" title={currentPath}>
          📄 {currentPath || 'main.py'}
        </span>
        <span className={`save-state ${saveState}`}>
          {saveState === 'saved' ? '✓ 已保存' : saveState === 'saving' ? '… 保存中' : '● 未保存'}
        </span>
        <button className="btn run" disabled={running} onClick={() => void runCode(false)} title="Ctrl+Enter">
          ▶ 运行
        </button>
        <button className="btn" disabled={running} onClick={() => void runCode(true)} title="Shift+Enter">
          ⇥ 运行选中
        </button>
        <button className="btn stop" disabled={!running} onClick={() => void stopRun()}>
          ■ 停止
        </button>
        <button className="btn" onClick={() => void restartKernel()} title="变量清空、画布清空">
          🔄 重新开始
        </button>
        <div className="gear-wrap">
          <button
            className={`gear-btn ${gearOpen ? 'active' : ''} ${hint.enabled ? '' : 'dot'}`}
            title="设置"
            onClick={() => setGearOpen((o) => !o)}
          >
            ⚙
          </button>
          {gearOpen && (
            <>
              <div className="gear-backdrop" onClick={() => setGearOpen(false)} />
              <div className="gear-menu">
                <div className="gear-row">
                  <span className="gear-label">提示</span>
                  <button
                    className={`gear-switch ${hint.enabled ? 'on' : 'off'}`}
                    onClick={() => setHint((h) => ({ ...h, enabled: !h.enabled }))}
                  >
                    {hint.enabled ? '开' : '关（练习模式）'}
                  </button>
                </div>
                {hint.enabled && (
                  <>
                    <div className="gear-row">
                      <span className="gear-label" title="基础语法档：只提示 GESP 等级考试范围；创新档：包含 turtle/random 等开放库">
                        档位
                      </span>
                      <div className="gear-seg">
                        <button
                          className={hint.tier === 'basic' ? 'sel' : ''}
                          onClick={() => {
                            localStorage.setItem('xm.tier', 'basic');
                            setHint((h) => ({ ...h, tier: 'basic' }));
                          }}
                        >
                          基础语法
                        </button>
                        <button
                          className={hint.tier === 'creative' ? 'sel' : ''}
                          onClick={() => {
                            localStorage.setItem('xm.tier', 'creative');
                            setHint((h) => ({ ...h, tier: 'creative' }));
                          }}
                        >
                          创新
                        </button>
                      </div>
                    </div>
                    <div className="gear-row">
                      <span className="gear-label">级别</span>
                      <div className="gear-seg">
                        <button
                          className={hint.maxLevel === 2 ? 'sel' : ''}
                          onClick={() => setHint((h) => ({ ...h, maxLevel: 2 }))}
                        >
                          词＋句式
                        </button>
                        <button
                          className={hint.maxLevel === 1 ? 'sel' : ''}
                          onClick={() => setHint((h) => ({ ...h, maxLevel: 1 }))}
                        >
                          只要词
                        </button>
                      </div>
                    </div>
                    <div className="gear-row">
                      <span className="gear-label" title="用得熟的词提示会逐渐变少，帮你记住它">
                        记忆渐退
                      </span>
                      <button
                        className={`gear-switch ${hint.fading ? 'on' : 'off'}`}
                        onClick={() => {
                          const v = !hint.fading;
                          localStorage.setItem('xm.fading', v ? '1' : '0');
                          setHint((h) => ({ ...h, fading: v }));
                        }}
                      >
                        {hint.fading ? '开' : '关'}
                      </button>
                    </div>
                  </>
                )}
                <div className="gear-row gear-row-theme">
                  <span className="gear-label" title="编辑器配色，按自己的眼睛舒服来选">
                    主题
                  </span>
                  <div className="theme-grid">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        className={`theme-btn ${theme === t.id ? 'sel' : ''}`}
                        title={t.label}
                        onClick={() => {
                          localStorage.setItem('xm.theme', t.id);
                          setTheme(t.id);
                        }}
                      >
                        <span className="theme-dot" style={{ background: t.dot }} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <input ref={localFileRef} type="file" accept=".py,text/x-python" style={{ display: 'none' }} onChange={openLocalPy} />

      {/* 帮助弹窗 */}
      {helpModal && (
        <div className="modal-overlay" onClick={() => setHelpModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {helpModal === 'keys' ? (
              <>
                <div className="modal-title">键盘快捷键</div>
                <table className="keys-table">
                  <tbody>
                    <tr><td>Ctrl+Enter</td><td>运行整个文件</td></tr>
                    <tr><td>Shift+Enter</td><td>运行选中的行</td></tr>
                    <tr><td>Ctrl+S</td><td>保存</td></tr>
                    <tr><td>Tab / 数字键</td><td>采纳提示 / 选候选</td></tr>
                    <tr><td>Ctrl+Z / Ctrl+Y</td><td>撤销 / 重做</td></tr>
                    <tr><td>Ctrl+F / Ctrl+H</td><td>查找 / 替换</td></tr>
                    <tr><td>Ctrl+/</td><td>注释 / 取消注释</td></tr>
                    <tr><td>Alt+↑ / Alt+↓</td><td>移动当前行</td></tr>
                    <tr><td>Ctrl+G</td><td>转到指定行</td></tr>
                  </tbody>
                </table>
              </>
            ) : (
              <>
                <div className="modal-title">关于</div>
                <div className="about-text">
                  <p><b>Python 编程工具</b> v0.1</p>
                  <p>面向中小学生的 Python 学习工具：中文提示、报错翻译、一键装库。</p>
                  <p>提示不代写 · 数据全部保存在本机。</p>
                </div>
              </>
            )}
            <button className="btn" onClick={() => setHelpModal(null)}>关闭</button>
          </div>
        </div>
      )}

      {/* 应用内对话框（桌面化：无浏览器网址栏） */}
      {dialog && (
        <div className="modal-overlay" onClick={() => closeDialog(dialog.kind === 'prompt' ? null : false)}>
          <div className="modal-box dialog-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{dialog.title}</div>
            {dialog.kind === 'confirm' && dialog.label && <div className="dialog-label">{dialog.label}</div>}
            {dialog.kind === 'prompt' && (
              <input
                ref={dialogRef}
                className="dialog-input"
                value={dialogValue}
                onChange={(e) => setDialogValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closeDialog(dialogValue.trim());
                  if (e.key === 'Escape') closeDialog(null);
                  e.stopPropagation();
                }}
              />
            )}
            <div className="dialog-actions">
              <button className="btn" onClick={() => closeDialog(dialog.kind === 'prompt' ? null : false)}>
                取消
              </button>
              <button
                className="btn run"
                onClick={() => closeDialog(dialog.kind === 'prompt' ? dialogValue.trim() : true)}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="body">
      <nav className="activity-bar" aria-label="侧栏切换">
        <button
          className={`act-icon ${leftView === 'files' ? 'active' : ''}`}
          title="资源管理器"
          onClick={() => switchView('files')}
        >
          📁
        </button>
        <button
          className={`act-icon ${leftView === 'pkgs' ? 'active' : ''}`}
          title="已安装的库 / 安装新库"
          onClick={() => switchView('pkgs')}
        >
          📦
        </button>
      </nav>
      <div className="body-col" style={{ gridTemplateRows: `1fr 5px ${conH}px` }}>
      <div
        className={`main ${leftView ? '' : 'no-left'}`}
        style={leftView ? { gridTemplateColumns: `${sideW}px 5px 1fr` } : undefined}
      >
        <aside className="left explorer">
          {leftView === 'files' && (
          <>
          <div className="exp-head">
            <span className="exp-title">资源管理器</span>
            <span className="exp-tools">
              <button className="mini-btn" title="新建文件" onClick={() => void newFile()}>＋</button>
              <button className="mini-btn" title="刷新" onClick={() => void refreshFiles()}>⟳</button>
            </span>
          </div>
          <div className="left-body">
            <div className="exp-group-title">文件</div>
            <ul className="file-list">
              {files.map((f) => (
                <li
                  key={f.path}
                  className={f.path === currentPath ? 'active' : ''}
                  onClick={() => void openFile(f.path)}
                  title={f.name}
                >
                  📄 {f.name}
                </li>
              ))}
            </ul>
            {snapFiles.length > 0 && (
              <>
                <div className="exp-group-title clickable" onClick={() => setSnapOpen((s) => !s)}>
                  <span>{snapOpen ? '▾' : '▸'} 运行前快照（{snapFiles.length}）</span>
                </div>
                {snapOpen && (
                  <ul className="file-list snap-list">
                    {snapFiles.slice(0, 20).map((f) => (
                      <li key={f.path} onClick={() => void openFile(f.path)} title={f.name}>
                        🕘 {f.name.replace(/^snapshot-/, '').replace(/\.py$/, '')}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          </>
          )}
          {leftView === 'pkgs' && (
            <div className="lib-panel">
              <div className="exp-head">
                <span className="exp-title">库</span>
                <span className="exp-tools">
                  <button className="mini-btn" title="刷新已安装列表" onClick={() => void refreshInstalled()}>⟳</button>
                </span>
              </div>
              <div className="lib-body">
                <div className="pkg-row">
                  <input
                    value={pkgInput}
                    placeholder="库的名字，比如 pillow"
                    onChange={(e) => setPkgInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void installPkg();
                      e.stopPropagation();
                    }}
                  />
                  <button className="btn run" disabled={pkgStatus === 'installing'} onClick={() => void installPkg()}>
                    {pkgStatus === 'installing' ? '安装中…' : '⬇ 安装'}
                  </button>
                </div>
                <div className="pkg-chips">
                  {PKG_SUGGEST.map((p) => (
                    <button key={p} className="pkg-chip" disabled={pkgStatus === 'installing'} onClick={() => { setPkgInput(p); void installPkg(p); }}>
                      {p}
                    </button>
                  ))}
                </div>
                {pkgStatus === 'installing' && <div className="lib-note">正在安装，过程和结果见下方控制台…</div>}
                <div className="exp-group-title">已安装（{installedPkgs.length}）</div>
                <ul className="lib-list">
                  {installedPkgs.map((p) => (
                    <li key={p.name} title={p.name}>
                      <span className="lib-name">{p.name}</span>
                      <span className="lib-ver">{p.version}</span>
                    </li>
                  ))}
                  {installedPkgs.length === 0 && <li className="lib-empty">点右上 ⟳ 加载已安装列表</li>}
                </ul>
              </div>
            </div>
          )}
        </aside>

        {leftView && (
          <div
            className="v-split"
            title="拖动调整宽度，双击复位"
            onPointerDown={startSplitDrag('x', sideW)}
            onDoubleClick={resetSplits}
          />
        )}

        <section className="center">
          <div id="xm-editor" />
          <CandidateBar
            state={bar}
            onPick={(i) => hintsCtlRef.current?.accept(i)}
            onReveal={() => hintsCtlRef.current?.reveal()}
          />
        </section>
      </div>


      <div
        className="h-split"
        title="拖动调整高度，双击复位"
        onPointerDown={startSplitDrag('y', conH)}
        onDoubleClick={resetSplits}
      />

      {/* 控制台：界面底部全宽 */}
      <section className="console-pane">
        <div className="pane-head">🖥 控制台</div>
        <div className="console-body" ref={consoleBodyRef}>
          {outputs.length === 0 && !stdinPrompt && <div className="console-empty">点「▶ 运行」看看结果～</div>}
          {outputs.map((o, i) =>
            o.kind === 'image' ? (
              <img key={i} src={`data:image/png;base64,${o.imageB64}`} alt="图表" />
            ) : (
              <pre key={i} className={o.kind === 'err' ? 'text-err' : o.kind === 'result' ? 'text-result' : ''}>
                {o.text}
              </pre>
            )
          )}
          {stdinPrompt !== null && (
            <div className="stdin-line" onClick={() => stdinInputRef.current?.focus()}>
              <span className="stdin-inline-prompt">{stdinPrompt}</span>
              <input
                ref={stdinInputRef}
                className="stdin-inline-input"
                style={{ width: `${Math.max(stdinValue.length, 1)}ch` }}
                value={stdinValue}
                onChange={(e) => setStdinValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitStdin();
                  e.stopPropagation();
                }}
              />
              <span className="stdin-cursor" aria-hidden="true" />
            </div>
          )}
          {errCard && <ErrorCard err={errCard} onAction={applyFix} onDismiss={() => setErrCard(null)} />}
        </div>
      </section>
      </div>
      </div>

      {/* 海龟画布：绘图时自动弹出的浮窗（常驻挂载保留画面，隐藏而非销毁） */}
      <div className={`canvas-window ${canvasOpen ? '' : 'hidden'}`}>
        <div className="canvas-titlebar">
          <span className="canvas-title">🎨 海龟画布</span>
          <span className="canvas-actions">
            <button className="mini-btn" onClick={() => setTurtleReset((n) => n + 1)}>
              清空
            </button>
            <button className="mini-btn canvas-close" onClick={() => setCanvasOpen(false)}>
              ×
            </button>
          </span>
        </div>
        <TurtleCanvas pendingOps={turtlePending} resetSeq={turtleReset} />
      </div>

      <footer className="statusbar">
        <span>{running ? '⏳ 程序运行中' : kernelStatus === '空闲' ? '💤 就绪' : `内核：${kernelStatus}`}</span>
        <span className="statusbar-right">
          打「输出」「循环」或拼音 shuchu 试试提示 · Tab 采纳 · 数字键选候选
        </span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
