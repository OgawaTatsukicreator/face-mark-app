"use client";
import { useEditor } from "../editor-session";
export function FaceSwitches() {
  const { edit, updateEdit, selectedRegion, selectRegion, t } = useEditor(); if (!edit?.regions.length) return null;
  return <section className="panel"><h2>{t("顔ごとにマスク", "Mask individual faces")}</h2><div className="face-list">{edit.regions.map((region, index) => <div className="face-row" key={region.id}><input data-testid={`face-toggle-${index + 1}`} type="checkbox" checked={region.enabled} aria-label={t(`範囲 ${index + 1} をマスク`, `Mask region ${index + 1}`)} onChange={event => { const enabled = event.target.checked; updateEdit(value => ({ ...value, regions: value.regions.map(item => item.id === region.id ? { ...item, enabled } : item) })); }} /><button data-testid={`face-select-${index + 1}`} aria-pressed={selectedRegion === region.id} onClick={() => selectRegion(region.id)}>{t("範囲", "Region")} {index + 1} · {region.enabled ? "ON" : "OFF"}</button></div>)}</div><button onClick={() => selectRegion(null)}>{t("画像全体の設定へ", "Edit image defaults")}</button></section>;
}
