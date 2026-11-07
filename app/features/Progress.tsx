"use client";
import { useEditor } from "../editor-session";
export function Progress() { const { progress, t } = useEditor(); if (!progress.total) return null; return <div className="progress" role="status" aria-live="polite"><p>{progress.running ? t("検出中", "Detecting") : t("検出の進捗", "Detection progress")} · {progress.completed}/{progress.total} {t("枚完了（失敗も含む）", "completed (including failures)")}</p><progress max={progress.total} value={progress.completed} aria-label={t("画像処理の進捗", "Image processing progress")} /></div>; }
