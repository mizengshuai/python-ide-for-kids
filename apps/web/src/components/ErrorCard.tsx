import { useState } from 'react';
import type { ErrAction, TranslatedError } from '../errors/translate';

interface Props {
  err: TranslatedError;
  onAction: (a: ErrAction) => void;
  onDismiss: () => void;
}

/** 中文报错卡片：人话解释 + 常见原因 + 一键修复 */
export default function ErrorCard({ err, onAction, onDismiss }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="error-card">
      <div className="error-head">
        <span className="error-icon">😵</span>
        <span className="error-title">{err.title}</span>
        <button className="error-close" onClick={onDismiss} title="关闭">
          ×
        </button>
      </div>
      {err.detail && <div className="error-detail">{err.detail}</div>}
      {err.causes.length > 0 && (
        <div className="error-causes">
          <div className="causes-title">可能的原因：</div>
          <ul>
            {err.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {err.actions.map((a, i) => (
        <button key={i} className="fix-btn" onClick={() => onAction(a)}>
          🛠 {a.label}
        </button>
      ))}
      <div className="error-raw-toggle" onClick={() => setShowRaw(!showRaw)}>
        {showRaw ? '收起原始报错' : '看原始英文报错'}
      </div>
      {showRaw && <pre className="error-raw">{err.rawEn}</pre>}
    </div>
  );
}
