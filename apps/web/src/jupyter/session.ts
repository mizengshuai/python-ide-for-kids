import { ContentsManager, KernelManager, ServerConnection } from '@jupyterlab/services';

export interface XmConfig {
  baseUrl: string;
  token: string;
}

type IKernelConnection = Awaited<ReturnType<KernelManager['startNew']>>;

/** 运行时配置：生产由 serve.py 注入 runtime-config.js；开发走 vite 代理 */
export function loadConfig(): XmConfig {
  const w = window as unknown as { __XM_CONFIG__?: XmConfig };
  const base = `${location.protocol}//${location.host}/jupyter/`;
  const token = w.__XM_CONFIG__ ? w.__XM_CONFIG__.token : 'xm-local-token';
  return { baseUrl: base, token };
}

export interface StreamChunk {
  kind: 'out' | 'err' | 'result' | 'image';
  text?: string;
  imageB64?: string;
}

export interface KernelError {
  ename: string;
  evalue: string;
  traceback: string[];
}

export type TurtleOp = Record<string, unknown> & { op: string };

export class XmSession {
  private serverSettings: ReturnType<typeof ServerConnection.makeSettings>;
  private kernelManager!: KernelManager;
  private contents: ContentsManager;
  kernel: IKernelConnection | null = null;
  onTurtleOp: ((op: TurtleOp) => void) | null = null;
  onStatus: ((s: string) => void) | null = null;
  private onStdinPrompt: ((prompt: string) => void) | null = null;

  constructor() {
    const cfg = loadConfig();
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/jupyter/`;
    this.serverSettings = ServerConnection.makeSettings({
      baseUrl: cfg.baseUrl,
      wsUrl,
      token: cfg.token,
    });
    this.contents = new ContentsManager({ serverSettings: this.serverSettings });
  }

  async start(): Promise<void> {
    this.kernelManager = new KernelManager({ serverSettings: this.serverSettings });
    this.kernel = await this.kernelManager.startNew({ name: 'python3' });
    this.kernel.statusChanged.connect((_, st) => this.onStatus?.(st));
    // stdin 兜底路由：input_request 走 anyMessage（future.onStdin 在部分版本不触发）
    (this.kernel as any).anyMessage?.connect((_: unknown, info: any) => {
      if (info?.msg?.header?.msg_type === 'input_request') {
        this.onStdinPrompt?.(String(info.msg.content?.prompt ?? '请输入：'));
      }
    });
    this.kernel.registerCommTarget('xm.turtle', (comm, msg) => {
      const data = (msg.content.data ?? {}) as TurtleOp;
      if (data && data.op) this.onTurtleOp?.(data);
      comm.onMsg = (m) => {
        const d = (m.content.data ?? {}) as TurtleOp;
        if (d && d.op) this.onTurtleOp?.(d);
      };
    });
  }

  async execute(
    code: string,
    handlers: {
      onChunk: (c: StreamChunk) => void;
      onError: (e: KernelError) => void;
      /** 程序调用 input() 等待键盘输入；配套 sendInputReply 提交 */
      onStdin?: (prompt: string) => void;
    }
  ): Promise<void> {
    if (!this.kernel) throw new Error('内核还没准备好');
    const future = this.kernel.requestExecute({
      code,
      silent: false,
      store_history: false,
      allow_stdin: true,
    });
    future.onIOPub = (msg: any) => {
      const t = msg.header.msg_type;
      const c = msg.content ?? {};
      if (t === 'comm_open' || t === 'comm_msg') {
        // turtle 画布指令随执行流返回（data.op 存在即是）
        const d = c.data;
        if (d && typeof d === 'object' && 'op' in d) {
          this.onTurtleOp?.(d as TurtleOp);
        }
        return;
      }
      if (t === 'stream') {
        handlers.onChunk({ kind: c.name === 'stderr' ? 'err' : 'out', text: c.text ?? '' });
      } else if (t === 'display_data' || t === 'update_display_data') {
        const data = c.data ?? {};
        if (data['image/png']) handlers.onChunk({ kind: 'image', imageB64: data['image/png'] });
        else if (data['text/plain']) handlers.onChunk({ kind: 'result', text: String(data['text/plain']) });
      } else if (t === 'execute_result') {
        const data = c.data ?? {};
        if (data['image/png']) handlers.onChunk({ kind: 'image', imageB64: data['image/png'] });
        else if (data['text/plain']) handlers.onChunk({ kind: 'result', text: String(data['text/plain']) });
      } else if (t === 'error') {
        handlers.onError({ ename: c.ename ?? 'Error', evalue: c.evalue ?? '', traceback: c.traceback ?? [] });
      }
    };
    future.onStdin = (msg: any) => {
      if (msg?.header?.msg_type === 'input_request') {
        handlers.onStdin?.(String(msg.content?.prompt ?? '请输入：'));
      }
    };
    this.onStdinPrompt = handlers.onStdin ?? null;
    try {
      await future.done;
    } finally {
      this.onStdinPrompt = null;
    }
  }

  /** 提交 input() 的用户输入 */
  sendInputReply(value: string): void {
    (this.kernel as any)?.sendInputReply?.({ status: 'ok', value });
  }

  async interrupt(): Promise<void> {
    await this.kernel?.interrupt();
  }

  async restart(): Promise<void> {
    if (this.kernel) {
      await this.kernel.restart();
    }
  }

  // ---------- 文件 ----------
  async listPyFiles(): Promise<{ name: string; path: string }[]> {
    const dir = await this.contents.get('.', { content: true });
    const items = Array.isArray(dir.content) ? dir.content : [];
    return items
      .filter(
        (it: any) =>
          it.type === 'file' && it.name.endsWith('.py') && !it.name.startsWith('snapshot-')
      )
      .map((it: any) => ({ name: it.name, path: it.path }));
  }

  /** 运行前快照（资源管理器单独分组展示） */
  async listSnapshots(): Promise<{ name: string; path: string }[]> {
    const dir = await this.contents.get('.', { content: true });
    const items = Array.isArray(dir.content) ? dir.content : [];
    return items
      .filter((it: any) => it.type === 'file' && it.name.startsWith('snapshot-'))
      .sort((a: any, b: any) => (a.name < b.name ? 1 : -1))
      .map((it: any) => ({ name: it.name, path: it.path }));
  }

  async read(path: string): Promise<string> {
    const f = await this.contents.get(path, { content: true });
    return typeof f.content === 'string' ? f.content : '';
  }

  async save(path: string, content: string): Promise<void> {
    await this.contents.save(path, { type: 'file', format: 'text', content });
  }

  /** 重命名 / 删除文件（菜单栏） */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await (this.contents as any).rename(oldPath, newPath);
  }

  async deleteFile(path: string): Promise<void> {
    await this.contents.delete(path);
  }

  /** 运行前快照（平铺保存，避免子目录问题；失败不阻断；保留最近 20 份） */
  async snapshot(path: string, content: string): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safe = path.replace(/[\\/]/g, '_');
    try {
      await this.save(`snapshot-${safe}.${stamp}.py`, content);
      // 清理超额快照
      const dir = await this.contents.get('.', { content: true });
      const snaps = (Array.isArray(dir.content) ? dir.content : [])
        .filter((it: any) => it.type === 'file' && it.name.startsWith('snapshot-'))
        .sort((a: any, b: any) => (a.name < b.name ? 1 : -1));
      for (const old of snaps.slice(20)) {
        try {
          await this.contents.delete(old.path);
        } catch {
          /* 忽略 */
        }
      }
    } catch {
      /* 快照失败不阻断运行 */
    }
  }
}
