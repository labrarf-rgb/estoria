import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The last thing between a render error and a blank white page.
 *
 * React's rule since 16 is that a component which throws while rendering takes
 * the whole tree down with it, on the reasoning that a half-drawn UI is worse
 * than none. For a writing app that reasoning is inverted: the page goes white,
 * the toolbar goes with it, and in the installed app there is no address bar to
 * reload from — the writer's only move is to quit and reopen, which is a
 * terrifying thing to be asked to do with an unsaved chapter on screen.
 *
 * So every crash should land on a page that says what happened, says that the
 * writing is safe, and offers a way out. That is all this class does.
 *
 * **It is a class because it has to be.** `componentDidCatch` and
 * `getDerivedStateFromError` have no hook equivalent; this is the one component
 * in the app that cannot be a function.
 *
 * **What it does not catch**, so nobody reads more into it than is there:
 * errors thrown from event handlers, timers, or promises never pass through
 * render, so React never routes them here. This catches the class of failure
 * that blanks the screen, which is the one that strands you.
 */
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    /** Drawn instead of the children once they have thrown. */
    fallback: (error: Error, retry: () => void) => ReactNode;
    /**
     * Change this and the boundary clears itself and tries the children again.
     *
     * Moving away from the thing that broke *is* the retry: give this the id of
     * whatever the children are showing, and closing the chapter or stepping to
     * the next one re-arms the boundary on its own. Without it a boundary stays
     * tripped for the life of the app, and one bad chapter would mean every
     * later chapter shows the error page too.
     */
    resetKey?: unknown;
  },
  { error: Error | null; key: unknown }
> {
  state: { error: Error | null; key: unknown } = { error: null, key: undefined };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: unknown },
    state: { error: Error | null; key: unknown }
  ) {
    if (state.error && props.resetKey !== state.key) return { error: null, key: props.resetKey };
    if (props.resetKey !== state.key) return { key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Still shout into the console. The fallback is for the writer; this is the
    // only copy of the component stack anyone debugging it will get.
    console.error("Estoria hit a render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error)
      return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return this.props.children;
  }
}
