"use client";
import { patchRegionSettings, sanitizeSettings, type MaskSettings } from "@/lib/editor";
import { useEditor } from "../editor-session";
export function MaskAdjustment() {
  const { edit, region, current, updateEdit, t } = useEditor(); if (!edit || !current) return null;
  const settings = sanitizeSettings({ ...edit.settings, ...region?.settings });
  function setting(patch: Partial<MaskSettings>) { updateEdit(value => region ? { ...value, regions: value.regions.map(item => item.id === region.id ? patchRegionSettings(item, value.settings, patch) : item) } : { ...value, settings: sanitizeSettings({ ...value.settings, ...patch }) }); }
  function geometry(field: "x" | "y" | "width" | "height", number: number) {
    if (!region || !Number.isFinite(number)) return;
    const box = region.adjustment ?? region.box; let width = box.x_max - box.x_min; let height = box.y_max - box.y_min; let x = box.x_min; let y = box.y_min;
    if (field === "x") x = Math.max(0, Math.min(current!.width - width, number));
    if (field === "y") y = Math.max(0, Math.min(current!.height - height, number));
    if (field === "width") width = Math.max(1, Math.min(current!.width - x, number));
    if (field === "height") height = Math.max(1, Math.min(current!.height - y, number));
    updateEdit(value => ({ ...value, regions: value.regions.map(item => item.id === region.id ? { ...item, adjustment: { x_min: x, y_min: y, x_max: x + width, y_max: y + height } } : item) }));
  }
  const box = region?.adjustment ?? region?.box;
  return <section className="panel"><details><summary>{t("色・強さ・位置を調整", "Adjust color, strength and position")}</summary>
    <label className="field"><span>{t("色", "Color")}</span><input type="color" value={settings.color} onChange={event => setting({ color: event.target.value })} /></label>
    <label className="field"><span>{t("不透明度", "Opacity")} · {Math.round(settings.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={settings.opacity} onChange={event => setting({ opacity: Number(event.target.value) })} /></label>
    <label className="field"><span>{t("範囲の拡大率", "Mask scale")} · {settings.scale.toFixed(2)}</span><input type="range" min="0.5" max="2" step="0.05" value={settings.scale} onChange={event => setting({ scale: Number(event.target.value) })} /></label>
    <label className="field"><span>{t("モザイクの粗さ", "Mosaic block size")} · {settings.pixelSize}px</span><input type="range" min="2" max="80" step="1" value={settings.pixelSize} onChange={event => setting({ pixelSize: Number(event.target.value) })} /></label>
    <label className="field"><span>{t("ぼかしの強さ", "Blur radius")} · {settings.blurRadius}px</span><input type="range" min="1" max="60" step="1" value={settings.blurRadius} onChange={event => setting({ blurRadius: Number(event.target.value) })} /></label>
    {region && box && <><h3>{t("選択範囲の位置とサイズ（px）", "Selected region geometry (px)")}</h3><div className="numeric-grid">{([ ["x", "X", box.x_min], ["y", "Y", box.y_min], ["width", t("幅", "Width"), box.x_max - box.x_min], ["height", t("高さ", "Height"), box.y_max - box.y_min] ] as const).map(([key, label, number]) => <label className="field" key={key}><span>{label}</span><input type="number" min={key === "width" || key === "height" ? 1 : 0} max={key === "y" || key === "height" ? current.height : current.width} value={Math.round(number)} onChange={event => geometry(key, Number(event.target.value))} /></label>)}</div><button onClick={() => updateEdit(value => ({ ...value, regions: value.regions.map(item => item.id === region.id ? { ...item, settings: undefined, adjustment: undefined } : item) }))}>{t("この範囲の個別調整をリセット", "Reset this region’s overrides")}</button></>}
    <p className="muted">{t("薄いマスク・弱いぼかし・細かいモザイク・範囲縮小では顔が見える場合があります。保存前に確認してください。", "Low opacity, weak blur, fine mosaics or small regions may reveal faces. Review before saving.")}</p>
  </details></section>;
}
