"use client";
import { useEffect } from "react";
import { useEditor } from "../editor-session";
export function Language() { const { preferences, setPreferences, t } = useEditor(); useEffect(() => { document.documentElement.lang = preferences.language; }, [preferences.language]); return <label><span className="sr-only">{t("言語", "Language")}</span><select data-testid="language" aria-label={t("言語", "Language")} value={preferences.language} onChange={event => setPreferences(value => ({ ...value, language: event.target.value as "ja" | "en" }))}><option value="ja">日本語</option><option value="en">English</option></select></label>; }
