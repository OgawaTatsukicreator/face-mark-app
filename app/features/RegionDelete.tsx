"use client";
import { useEditor } from "../editor-session";
export function RegionDelete() { const { region, updateEdit, selectRegion, t } = useEditor(); return <button data-testid="delete-region" disabled={!region} onClick={() => { if (region) { updateEdit(value => ({ ...value, regions: value.regions.filter(item => item.id !== region.id) })); selectRegion(null); } }}>{t("選択範囲を削除", "Delete selected region")}</button>; }
