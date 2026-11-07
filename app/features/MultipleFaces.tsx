"use client";
import { FaceCount, useEditor } from "../editor-session";
export function MultipleFaces() {
  const { edit, selectedRegion, selectRegion, t } = useEditor(); if (!edit) return null;
  return <section className="panel"><h2>{t("検出した顔と範囲", "Faces and regions")}</h2><FaceCount /><label className="field"><span>{t("設定の対象", "Settings target")}</span><select aria-label={t("設定の対象", "Settings target")} value={edit.regions.some(region => region.id === selectedRegion) ? selectedRegion! : ""} onChange={event => selectRegion(event.target.value || null)}><option value="">{t("画像全体の既定値", "Image defaults")}</option>{edit.regions.map((region, index) => <option key={region.id} value={region.id}>{t("範囲", "Region")} {index + 1} · {region.probability === null ? t("信頼度不明／手動", "Unknown confidence / manual") : `${Math.round(region.probability * 100)}%`}</option>)}</select></label></section>;
}
