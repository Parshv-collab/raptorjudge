import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-canvas text-primary flex items-center justify-center px-5 py-12">
          <div className="max-w-md w-full bg-surface-1 border border-line rounded-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center font-semibold text-xl border border-danger/30">
              !
            </div>
            <h2 className="text-h3 text-primary">Could not load page</h2>
            <p className="text-[13px] text-secondary max-w-sm leading-relaxed">
              An unexpected error occurred while rendering this page. Please refresh and try again.
            </p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Refresh page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
