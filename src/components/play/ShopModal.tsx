import { useRef } from "react";
import { Coins, ShoppingBag } from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { Dialog, DialogTitle } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";

export function ShopModal() {
  const t = useT();
  const shop = useSessionStore((s) => s.shop);
  const character = useSessionStore((s) => s.character);
  const close = useSessionStore((s) => s.closeShop);
  const purchase = useSessionStore((s) => s.purchaseOffer);

  // Keep the last shop around so the exit animation still has content to show
  // after the store clears `shop`.
  const lastShop = useRef(shop);
  if (shop) lastShop.current = shop;
  const shown = shop ?? lastShop.current;
  if (!shown || !character) return null;
  const gp = character.currency?.gp ?? 0;

  return (
    <Dialog open={!!shop} onClose={close} className="max-h-[85dvh] max-w-xl">
      <header className="flex items-start justify-between border-b border-line/60 bg-canvas/40 px-6 py-4">
        <div>
          <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.4em] text-accent-muted">
            <ShoppingBag className="h-3 w-3" />
            {t("play.shop.eyebrow")}
          </p>
          <DialogTitle className="mt-0.5 font-display text-xl text-text">
            {shown.vendorName}
          </DialogTitle>
          {shown.location && (
            <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-text-muted">
              {shown.location}
            </p>
          )}
        </div>
        <CloseButton onClick={close} />
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
        {shown.offers.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted/80">
            {t("play.shop.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.offers.map((o) => {
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
                        <span className="ml-2 font-mono text-xs text-text-muted">
                          ×{o.qty}
                        </span>
                      )}
                    </p>
                    {o.description && (
                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
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
                        : "border-line bg-surface text-text-muted/60",
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
    </Dialog>
  );
}
