import { useEffect, useRef, useState } from "react";
import { api, type Budget, type Config } from "./api";
import { loadPayPal } from "./paypal";

// The PayPal checkout is the human approval step: nothing is paid until the user approves here.
export function PayPalButton({ config, wishId, onPaid }: { config: Config; wishId: string; onPaid: (budget: Budget) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onPaidRef = useRef(onPaid);
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
            else setError(`PayPal returned ${result.status}`);
          },
          onError: (err) => setError(err instanceof Error ? err.message : "PayPal could not complete the payment"),
        });
        return buttons.render(el);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      closed = true;
      void buttons?.close();
    };
  }, [config.paypalClientId, config.currency, wishId]);

  if (!config.paypalClientId) return <p className="hint">Add PayPal sandbox credentials to enable checkout.</p>;
  return (
    <div>
      <div ref={ref} className="paypal" />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
