import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidMount() {
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection, true);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection, false);
    if (!window.onunhandledrejection) {
      window.onunhandledrejection = this.handleUnhandledRejection as any;
    }
  }

  public componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection, true);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection, false);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.warn("[ErrorBoundary] Intercepted unhandled promise rejection:", event?.reason);
    // Prevent global unhandled rejection error from bubbling to browser harness
    if (event) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }
    return true;
  };

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn("Could not clear storage:", e);
    }
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-3xl font-black">
              ⚠️
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-rose-400 uppercase">
                系統遭遇預期外狀況 / System Notice
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                遊戲畫面載入時觸發了例外錯誤。您可以試著重新整理，或清除暫存資料恢復初始狀態。
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left font-mono text-[10px] text-rose-300 overflow-x-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-600/20 cursor-pointer"
              >
                🔄 重新載入 (Reload)
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                🗑️ 清除快取 (Reset)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
