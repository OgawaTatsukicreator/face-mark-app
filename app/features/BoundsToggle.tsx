"use client";
import { useEditor } from "../editor-session";
export function BoundsToggle() { const { showBounds, setShowBounds, current, t } = useEditor(); return current && <label className="check"><input data-testid="show-bounds" type="checkbox" checked={showBounds} onChange={event => setShowBounds(event.target.checked)} />{t("検出枠を表示", "Show detection bounds")}</label>; }
