"use client";
import { useState } from "react";
import { canvasBlob, safeFilename, type ImageFormat } from "@/lib/render";
import { useEditor } from "../editor-session";
export function Download() {
  const { current, createOutput, t, setFeedback } = useEditor(); const [name, setName] = useState(""); const [format, setFormat] = useState<ImageFormat>("image/png"); const [quality, setQuality] = useState(.92); const [busy, setBusy] = useState(false);
  if (!current) return null;
  async function download() {
    if (busy) return; setBusy(true); let canvas: HTMLCanvasElement | null = null;
    try { canvas = await createOutput(); const blob = await canvasBlob(canvas, format, quality); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = safeFilename(name || `${current!.file.name.replace(/\.[^.]*$/, "")}-masked`, format); anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setFeedback(["保存用画像を作成しました。ダウンロード先を確認してください。", "Image prepared. Check your downloads."]); }
    catch { setFeedback(["保存画像を作れませんでした。小さい画像で試してください。", "Could not create the download. Try a smaller image."]); }
    finally { if (canvas) canvas.width = canvas.height = 0; setBusy(false); }
  }
  return <div><label className="field"><span>{t("ファイル名", "Filename")}</span><input type="text" data-testid="filename" value={name} placeholder={`${current.file.name.replace(/\.[^.]*$/, "")}-masked`} maxLength={150} onChange={event => setName(event.target.value)} /></label><label className="field"><span>{t("形式", "Format")}</span><select data-testid="output-format" value={format} onChange={event => setFormat(event.target.value as ImageFormat)}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select></label>{format === "image/jpeg" && <label className="field"><span>{t("JPEG画質", "JPEG quality")} · {Math.round(quality * 100)}%</span><input data-testid="jpeg-quality" type="range" min="0.1" max="1" step="0.01" value={quality} onChange={event => setQuality(Number(event.target.value))} /></label>}<button className="primary" data-testid="download" disabled={busy} onClick={() => void download()}>{busy ? t("画像を作成中…", "Preparing image…") : t("画像をダウンロード", "Download image")}</button><p className="muted">{t("出力には比較表示・検出枠を含めません。顔が隠れているか確認して保存してください。", "Exports exclude comparisons and bounds. Check that faces are covered before saving.")}</p></div>;
}
