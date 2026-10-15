// Error boundary — PHASE_01 §1.109 ("Add error boundary").
//
// Without one, a render error in any component unmounts the entire
// React tree and the user gets a WHITE PAGE. There is no message, no
// stack, nothing in the UI to report — just a blank browser window,
// which is the least diagnosable failure a web application has.
//
// This is deliberately a class component: as of React 18 there is no
// hook equivalent, and `componentDidCatch` is the only way to catch a
// descendant's render error.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown instead of the default panel, for a scoped boundary. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // The browser console is the only log this tier has. A boundary
    // that swallows the error silently trades a white page for a
    // wrong page, which is worse — at least the white page was
    // obviously broken.
    console.error("render error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <main>
        <h1>PROXIC ARENA</h1>
        <section className="panel">
          <p>Something in the page failed to render.</p>
          {/* The message, not the stack: a stack trace in the UI is
              noise to a player and a small information leak. The
              stack is in the browser console for whoever needs it. */}
          <p className="hint">{error.message}</p>
          <button type="button" onClick={this.reset}>
            Try again
          </button>
        </section>
        <p className="verdict">
          If this persists, check the browser console and{" "}
          <code>docker compose logs arena-server</code>.
        </p>
      </main>
    );
  }
}
