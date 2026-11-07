"use client";
import { useEditor } from "../editor-session";
export function BatchDetection() {
  const { items, current, detect, stop, progress, loading, t } = useEditor();
  return <section className="panel"><h2>{t("顔を検出", "Detect faces")}</h2><p className="muted">{t("実行すると、画像を外部の顔検知サービスへ送信します。手動編集だけなら送信しません。", "Running detection sends images to an external face detection service. Manual editing stays local.")}</p>
    <div className="toolbar"><button className="primary" data-testid="detect-all" disabled={progress.running || loading || !items.some(item => !item.isSample && ["queued", "error"].includes(item.status))} onClick={() => void detect()}>{t("未処理の画像を順に検出", "Detect pending images")}</button>
    {current && !current.isSample && <button data-testid="detect-current" disabled={progress.running || loading} onClick={() => void detect([current.id])}>{t("この画像を再検出", "Detect this image again")}</button>}
    {progress.running && <button data-testid="stop-detection" onClick={stop}>{t("検出を中断", "Stop detection")}</button>}</div></section>;
}
