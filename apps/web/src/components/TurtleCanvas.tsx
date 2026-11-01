import { useEffect, useRef } from 'react';

/** 画布指令（几何已在 Python 端算好） */
type Op = { op: string; [key: string]: any };

interface Props {
  /** 新指令（每次运行追加） */
  pendingOps: Op[];
  /** 重置信号（清空画布） */
  resetSeq: number;
}

interface Cursor {
  x: number;
  y: number;
  heading: number;
  visible: boolean;
  shape: string;
}

/**
 * turtle 画布：消费 xmturtle 发来的指令流，动画重放。
 * 几何已在 Python 端算好，这里只负责画：line/fill/text/dot/cursor/clear/init/speed
 */
export default function TurtleCanvas({ pendingOps, resetSeq }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<Op[]>([]);
  const committedRef = useRef<Op[]>([]);
  const cursorsRef = useRef<Map<string, Cursor>>(new Map());
  const runningRef = useRef(false);
  const speedRef = useRef(6);
  const sizeRef = useRef({ w: 800, h: 600 });
  const resetRef = useRef(resetSeq);

  // 重置
  useEffect(() => {
    if (resetRef.current === resetSeq) return;
    resetRef.current = resetSeq;
    committedRef.current = [];
    queueRef.current = [];
    cursorsRef.current.clear();
    drawAll();
  }, [resetSeq]);

  // 追加指令
  useEffect(() => {
    if (pendingOps.length === 0) return;
    queueRef.current.push(...pendingOps);
    if (!runningRef.current) pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOps]);

  useEffect(() => {
    drawAll();
    const ro = new ResizeObserver(() => drawAll());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawAll(partial?: { op: Op; t: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wrap = wrapRef.current!;
    const cssW = wrap.clientWidth || 400;
    const cssH = Math.min(wrap.clientHeight || 300, 999);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fdfdf8';
    ctx.fillRect(0, 0, cssW, cssH);

    const { w, h } = sizeRef.current;
    const scale = Math.min(cssW / w, cssH / h) * 0.92;
    ctx.save();
    ctx.translate(cssW / 2, cssH / 2);
    ctx.scale(scale, -scale); // y 轴向上

    // 网格（淡淡的）
    ctx.strokeStyle = '#eef0e6';
    ctx.lineWidth = 0.5;
    for (let gx = -w / 2; gx <= w / 2; gx += 50) {
      ctx.beginPath();
      ctx.moveTo(gx, -h / 2);
      ctx.lineTo(gx, h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2, gx);
      ctx.lineTo(w / 2, gx);
      ctx.stroke();
    }

    const applyOp = (op: Op) => {
      switch (op.op) {
        case 'line':
          ctx.strokeStyle = op.color || 'black';
          ctx.lineWidth = op.width || 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(op.x1, op.y1);
          ctx.lineTo(op.x2, op.y2);
          ctx.stroke();
          break;
        case 'fill': {
          ctx.fillStyle = op.color || 'gray';
          ctx.beginPath();
          const pts = op.points as number[][];
          if (pts.length > 0) {
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'dot':
          ctx.fillStyle = op.color || 'black';
          ctx.beginPath();
          ctx.arc(op.x, op.y, op.r || 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'text': {
          // 文字不能跟着翻转
          ctx.save();
          ctx.translate(op.x, op.y);
          ctx.scale(1, -1);
          ctx.fillStyle = op.color || 'black';
          const size = (op.size || 16) / 1.0;
          ctx.font = `${size}px "Microsoft YaHei", sans-serif`;
          ctx.fillText(String(op.text), 0, 4);
          ctx.restore();
          break;
        }
        case 'cursor':
          cursorsRef.current.set(op.id, {
            x: op.x,
            y: op.y,
            heading: op.heading,
            visible: op.visible,
            shape: op.shape,
          });
          break;
        case 'init':
          sizeRef.current = { w: op.w || 800, h: op.h || 600 };
          break;
      }
    };

    for (const op of committedRef.current) applyOp(op);
    if (partial) applyOp(partial.op);

    // 海龟光标（最后画，在最上层）
    for (const c of cursorsRef.current.values()) {
      if (!c.visible) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((c.heading * Math.PI) / 180);
      if (c.shape === 'turtle') {
        ctx.fillStyle = '#2f9e44';
        ctx.beginPath();
        ctx.ellipse(0, -3, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(7, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#2f9e44';
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-6, 5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, -5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** 顺序消费队列，带动画 */
  function pump() {
    if (runningRef.current) return;
    runningRef.current = true;
    const step = () => {
      const op = queueRef.current.shift();
      if (!op) {
        runningRef.current = false;
        return;
      }
      if (op.op === 'clear') {
        committedRef.current = committedRef.current.filter((o) => o.id !== op.id);
        drawAll();
        requestAnimationFrame(step);
        return;
      }
      if (op.op === 'cursor' || op.op === 'speed' || op.op === 'init') {
        committedRef.current.push(op);
        drawAll();
        requestAnimationFrame(step);
        return;
      }
      const speed = speedRef.current;
      // 从上一次 speed 指令更新
      const lastSpeed = [...committedRef.current].reverse().find((o) => o.op === 'speed');
      if (lastSpeed) speedRef.current = lastSpeed.value ?? 6;
      const sp = speedRef.current;
      const dur = sp === 0 ? 0 : Math.max(30, Math.min(420, 700 / (1 + sp * 1.2)));

      if (dur === 0 || op.op !== 'line') {
        committedRef.current.push(op);
        drawAll();
        requestAnimationFrame(step);
        return;
      }
      // line 动画：从 (x1,y1) 画到插值点
      const start = performance.now();
      const dist = Math.hypot(op.x2 - op.x1, op.y2 - op.y1);
      const frames = Math.max(1, Math.round(dur / 16));
      let f = 0;
      const anim = () => {
        f += 1;
        const t = Math.min(1, f / frames);
        drawAll({
          op: { ...op, x2: op.x1 + (op.x2 - op.x1) * t, y2: op.y1 + (op.y2 - op.y1) * t },
          t,
        });
        if (t < 1) {
          requestAnimationFrame(anim);
        } else {
          committedRef.current.push(op);
          requestAnimationFrame(step);
        }
      };
      void dist;
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(step);
  }

  return (
    <div className="turtle-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
