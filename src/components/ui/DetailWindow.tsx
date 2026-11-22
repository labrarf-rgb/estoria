import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store/useStore";
import { stop } from "@/components/ui/Overlay";

/**
 * The window a tile opens: a character, a world entry, a library item or a
 * pinned reference, edited in a centred dialog on top of whatever opened it,
 * the way clicking a chapter card opens the chapter.
 *
 * Portalled to `<body>` so it always rises over the drawer (z 55) and the
 * chapter modal (z 50), while the lightbox (80) and the confirm dialog (100)
 * still rise over it. React events still bubble through the tree that rendered
 * it, so a press inside never reaches the drawer's backdrop.
 *
 * Windows can stack (a world entry's reference opened from the entry's own
 * window). Escape closes only the top one, and never while a confirm is up.
 */
const stack: symbol[] = [];

export function DetailWindow({
  onClose,
  badge,
  title,
  untitled = false,
  footer,
  children,
}: {
  onClose: () => void;
  /** Badge and tag, as on the tile. */
  badge?: ReactNode;
  title: string;
  untitled?: boolean;
  /** Archive / Delete / Remove, pinned under the scrolling body. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const me = useRef(Symbol("window"));
  const close = useRef(onClose);
  close.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = me.current;
    stack.push(id);
    // Take focus so Tab starts here, not on the tile behind, unless a field
    // inside already took it (a new draft focuses its first field).
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || stack[stack.length - 1] !== id) return;
      if (useStore.getState().confirm || useStore.getState().lightbox) return;
      e.preventDefault();
      close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(id);
      if (at !== -1) stack.splice(at, 1);
    };
  }, []);

  return createPortal(
    <div
      onMouseDown={(e) => {
        stop(e);
        onClose();
      }}
      className="fixed inset-0 flex items-center justify-center p-[24px]"
      style={{ background: "rgba(20,14,6,.38)", zIndex: 65 }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={stop}
        className="flex max-h-full w-full max-w-[620px] flex-col rounded-[14px] border border-rule bg-panel shadow-[0_30px_80px_rgba(0,0,0,0.35)] outline-none"
      >
        <div className="flex shrink-0 items-center gap-[10px] border-b border-rule px-[20px] py-[15px]">
          {badge}
          <div
            className={`min-w-0 flex-1 truncate font-serif text-[20px] font-semibold leading-tight ${
              untitled ? "text-faint" : "text-ink"
            }`}
          >
            {title}
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="h-[30px] w-[30px] shrink-0 rounded-lg border border-rule bg-card text-[14px] font-medium text-ink hover:border-faint"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-[20px] py-[16px]">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center gap-[8px] border-t border-rule px-[20px] py-[12px]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Footer button: a reversible action (Archive) or, with `danger`, a destructive one. */
export function WindowButton({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border border-rule px-[12px] py-[6px] text-[12px] font-medium text-soft hover:border-faint ${
        danger ? "hover:text-but" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
