import React, { useEffect, useRef } from "react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "md",
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-backdrop backdrop-blur-[4px] modal-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className={`w-full ${widthClasses[maxWidth]} modal-rise-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-surface-1 border border-line rounded-card shadow-modal p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="absolute right-4 top-4 text-muted hover:text-primary p-1.5 rounded-btn transition-colors duration-fast"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {title && (
            <h3 id="modal-title" className="text-h3 text-primary pr-8">
              {title}
            </h3>
          )}
          {description && <p className="text-[13px] text-secondary mt-1.5">{description}</p>}
          <div className={title || description ? "mt-5" : ""}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireTyping?: string;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requireTyping,
  isLoading = false,
}) => {
  const [typedText, setTypedText] = React.useState("");

  useEffect(() => {
    if (isOpen) setTypedText("");
  }, [isOpen]);

  const canConfirm = !requireTyping || typedText.trim() === requireTyping;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description}>
      <div className="flex flex-col gap-4">
        {requireTyping && (
          <input
            aria-label={`Type ${requireTyping} to confirm`}
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={requireTyping}
            className="w-full h-10 px-3.5 text-sm rounded-input text-primary placeholder:text-muted bg-surface-1 border border-line transition-colors duration-fast focus:border-accent focus:outline-2 focus:outline-accent/40"
          />
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-10 inline-flex items-center rounded-btn text-sm text-secondary hover:text-primary hover:bg-surface-2 transition-colors duration-fast"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm || isLoading}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 h-10 inline-flex items-center justify-center gap-2 rounded-btn text-sm text-white transition-colors duration-fast disabled:opacity-40 disabled:pointer-events-none ${
              destructive ? "bg-danger hover:brightness-110" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {isLoading && (
              <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
