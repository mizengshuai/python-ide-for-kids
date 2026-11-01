import { builtinLexicon } from '@xm/lexicon';
import type { Entry } from '@xm/lexicon';
import type { KernelError } from '../jupyter/session';
import { MODULE_TO_PACKAGE, PY_BUILTINS } from './pyNames';

export interface ErrAction {
  kind: 'replace_ident' | 'fix_punct' | 'install_pkg';
  label: string;
  from?: string;
  to?: string;
  pkg?: string;
}

export interface TranslatedError {
  title: string;
  detail: string;
  causes: string[];
  actions: ErrAction[];
  /** 出错行号（1 基，可能拿不到） */
  line?: number;
  rawEn: string;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = tmp;
    }
  }
  return prev[n];
}

/** 「是不是想写 print？」：内置名 + 词库标识符里找编辑距离最近的（太短的名字不给建议，避免误导） */
export function didYouMean(name: string): string | null {
  if (name.length <= 2) return null;
  const pool = new Set<string>(PY_BUILTINS);
  for (const e of builtinLexicon.allEntries()) pool.add(e.en);
  const lower = name.toLowerCase();
  let best: { n: string; d: number } | null = null;
  for (const cand of pool) {
    if (cand === name) continue;
    const d = levenshtein(lower, cand.toLowerCase());
    if (d <= 2 && (!best || d < best.d || (d === best.d && cand.length < best.n.length))) {
      best = { n: cand, d };
    }
  }
  return best?.n ?? null;
}

function extractLine(err: KernelError): number | undefined {
  const joined = err.traceback.join('\n');
  const m = joined.match(/line (\d+)/);
  if (m) return Number(m[1]);
  const m2 = err.evalue.match(/line (\d+)/);
  return m2 ? Number(m2[1]) : undefined;
}

