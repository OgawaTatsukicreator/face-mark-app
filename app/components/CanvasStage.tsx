"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { clampBox, effectiveBox, type Box } from "@/lib/editor";
import { renderMaskedCanvas } from "@/lib/render";
import { useEditor } from "../editor-session";

export function CanvasStage() {
  const { current, edit, t, showBounds, selectedRegion, selectRegion, updateEdit, mode, zoom, pan, setPan, compare, comparison, setFeedback } = useEditor();
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 700, height: 420 });
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const drag = useRef<{ x: number; y: number; screenX: number; screenY: number; panX: number; panY: number } | null>(null);
  const url = current?.url;
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const image = new Image(); image.src = url;
    image.decode().then(() => { if (!cancelled) setLoaded({ url, image }); }).catch(() => { if (!cancelled) setFeedback(["画像を表示できません。画像を選び直してください。", "Cannot display the image. Select it again."]); });
    return () => { cancelled = true; image.src = ""; };
  }, [url, setFeedback]);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(entries => { const box = entries[0].contentRect; setSize({ width: box.width, height: box.height }); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!current || !edit || loaded?.url !== current.url || !output.current) return;
    try {
      const rendered = renderMaskedCanvas(loaded.image, current.width, current.height, edit);
      const canvas = output.current; canvas.width = current.width; canvas.height = current.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("CANVAS"); context.drawImage(rendered, 0, 0);
      rendered.width = 1; rendered.height = 1;
    } catch { setFeedback(["画像を描画できません。小さい画像で試してください。", "Cannot render the image. Try a smaller image."]); }
  }, [current, edit, loaded, setFeedback]);
  if (!current || !edit) return <div ref={viewport} className="canvas-viewport empty"><p>{t("画像を選んで始めましょう", "Choose an image to begin")}</p></div>;
  const fit = Math.max(0.001, Math.min((size.width - 24) / current.width, (size.height - 24) / current.height, 1));
  function point(event: PointerEvent) {
    const rect = surface.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(current!.width, (event.clientX - rect.left) / rect.width * current!.width)), y: Math.max(0, Math.min(current!.height, (event.clientY - rect.top) / rect.height * current!.height)) };
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const p = point(event);
    if (mode === "select") return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { ...p, screenX: event.clientX, screenY: event.clientY, panX: pan.x, panY: pan.y };
    if (mode === "add") setDraft({ x_min: p.x, y_min: p.y, x_max: p.x, y_max: p.y });
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current; if (!start) return;
    if (mode === "pan") { setPan({ x: Math.max(-size.width * zoom, Math.min(size.width * zoom, start.panX + event.clientX - start.screenX)), y: Math.max(-size.height * zoom, Math.min(size.height * zoom, start.panY + event.clientY - start.screenY)) }); return; }
    const p = point(event); setDraft({ x_min: Math.min(start.x, p.x), y_min: Math.min(start.y, p.y), x_max: Math.max(start.x, p.x), y_max: Math.max(start.y, p.y) });
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current; drag.current = null; setDraft(null);
    if (mode !== "add" || !start) return;
    const p = point(event);
    const box = clampBox({ x_min: Math.min(start.x, p.x), y_min: Math.min(start.y, p.y), x_max: Math.max(start.x, p.x), y_max: Math.max(start.y, p.y) }, current!.width, current!.height);
    if (!box || box.x_max - box.x_min < 2 || box.y_max - box.y_min < 2) return;
    const id = crypto.randomUUID(); updateEdit(value => ({ ...value, regions: [...value.regions, { id, box, enabled: true, probability: null, source: "manual" }] })); selectRegion(id);
  }
  return <div ref={viewport} className={`canvas-viewport mode-${mode}`} data-testid="viewport">
    <div ref={surface} className="canvas-surface" data-testid="image-surface" style={{ width: Math.max(1, current.width * fit), height: Math.max(1, current.height * fit), transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
      <canvas ref={output} aria-label={t("マスク後の画像", "Masked image")} data-testid="masked-canvas" />
      {compare && <div className="comparison-original" style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }}>
        {/* Local canonical Object URLs must stay in the browser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={t("比較用の元画像", "Original image for comparison")} />
      </div>}
      {compare && <div className="comparison-divider" style={{ left: `${comparison}%` }} />}
      <svg viewBox={`0 0 ${current.width} ${current.height}`} className="region-overlay" aria-label={t("顔の範囲編集", "Face region editor")} data-testid="region-overlay" style={{ touchAction: mode === "select" ? "auto" : "none" }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setDraft(null); }}>
        {edit.regions.map((region, index) => {
          const box = effectiveBox(region, edit, current.width, current.height); if (!box || (!showBounds && region.id !== selectedRegion)) return null;
          return <rect key={region.id} x={box.x_min} y={box.y_min} width={box.x_max - box.x_min} height={box.y_max - box.y_min} fill="transparent" stroke={region.id === selectedRegion ? "#f59e0b" : "#22d3ee"} strokeWidth={2 / fit / zoom} strokeDasharray={region.enabled ? undefined : `${6 / fit / zoom}`} role="button" tabIndex={0} aria-label={`${t("範囲", "Region")} ${index + 1}`} onClick={() => { if (mode === "select") selectRegion(region.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRegion(region.id); } }} />;
        })}
        {draft && <rect x={draft.x_min} y={draft.y_min} width={draft.x_max - draft.x_min} height={draft.y_max - draft.y_min} fill="#22d3ee33" stroke="#22d3ee" strokeWidth={2 / fit / zoom} />}
      </svg>
    </div>
  </div>;
}
