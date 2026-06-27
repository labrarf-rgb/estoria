import { useState } from "react";
import { useStore } from "@/store/useStore";

/** Full-screen image viewer with click-to-zoom. */
export function Lightbox() {
  const src = useStore((s) => s.lightbox);
  const close = useStore((s) => s.closeLightbox);
  const [zoomed, setZoomed] = useState(false);
  if (!src) return null;

  return (
    <div
      onMouseDown={() => {
        setZoomed(false);
        close();
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{ background: "rgba(10,7,3,.86)" }}
    >
      <img
        src={src}
        alt=""
        onMouseDown={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
        className="rounded-lg shadow-[0_30px_90px_rgba(0,0,0,0.6)] transition-transform"
        style={{
          maxWidth: zoomed ? "none" : "92vw",
          maxHeight: zoomed ? "none" : "92vh",
          width: zoomed ? "auto" : undefined,
          cursor: zoomed ? "zoom-out" : "zoom-in",
          transform: zoomed ? "scale(1.6)" : "scale(1)",
        }}
      />
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          setZoomed(false);
          close();
        }}
        className="absolute right-5 top-5 h-[34px] w-[34px] rounded-lg border border-white/30 bg-black/40 text-[15px] text-white hover:bg-black/60"
      >
        ✕
      </button>
    </div>
  );
}