/** 主入口：把内核错误翻译成人话 + 可执行的修复动作 */
export function translateError(err: KernelError): TranslatedError {
  const ename = err.ename;
  const evalue = err.evalue;
  const line = extractLine(err);
  const lineStr = line ? `（第 ${line} 行）` : '';
  const causes: string[] = [];
  const actions: ErrAction[] = [];

  let title = '';
  let detail = evalue || ename;

  if (ename === 'NameError') {
    const m = evalue.match(/name '(.+?)' is not defined/);
    const name = m?.[1] ?? '';
    title = `Python 不认识「${name}」这个名字`;
    causes.push('拼写写错了（多写/少写/错写字母）');
    causes.push('这个变量还没有赋值就先用了');
    causes.push('想写文字却忘了加引号，Python 把它当成了变量');
    const fix = name ? didYouMean(name) : null;
    if (fix) {
      actions.push({
        kind: 'replace_ident',
        label: `是不是想写 ${fix}？一键替换`,
        from: name,
        to: fix,
      });
    }
    detail = `程序里用到了一个 Python 不认识的名字「${name}」${lineStr}。`;
  } else if (ename === 'SyntaxError' || ename === 'IndentationError') {
    if (ename === 'IndentationError' || /unexpected indent|expected an indented block/.test(evalue)) {
      title = '缩进不对' + lineStr;
      causes.push('同一层代码开头没有对齐');
      causes.push('if/for/def 下一行要缩进 4 个空格');
      causes.push('不该缩进的地方多了空格');
      detail = 'Python 靠每行开头的空格判断代码的层级。';
    } else {
      const bad = evalue.match(/invalid character\s+(.+?)\s+\(U\+[0-9A-F]+\)/);
      const invalidChar = (bad?.[1] ?? '').replace(/^['"]|['"]$/g, '');
      if (invalidChar && /[，。：；（）【】？！“”‘’、]/.test(invalidChar)) {
        title = `用到了中文标点「${invalidChar}」`;
        causes.push('中文输入法打的标点 Python 认不出来');
        causes.push('Python 只认英文标点：逗号、冒号、括号、引号');
        actions.push({ kind: 'fix_punct', label: '一键把代码里的中文标点改成英文' });
        detail = '通常发生在刚切换中英文输入法的时候，很常见，不是你的错。';
      } else if (/was never closed|expected/.test(evalue) && /\(/.test(evalue)) {
        title = '括号没有闭合' + lineStr;
        causes.push('开了 ( 忘了关 )');
        causes.push('引号或括号多了一个少了一个');
        actions.push({ kind: 'fix_punct', label: '顺手检查中文标点并修复' });
        detail = '数一数左右括号是不是一样多。';
      } else {
        title = '这行代码的写法 Python 看不懂' + lineStr;
        causes.push('少了冒号 :（if/for/while/def 结尾要有）');
        causes.push('用了中文标点（逗号、冒号、引号）');
        causes.push('引号/括号没有成对');
        causes.push('等号写成了 =（判断要用 ==）');
        actions.push({ kind: 'fix_punct', label: '一键把代码里的中文标点改成英文' });
        detail = evalue;
      }
    }
  } else if (ename === 'TypeError') {
    if (/can only concatenate str/.test(evalue)) {
      title = '文字和数字不能直接相加';
      causes.push('用 str(数字) 先变成文字');
      causes.push('或者用逗号分开：print("我", age, "岁")');
      detail = '文字（str）和数字（int）是两种类型，加号不知道听谁的。';
    } else if (/not callable/.test(evalue)) {
      title = '把不是函数的东西当函数用了';
      causes.push('变量名和函数名重名了（比如 print = 3 之后再 print(...) 就会这样）');
      causes.push('想调用方法但名字拼错了');
      detail = '名字后面加了括号，Python 就认为是调用函数。';
    } else if (/unsupported operand/.test(evalue)) {
      title = '这两种类型不能做这个运算';
      causes.push('用 int() / float() / str() 先转换类型');
      detail = evalue;
    } else {
      title = '类型用得不对' + lineStr;
      causes.push('检查一下变量的类型是不是和你想的一样（可以用 type() 看）');
      detail = evalue;
    }
  } else if (ename === 'ValueError') {
    if (/invalid literal for int/.test(evalue)) {
      title = 'int() 里不是数字';
      causes.push('int("12") 可以，但 int("十二") 或 int("12岁") 不行');
      causes.push('先去掉多余的文字再转换');
      detail = 'int() 只能把长得像数字的字符串变成整数。';
    } else {
      title = '值不合法';
      causes.push('检查传入的内容范围/格式');
      detail = evalue;
    }
  } else if (ename === 'IndexError') {
    title = '下标超出范围';
    causes.push('列表是从 0 开始数的：第一个是 [0]，第二个是 [1]');
    causes.push('用 len(列表) 看看它到底有几个');
    detail = '你想拿的位置比列表的长度还大。';
  } else if (ename === 'KeyError') {
    const m = evalue.match(/'(.+?)'/);
    title = `字典里没有「${m?.[1] ?? '这个键'}」`;
    causes.push('键名拼写和写入时不一致');
    causes.push('先用 d.get(键, 默认值) 更安全');
    detail = '字典按键取值，键不存在就会这样。';
  } else if (ename === 'ModuleNotFoundError' || ename === 'ImportError') {
    const m = evalue.match(/No module named '(.+?)'/);
    const mod = m?.[1] ?? '';
    const pkg = MODULE_TO_PACKAGE[mod] ?? mod;
    title = `还没有安装「${pkg}」这个库`;
    causes.push('先在左侧「装库」面板安装它');
    causes.push('也可能是名字拼错了（模块名区分大小写）');
    if (pkg) {
      actions.push({ kind: 'install_pkg', label: `去安装 ${pkg}`, pkg });
    }
    detail = 'import 需要这个库已经安装好才能用。';
  } else if (ename === 'AttributeError') {
    const m = evalue.match(/'(.+?)' object has no attribute '(.+?)'/);
    const attr = m?.[2] ?? '';
    title = `没有「${attr}」这个功能`;
    causes.push('方法名拼写错了');
    causes.push('这个类型的对象没有这个方法（把鼠标放在变量上看看）');
    const fix = attr ? didYouMean(attr) : null;
    if (fix) {
      actions.push({ kind: 'replace_ident', label: `是不是想写 ${fix}？一键替换`, from: attr, to: fix });
    }
    detail = evalue;
  } else if (ename === 'ZeroDivisionError') {
    title = '除数是 0';
    causes.push('除法前先判断除数是不是 0');
    detail = '数学上也不允许除以 0。';
  } else if (ename === 'RecursionError') {
    title = '函数停不下来地调用自己';
    causes.push('递归忘了写结束条件');
    detail = '函数每次调用自己都会打开新的一层，超过限度就报错了。';
  } else if (ename === 'KeyboardInterrupt') {
    title = '程序被手动停止了';
    causes.push('点击了停止按钮（或按了 Ctrl+C）');
    detail = '这不是错误，程序只是被打断了。';
  } else if (ename === 'FileNotFoundError') {
    const m = evalue.match(/\[Errno 2\] No such file or directory: '(.+?)'/);
    title = `找不到文件「${m?.[1] ?? ''}」`;
    causes.push('文件名拼写不对');
    causes.push('文件不在程序运行的文件夹里');
    detail = '先确认文件真的存在。';
  } else {
    title = `出错了：${ename}`;
    causes.push('把红色英文报错读一读，通常最后一句最重要');
    detail = evalue;
  }

  return {
    title,
    detail,
    causes,
    actions,
    line,
    rawEn: `${ename}: ${evalue}`,
  };
}

export function entryDoc(en: string): Entry | undefined {
  return builtinLexicon.byEn(en);
}
