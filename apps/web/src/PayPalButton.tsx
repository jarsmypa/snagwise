import { useEffect, useRef, useState } from "react";
import { api, type Budget, type Config } from "./api";
import { loadPayPal } from "./paypal";
import { useI18n } from "./i18n";

// The PayPal checkout is the human approval step: nothing is paid until the user approves here.
export function PayPalButton({ config, wishId, onPaid }: { config: Config; wishId: string; onPaid: (budget: Budget) => void }) {
  const { t: translate } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onPaidRef = useRef(onPaid);
  // Latest translations without re-rendering the PayPal buttons when the language changes.
  const tRef = useRef(translate);
  tRef.current = translate;
  const t: typeof translate = (key, vars) => tRef.current(key, vars);
  onPaidRef.current = onPaid;

  useEffect(() => {
    const clientId = config.paypalClientId;
    if (!clientId || !ref.current) return;
    const el = ref.current;
    let closed = false;
    let buttons: ReturnType<NonNullable<Window["paypal"]>["Buttons"]> | undefined;

    loadPayPal(clientId, config.currency)
      .then((paypal) => {
        if (closed) return;
        buttons = paypal.Buttons({
          style: { layout: "horizontal", label: "pay", height: 40 },
          createOrder: async () => (await api.createOrder(wishId)).orderId,
          onApprove: async ({ orderID }) => {
            const result = await api.captureOrder(orderID, wishId);
            if (result.status === "COMPLETED") onPaidRef.current(result.budget);
            else setError(t("paypal.status", { status: result.status }));
          },
          onError: (err) => setError(err instanceof Error ? err.message : t("paypal.failed")),
        });
        return buttons.render(el);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      closed = true;
      void buttons?.close();
    };
  }, [config.paypalClientId, config.currency, wishId]);

  if (!config.paypalClientId) return <p className="hint">{t("paypal.missing")}</p>;
  return (
    <div>
      <div ref={ref} className="paypal" />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
