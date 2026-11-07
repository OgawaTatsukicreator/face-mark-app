"use client";
import type { MaskKind as Kind } from "@/lib/editor";
import { useEditor } from "../editor-session";
export function MaskKind() {
  const { edit, region, updateEdit, t } = useEditor(); if (!edit) return null;
  return <section className="panel"><h2>{t("マスクの種類", "Mask style")}</h2><p className="muted">{region ? t("選択した範囲だけを変更します。", "Changes apply to the selected region.") : t("個別設定のない範囲へ適用します。", "Applies to regions without an override.")}</p><label className="field"><span>{t("種類", "Style")}</span><select data-testid="mask-kind" value={region?.settings?.kind ?? edit.settings.kind} onChange={event => { const kind = event.target.value as Kind; updateEdit(value => region ? { ...value, regions: value.regions.map(item => item.id === region.id ? { ...item, settings: { ...item.settings, kind } } : item) } : { ...value, settings: { ...value.settings, kind } }); }}>
    <option value="solid">{t("単色（黒塗り）", "Solid color")}</option><option value="mosaic">{t("モザイク", "Mosaic")}</option><option value="blur">{t("ぼかし", "Blur")}</option><option value="stamp">{t("スタンプ", "Stamp")}</option></select></label></section>;
}
