import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatMoney, savingsCents, type Offer } from "@snagwise/core";
import { api } from "./api";
import { useI18n, type TFunction } from "./i18n";

// Story-sized (9:16) recommendation card. The QR opens a public page for the deal; scans and saves
// from that page flow back into the sharer's taste profile.
const W = 1080;
const H = 1920;
const money = formatMoney;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join(" ").length < text.length) lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/\s*\S*$/, "")}…`;
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

async function drawCard(offer: Offer, shareId: string, link: string, t: TFunction, locale: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1e5b43");
  bg.addColorStop(1, "#123a2a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#cdebd9";
  ctx.font = font(700, 40);
  ctx.fillText(t("card.pick"), 90, 150);

  // Product photo (same-origin copy, so the canvas stays exportable) or a category block.
  const box = { x: 90, y: 210, w: W - 180, h: 760 };
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, box.x, box.y, box.w, box.h, 36);
  ctx.fill();
  const img = offer.imageUrl ? await loadImage(`/api/shares/${shareId}/image`) : null;
  if (img) {
    const scale = Math.min((box.w - 80) / img.width, (box.h - 80) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  } else {
    ctx.fillStyle = "#1e5b43";
    ctx.font = font(700, 64);
    ctx.textAlign = "center";
    ctx.fillText(offer.category ?? t("swipe.deal"), W / 2, box.y + box.h / 2);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 60);
  let y = 1080;
  for (const line of wrap(ctx, offer.title, W - 180, 3)) {
    ctx.fillText(line, 90, y);
    y += 74;
  }
  ctx.fillStyle = "#cdebd9";
  ctx.font = font(400, 38);
  ctx.fillText([offer.brand, offer.domain].filter(Boolean).join(" · "), 90, y + 6);

  y += 120;
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 120);
  const price = money(offer.priceCents);
  ctx.fillText(price, 90, y);
  if (offer.compareAtCents !== undefined) {
    const px = 90 + ctx.measureText(price).width + 30;
    ctx.font = font(400, 50);
    ctx.fillStyle = "#9cc7ae";
    const old = money(offer.compareAtCents);
    ctx.fillText(old, px, y);
    const ow = ctx.measureText(old).width;
    ctx.fillRect(px, y - 17, ow, 4);
  }
  if (savingsCents(offer) > 0) {
    ctx.font = font(700, 44);
    ctx.fillStyle = "#f5c518";
    ctx.fillText(t("deal.save", { amount: money(savingsCents(offer)) }), 90, y + 70);
  }

  // QR with a quiet zone, bottom right; caption on the left.
  const qrSize = 300;
  const qx = W - 90 - qrSize;
  const qy = H - 90 - qrSize - 40;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qx - 20, qy - 20, qrSize + 40, qrSize + 40, 28);
  ctx.fill();
  const qr = await loadImage(await QRCode.toDataURL(link, { margin: 0, width: qrSize, color: { dark: "#0d1f16", light: "#ffffff" } }));
  if (qr) ctx.drawImage(qr, qx, qy, qrSize, qrSize);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 46);
  ctx.fillText(t("card.scan1"), 90, qy + 80);
  ctx.fillText(t("card.scan2"), 90, qy + 136);
  ctx.fillStyle = "#9cc7ae";
  ctx.font = font(400, 30);
  const date = new Date().toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  ctx.fillText(t("card.priceOn", { date }), 90, qy + 210);

  return canvas;
}

export function ShareCard({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [png, setPng] = useState<{ url: string; blob: Blob; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    (async () => {
      const { id } = await api.createShare(offer);
      const link = `${location.origin}/s/${id}`;
      const canvas = await drawCard(offer, id, link, t, locale);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error(t("card.imageFailed"));
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPng({ url: objectUrl, blob, link });
    })().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [offer, t, locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const file = png ? new File([png.blob], "snagwise-deal.png", { type: "image/png" }) : null;
  const canShareFile = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <h2 id="share-title">{t("card.title")}</h2>
        {error && <p role="alert">{error}</p>}
        {!png && !error && <p className="hint">{t("card.creating")}</p>}
        {png && (
          <>
            <img className="story" src={png.url} alt={t("card.alt", { title: offer.title })} />
            <div className="row center">
              {canShareFile && file && (
                <button onClick={() => void navigator.share({ files: [file], title: offer.title, url: png.link }).catch(() => undefined)}>
                  {t("card.share")}
                </button>
              )}
              {/* One primary action: Share when the device can, Download otherwise. */}
              <a className={canShareFile ? "button quiet" : "button"} href={png.url} download="snagwise-deal.png">
                {t("card.download")}
              </a>
              <button
                className="quiet"
                onClick={() => void navigator.clipboard.writeText(png.link).then(() => setCopied(true))}
              >
                {copied ? t("card.copied") : t("card.copy")}
              </button>
            </div>
          </>
        )}
        <button className="link" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
