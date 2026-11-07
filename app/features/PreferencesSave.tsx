"use client";
import { useEffect, useState } from "react";
import { sanitizeSettings } from "@/lib/editor";
import { useEditor, type Preferences } from "../editor-session";
const STORAGE_KEY = "face-mask-preferences-v1";
export function PreferencesSave() {
  const { preferences, setPreferences, edit, t } = useEditor(); const [ready, setReady] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const data = JSON.parse(raw); if (data && data.version === 1) { const restored: Preferences = { language: data.language === "en" ? "en" : "ja", theme: ["system", "light", "dark"].includes(data.theme) ? data.theme : "system", settings: sanitizeSettings(data.settings), guideSeen: data.guideSeen === true }; setPreferences(() => restored); } } }
    catch { /* Storage may be unavailable or contain invalid JSON; keep usable defaults. */ }
    // Hydrate browser-only preferences after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [setPreferences]);
  // A storage failure is external state; report it after attempting synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!ready) return; try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, language: preferences.language, theme: preferences.theme, settings: sanitizeSettings(preferences.settings), guideSeen: preferences.guideSeen })); } catch { setFailed(true); } }, [preferences, ready]);
  return <div className="preferences-save"><button disabled={!edit} onClick={() => { if (edit) setPreferences(value => ({ ...value, settings: sanitizeSettings(edit.settings) })); }}>{t("このマスク設定を次回も使う", "Remember these mask defaults")}</button>{failed && <p className="muted" role="status">{t("設定を保存できません。このページでは利用できます。", "Preferences cannot be saved. You can still use this page.")}</p>}</div>;
}
