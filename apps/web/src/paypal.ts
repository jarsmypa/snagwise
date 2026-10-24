/*
  Loads the PayPal JS SDK once. Typed by hand with only what we use, to avoid
  another dependency: https://developer.paypal.com/sdk/js/reference/
*/

export interface PayPalButtons {
  render(el: HTMLElement): Promise<void>;
  close(): Promise<void>;
}

export interface PayPalNamespace {
  Buttons(options: {
    style?: { layout?: "vertical" | "horizontal"; label?: "pay" | "buynow" | "checkout"; height?: number };
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }): PayPalButtons;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let loading: Promise<PayPalNamespace> | undefined;

export function loadPayPal(clientId: string, currency: string): Promise<PayPalNamespace> {
  loading ??= new Promise((resolve, reject) => {
    const params = new URLSearchParams({ "client-id": clientId, currency, intent: "capture", components: "buttons" });
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK did not load")));
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Could not reach PayPal"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
