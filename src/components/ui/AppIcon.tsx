/**
 * The app's own icon, for use inside the app.
 *
 * Served from `public/` rather than imported, so this is the same file the
 * browser tab, the install prompt and the dock icon all use — one piece of
 * artwork with one place to change it (`art/icon-source.png` → `npm run icons`).
 * `BASE_URL` keeps it correct under the production `/estoria/` path.
 *
 * No frame, no background: the artwork is a card with its own edges and its own
 * drop shadow, and boxing it up would just draw a second shape around it.
 */
export function AppIcon({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon-192.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
