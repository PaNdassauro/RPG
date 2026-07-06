import { AnimatePresence, motion } from "framer-motion";
import { Coins, X, ShoppingBag } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

export function ShopModal() {
  const t = useT();
  const shop = useSessionStore((s) => s.shop);
  const character = useSessionStore((s) => s.character);
  const close = useSessionStore((s) => s.closeShop);
  const purchase = useSessionStore((s) => s.purchaseOffer);

  if (!shop || !character) return null;
  const gp = character.currency?.gp ?? 0;

  return (
    <AnimatePresence>
      <motion.div
        key="shop-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/85 p-4 backdrop-blur-sm"
        onClick={close}
      >
        <motion.div
          key="shop-card"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.4, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-[0_0_80px_-20px_rgba(212,170,71,0.4)]"
        >
          <header className="flex items-start justify-between border-b border-line/60 bg-canvas/40 px-6 py-4">
            <div>
              <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
                <ShoppingBag className="h-3 w-3" />
                {t("play.shop.eyebrow")}
              </p>
              <h2 className="mt-0.5 font-display text-xl text-text">
                {shop.vendorName}
              </h2>
              {shop.location && (
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-text-muted">
                  {shop.location}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition hover:border-accent-muted hover:text-text"
              aria-label={t("common.cancel")}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex items-center gap-3 border-b border-line/60 bg-canvas/20 px-6 py-2.5">
            <Coins className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono text-sm text-text">
              {gp}{" "}
              <span className="font-display text-[10px] uppercase tracking-widest text-text-muted">
                {t("play.shop.gold")}
              </span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {shop.offers.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted/60">
                {t("play.shop.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shop.offers.map((o) => {
                  const canAfford = gp >= o.priceGp;
                  return (
                    <li
                      key={o.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm text-text">
                          {o.name}
                          {o.qty > 1 && (
                            <span className="ml-2 font-mono text-[10px] text-text-muted">
                              ×{o.qty}
                            </span>
                          )}
                        </p>
                        {o.description && (
                          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                            {o.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => purchase(o.id)}
                        className={cn(
                          "shrink-0 rounded-md border px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.25em] transition",
                          canAfford
                            ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
                            : "border-line bg-surface text-text-muted/40",
                        )}
                      >
                        {o.priceGp} {t("play.shop.gpShort")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-line/60 bg-canvas/30 px-6 py-3 text-center">
            <button
              type="button"
              onClick={close}
              className="font-display text-[10px] uppercase tracking-[0.3em] text-text-muted transition hover:text-text"
            >
              {t("play.shop.leave")}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
