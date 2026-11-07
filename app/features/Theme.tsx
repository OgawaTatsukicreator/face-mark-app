"use client";
import { useEffect } from "react";
import { useEditor, type Preferences } from "../editor-session";
export function Theme() {
  const { preferences, setPreferences, t } = useEditor();
  useEffect(() => { const media = window.matchMedia("(prefers-color-scheme: dark)"); function apply() { document.documentElement.dataset.theme = preferences.theme === "system" ? media.matches ? "dark" : "light" : preferences.theme; } apply(); media.addEventListener("change", apply); return () => media.removeEventListener("change", apply); }, [preferences.theme]);
  return <label><span className="sr-only">{t("テーマ", "Theme")}</span><select data-testid="theme" aria-label={t("テーマ", "Theme")} value={preferences.theme} onChange={event => setPreferences(value => ({ ...value, theme: event.target.value as Preferences["theme"] }))}><option value="system">{t("OSに合わせる", "System theme")}</option><option value="light">{t("ライト", "Light")}</option><option value="dark">{t("ダーク", "Dark")}</option></select></label>;
}
