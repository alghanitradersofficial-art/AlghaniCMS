import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Shared loading-state visual language for the ERP: an animated box/crate
 * sliding into a shelf slot, evoking inventory movement. Used across three
 * variants (full page, inline section/tab, and a tiny button spinner) so
 * every "waiting on backend data" moment feels consistent instead of a bare
 * spinner. Keep this component the single place new pages import from.
 */

function InventoryBoxIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shelf */}
      <motion.rect
        x="6" y="46" width="52" height="6" rx="1.5"
        fill="currentColor" className="text-muted-foreground/30"
      />
      {/* Box */}
      <motion.g
        initial={{ y: -22, opacity: 0 }}
        animate={{ y: [-22, 0, 0, -22], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", times: [0, 0.35, 0.75, 1] }}
      >
        <rect x="16" y="24" width="32" height="22" rx="2" className="fill-primary/15 stroke-primary" strokeWidth="2" />
        <path d="M16 32h32" className="stroke-primary" strokeWidth="2" />
        <path d="M32 24v8" className="stroke-primary" strokeWidth="2" />
      </motion.g>
    </svg>
  );
}

/** Full-page loading state — use for initial route/page loads. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4">
      <InventoryBoxIcon size={56} />
      <motion.p
        className="text-sm font-medium text-muted-foreground"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        {label}…
      </motion.p>
    </div>
  );
}

/** Inline section/tab loading — use inside a Card or tab panel while it fetches. */
export function SectionLoading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-3 py-12", className)}>
      <InventoryBoxIcon size={36} />
      <motion.p
        className="text-xs font-medium text-muted-foreground"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        {label}…
      </motion.p>
    </div>
  );
}

/** Small inline spinner for buttons — a coin-flip style spinning square, no text. */
export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <motion.span
      className={cn("inline-block h-3.5 w-3.5 rounded-[3px] border-2 border-current border-t-transparent", className)}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
    />
  );
}

/** Skeleton row for tables — a subtle shimmering bar, brand-colored. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("h-4 overflow-hidden rounded bg-muted", className)}>
      <motion.div
        className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
        animate={{ x: ["-100%", "300%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
