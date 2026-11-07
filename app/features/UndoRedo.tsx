"use client";
import { useEffect } from "react";
import { useEditor } from "../editor-session";
export function UndoRedo() {
  const { current, undo, redo, t } = useEditor();
  useEffect(() => { function key(event: KeyboardEvent) { const element = event.target as HTMLElement; if (element.closest('input,textarea,select,[contenteditable="true"]') || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return; event.preventDefault(); if (event.shiftKey) redo(); else undo(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [undo, redo]);
  return current && <><button data-testid="undo" disabled={!current.history.past.length} onClick={undo}>{t("元に戻す", "Undo")}</button><button data-testid="redo" disabled={!current.history.future.length} onClick={redo}>{t("やり直す", "Redo")}</button></>;
}
