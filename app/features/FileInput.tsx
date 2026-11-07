"use client";
import { useRef } from "react";
import { useEditor } from "../editor-session";
export function FileInput() {
  const { addFiles, loading, progress, t } = useEditor(); const input = useRef<HTMLInputElement>(null);
  return <div className="drop-area" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); }}>
    <button className="primary" disabled={loading || progress.running} onClick={() => input.current?.click()}>{t("画像を選ぶ", "Choose images")}</button>
    <span className="muted"> {t("ここにドラッグ＆ドロップもできます", "You can also drag and drop here")}</span>
    <input ref={input} className="sr-only" tabIndex={-1} type="file" multiple accept="image/jpeg,image/png,image/webp" data-testid="file-input" aria-label={t("画像ファイル", "Image files")} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addFiles(files); }} />
  </div>;
}
