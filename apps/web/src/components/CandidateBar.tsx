import { renderInsert, type BarState } from '../editor/hints';

interface Props {
  state: BarState | null;
  onPick: (index: number) => void;
  /** 掌握档元提示的「看一眼」 */
  onReveal?: () => void;
}

/** 多候选浮条（数字键/点击选择）或「掌握档」元提示 chip */
export default function CandidateBar({ state, onPick, onReveal }: Props) {
  if (!state) return null;
  if (state.kind === 'meta') {
    return (
      <div className="candidate-bar meta" style={{ top: state.top, left: state.left }}
        onMouseDown={(e) => e.preventDefault()}>
        <span className="meta-text">🧠 {state.text}</span>
        <button className="meta-reveal" onClick={() => onReveal?.()}>
          看一眼
        </button>
      </div>
    );
  }
  const { match, top, left } = state;
  return (
    <div
      className="candidate-bar"
      style={{ top, left }}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      {match.candidates.slice(0, 5).map((c, i) => (
        <button key={c.entry.id} className="candidate-item" onClick={() => onPick(i)}>
          <span className="cand-key">{i + 1}</span>
          <span className="cand-insert">{renderInsert(c.entry)}</span>
          <span className="cand-doc">{c.entry.doc}</span>
        </button>
      ))}
    </div>
  );
}
