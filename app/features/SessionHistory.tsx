"use client";
import { useEffect, useRef } from "react";
import { renderMaskedCanvas } from "@/lib/render";
import type { ImageItem } from "@/lib/editor";
import { useEditor } from "../editor-session";
function Thumbnail({ item }: { item: ImageItem }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const ratio = Math.min(240 / item.width, 120 / item.height, 1);
    const width = Math.max(1, Math.round(item.width * ratio));
    const height = Math.max(1, Math.round(item.height * ratio));
    const scaleBox = (box: ImageItem["history"]["present"]["regions"][number]["box"]) => ({ x_min: box.x_min * ratio, y_min: box.y_min * ratio, x_max: box.x_max * ratio, y_max: box.y_max * ratio });
    const smallSettings = (settings: ImageItem["history"]["present"]["settings"]) => ({ ...settings, pixelSize: settings.pixelSize * ratio, blurRadius: settings.blurRadius * ratio });
    const state = item.history.present;
    const smallState = { ...state, settings: smallSettings(state.settings), regions: state.regions.map(region => ({ ...region, box: scaleBox(region.box), adjustment: region.adjustment ? scaleBox(region.adjustment) : undefined, settings: region.settings ? smallSettings({ ...state.settings, ...region.settings }) : undefined })) };
    // Resize the bitmap before applying masks; thumbnail buffers stay at most 240 x 120.
    void createImageBitmap(item.file, { resizeWidth: width, resizeHeight: height }).then(bitmap => {
      try {
        if (cancelled || !ref.current) return;
        const rendered = renderMaskedCanvas(bitmap, width, height, smallState);
        const target = ref.current; target.width = width; target.height = height;
        target.getContext("2d")?.drawImage(rendered, 0, 0);
        rendered.width = rendered.height = 0;
      } finally { bitmap.close(); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [item.file, item.width, item.height, item.history.present]);
  return <canvas ref={ref} aria-hidden="true" />;
}
export function SessionHistory() {
  const { items, current, selectImage, removeImage, clearImages, progress, loading, t } = useEditor(); if (!items.length) return null;
  const state = { queued: t("待機", "Pending"), processing: t("検出中", "Detecting"), done: t("編集できます", "Ready to edit"), error: t("検出失敗・手動編集できます", "Detection failed · manual editing available") };
  return <section className="panel history"><div className="toolbar"><h2>{t("セッション内の画像", "Session images")} · {items.length}/10</h2><button disabled={progress.running || loading} onClick={clearImages}>{t("全画像を消去", "Clear all images")}</button></div><div className="history-grid">{items.map((item, index) => <article className="history-card" data-testid="history-card" key={item.id}><button aria-pressed={item.id === current?.id} onClick={() => selectImage(item.id)}><Thumbnail item={item} /><span>{index + 1}. {item.file.name}</span></button><p>{state[item.status]}</p><button disabled={progress.running || loading} onClick={() => removeImage(item.id)} aria-label={t(`画像 ${index + 1} を削除`, `Remove image ${index + 1}`)}>{t("削除", "Remove")}</button></article>)}</div></section>;
}
