import React from "react";
import { toast as sonnerToast, Toaster as SonnerToaster, ToastT } from "sonner";

export { toast } from "sonner";

type ToastVariant = "success" | "warning" | "danger" | "info";

interface ToastBodyProps {
  title: string;
  description?: string;
  variant: ToastVariant;
}

const BAR: Record<ToastVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-accent",
};

function ToastBody({ title, description, variant }: ToastBodyProps) {
  return (
    <div className="flex w-80 items-stretch overflow-hidden rounded-card border border-line bg-surface-1 shadow-modal">
      <div className={`w-1 shrink-0 ${BAR[variant]}`} aria-hidden="true" />
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-primary">{title}</p>
        {description && <p className="text-[13px] text-secondary mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

/** App-level toaster: bottom-right, slide-in from right, 4s auto-dismiss (spec). */
export function AppToaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      gap={8}
      offset={16}
      toastOptions={{
        classNames: {
          toast: "toast-slide-in group-[.toaster]:!bg-surface-1 group-[.toaster]:!border-line group-[.toaster]:!text-primary group-[.toaster]:!rounded-card group-[.toaster]:!shadow-modal group-[.toaster]:!font-sans",
          title: "group-[.toast]:!text-sm group-[.toast]:!text-primary",
          description: "group-[.toast]:!text-[13px] group-[.toast]:!text-secondary",
        },
      }}
    />
  );
}

export interface ShowToastOptions {
  description?: string;
}

export function showSuccess(title: string, options?: ShowToastOptions) {
  sonnerToast.custom((id: string | number) => <ToastBody key={id} title={title} description={options?.description} variant="success" />, { duration: 4000 });
}

export function showWarning(title: string, options?: ShowToastOptions) {
  sonnerToast.custom((id: string | number) => <ToastBody key={id} title={title} description={options?.description} variant="warning" />, { duration: 4000 });
}

export function showDanger(title: string, options?: ShowToastOptions) {
  sonnerToast.custom((id: string | number) => <ToastBody key={id} title={title} description={options?.description} variant="danger" />, { duration: 4000 });
}

export function showInfo(title: string, options?: ShowToastOptions) {
  sonnerToast.custom((id: string | number) => <ToastBody key={id} title={title} description={options?.description} variant="info" />, { duration: 4000 });
}

/** Convenience type re-export for callers that type their toast payloads. */
export type { ToastT };
