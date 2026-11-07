"use client";
import { useState } from "react";
import { canvasBlob } from "@/lib/render";
import { useEditor } from "../editor-session";
export function CopyOutput() {
  const { createOutput, t, setFeedback } = useEditor(); const [busy, setBusy] = useState(false);
  function copy() {
    if (busy) return;
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") { setFeedback(["画像コピーに対応していません。ダウンロードを利用してください。", "Image copying is unavailable. Use Download instead."]); return; }
    setBusy(true);
    // Pass a Blob promise during the click to preserve browser user activation.
    const blob = createOutput().then(async canvas => { try { return await canvasBlob(canvas); } finally { canvas.width = canvas.height = 0; } });
    try { const operation = navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); void Promise.all([operation, blob]).then(() => setFeedback(["マスク済み画像をコピーしました。", "Masked image copied."])).catch(() => setFeedback(["画像をコピーできません。ブラウザの許可を確認するか、ダウンロードを利用してください。", "Could not copy the image. Check browser permissions or use Download."])).finally(() => setBusy(false)); }
    catch { void blob.catch(() => undefined); setBusy(false); setFeedback(["画像をコピーできません。ダウンロードを利用してください。", "Could not copy the image. Use Download instead."]); }
  }
  return <button data-testid="copy-image" disabled={busy} onClick={copy}>{busy ? t("コピー中…", "Copying…") : t("画像をコピー", "Copy image")}</button>;
}
