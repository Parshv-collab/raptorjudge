import React, { Component, ErrorInfo, ReactNode } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
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
        <div className="max-w-xl mx-auto py-12 px-4">
          <GlassCard className="p-8 flex flex-col items-center text-center gap-4 border-red-500/20">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-[#ff0055] flex items-center justify-center font-black text-xl">
              !
            </div>
            <h2 className="text-xl font-bold text-[#1d1d1f]">Could not load page</h2>
            <p className="text-xs text-[#6e6e73] max-w-sm">
              Please refresh the page or try again later.
            </p>
            <Button variant="primary" size="md" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </GlassCard>
        </div>
      );
    }

    return this.props.children;
  }
}
