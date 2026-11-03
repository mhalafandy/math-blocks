import { useState } from "react";
import { MathPreview } from "./MathPreview";
import { Modal } from "./Dialogs";
import { isDesktop } from "../lib/connector";
import { openConvertedDocument, useConversion } from "../lib/convertMathType";

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Report after converting a MathType document: what was converted, what needs a look. */
export function ConversionReport() {
  const report = useConversion((s) => s.report);
  const busy = useConversion((s) => s.busy);
  const progress = useConversion((s) => s.progress);
  const set = useConversion((s) => s.set);
  const [filter, setFilter] = useState<"attention" | "display" | "all">("attention");
  if (busy)
    return (
      <div className="modal-backdrop">
        <div className="modal" role="status" style={{ width: 320 }}>
          <p className="modal-text">{progress ?? "Converting MathType equations…"}</p>
        </div>
      </div>
    );
  if (!report) return null;
  const { result } = report;
  const close = () => set({ report: null });
  const attention = result.equations.filter((e) => e.status === "skipped" || e.messages.length);
  const shown = filter === "attention" ? attention : filter === "display" ? result.equations.filter((e) => e.display) : result.equations;

  return (
    <Modal title="MathType conversion" onClose={close} width={640}>
      <div className="form">
        <p className="modal-text">
          <strong>{result.converted}</strong> of {result.equations.length} equations in <em>{baseName(report.source)}</em> are now native Word equations
          {result.skipped ? (
            <>
              ; <strong>{result.skipped}</strong> were left as MathType objects
            </>
          ) : null}
          . Equation numbers, bookmarks and cross-references are unchanged.
        </p>
        {report.inPlace && (
          <p className="modal-text muted">
            Converted in the open Word document. One <strong>Ctrl+Z</strong> in Word brings the MathType equations back.
          </p>
        )}
        {report.output && (
          <p className="modal-text muted">
            Saved as <strong>{baseName(report.output)}</strong>. Your original document was not changed.
          </p>
        )}
        <div className="segmented conv-tabs" role="tablist">
          <button className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")}>
            Needs a look ({attention.length})
          </button>
          <button className={filter === "display" ? "active" : ""} onClick={() => setFilter("display")}>
            Display equations ({result.equations.filter((e) => e.display).length})
          </button>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            All ({result.equations.length})
          </button>
        </div>
        <div className="conv-list">
          {shown.length === 0 && <p className="empty">Nothing needs a look: everything converted cleanly.</p>}
          {shown.map((e) => (
            <div key={e.index} className={`conv-row${e.status === "skipped" ? " skipped" : ""}`}>
              <span className="conv-num">{e.number ?? `#${e.index}`}</span>
              <div className="conv-eq">
                {e.latex ? <MathPreview latex={e.latex} /> : <span className="muted">(not converted)</span>}
                {e.messages.map((m, i) => (
                  <div key={i} className="conv-msg">
                    {m}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          {report.download && (
            <button
              onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(report.download!);
                a.download = report.output ?? "converted.docx";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              Download
            </button>
          )}
          <button onClick={close}>Close</button>
          {isDesktop() && report.output && (
            <button className="primary" onClick={() => void openConvertedDocument(report.output!).then(close)}>
              Open in Word
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
