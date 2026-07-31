import React from "react";

/**
 * Catches a render crash and shows a way out.
 *
 * Without this, one bad field white-screens that player's tab with no
 * message and no recovery — and if it happens to the describer, nobody
 * deals a card and the whole table waits on a turn that never starts.
 * A blank screen is the worst possible failure for a party game,
 * because nobody can tell whether it's the app or their connection.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Visible in the console for anyone debugging on a real device.
    console.error("[mamnou3] render crash:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell justify-center">
        <p className="text-center font-display text-[26px]">صار خلل بالشاشة</p>
        <p className="mt-3 text-center text-[14px] leading-relaxed text-muted">
          اللعبة مستمرة مع البقية. أعد التحميل وسترجع لنفس الجولة.
        </p>
        <div className="h-6" />
        <button className="btn btn-lemon" onClick={() => location.reload()}>
          أعد التحميل
        </button>
        <div className="h-3" />
        <button
          className="btn btn-ghost"
          onClick={() => { location.hash = ""; location.reload(); }}
        >
          ارجع للبداية
        </button>
        <p className="mt-6 text-center text-[11px] text-muted/60" dir="ltr">
          {this.state.error.message}
        </p>
      </div>
    );
  }
}
