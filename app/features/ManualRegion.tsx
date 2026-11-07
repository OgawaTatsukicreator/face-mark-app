"use client";
import { useEditor } from "../editor-session";
export function ManualRegion() {
  const { current, mode, setMode, updateEdit, selectRegion, t } = useEditor(); if (!current) return null;
  return <section className="panel"><h2>{t("手動で範囲を追加", "Add a region manually")}</h2><div className="toolbar"><button data-testid="manual-add-mode" aria-pressed={mode === "add"} onClick={() => setMode(mode === "add" ? "select" : "add")}>{mode === "add" ? t("範囲追加を終了", "Finish drawing") : t("画像をドラッグして追加", "Draw a region")}</button><button data-testid="add-center-region" onClick={() => { const id = crypto.randomUUID(); updateEdit(value => ({ ...value, regions: [...value.regions, { id, source: "manual", probability: null, enabled: true, box: { x_min: current.width * .35, y_min: current.height * .3, x_max: current.width * .65, y_max: current.height * .7 } }] })); selectRegion(id); }}>{t("中央に範囲を追加", "Add a centered region")}</button></div><p className="muted">{t("指やマウスで囲めます。中央に追加して数値で位置を調整することもできます。", "Draw with a finger or mouse, or add a centered region and adjust its coordinates.")}</p></section>;
}
