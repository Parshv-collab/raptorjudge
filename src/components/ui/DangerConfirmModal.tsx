import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";

export interface DangerConfirmModalProps {
  isOpen: boolean;
  title: string;
  /** Rich body: current state, proposed state, the warning. */
  body?: React.ReactNode;
  /** Exact text the operator must retype (case-sensitive). */
  expectedText: string;
  confirmLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * GitHub-style destructive confirmation.
 *
 * The action is irreversible from the UI's point of view, so typing the target
 * name is the gate: the primary button stays disabled until the input matches
 * `expectedText` **exactly** (case-sensitive, whitespace-trimmed only at the
 * edges). The expected text is printed inline in the prompt, so the operator
 * never has to scroll up to copy it.
 */
export function DangerConfirmModal({
  isOpen,
  title,
  body,
  expectedText,
  confirmLabel = "Confirm",
  isLoading = false,
  onConfirm,
  onCancel,
}: DangerConfirmModalProps) {
  const [typed, setTyped] = useState("");

  // Never carry a half-typed confirmation into the next open.
  useEffect(() => {
    if (isOpen) setTyped("");
  }, [isOpen, expectedText]);

  const matches = typed.trim() === expectedText;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="lg">
      <div className="flex flex-col gap-5">
        {body && <div className="text-[13px] text-secondary leading-relaxed flex flex-col gap-3">{body}</div>}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="danger-confirm-input" className="text-[13px] text-secondary">
            To confirm, type <span className="font-mono text-primary">&ldquo;{expectedText}&rdquo;</span> in the box below:
          </label>
          <Input
            id="danger-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={expectedText}
            aria-describedby="danger-confirm-hint"
          />
          <span id="danger-confirm-hint" className="text-[12px] text-muted">
            Case-sensitive — the button enables only on an exact match.
          </span>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!matches} isLoading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
