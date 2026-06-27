import type { ReactNode } from "react";

/** Dimmed full-screen backdrop. Clicking it calls onClose. */
export function Scrim({
  onClose,
  z = 50,
  children,
  center = false,
}: {
  onClose: () => void;
  z?: number;
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      onMouseDown={onClose}
      className={`fixed inset-0 backdrop-blur-[2px] ${center ? "flex items-center justify-center p-[30px]" : ""}`}
      style={{ background: "rgba(20,14,6,.46)", zIndex: z }}
    >
      {children}
    </div>
  );
}

/** Stops backdrop clicks from closing when inside the dialog body. */
export function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-[30px] w-[30px] rounded-lg border border-rule bg-card text-[14px] font-medium text-ink hover:border-faint"
    >
      ✕
    </button>
  );
}
