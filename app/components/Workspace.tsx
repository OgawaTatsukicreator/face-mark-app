"use client";

import { CanvasStage } from "./CanvasStage";
import { SessionMessages, useEditor } from "../editor-session";

// Feature components are added here in independently reviewable commits.
import { FileInput } from "../features/FileInput";
import { PasteImage } from "../features/PasteImage";
import { CameraImage } from "../features/CameraImage";
import { BatchDetection } from "../features/BatchDetection";
import { SampleInput } from "../features/SampleInput";
import { MultipleFaces } from "../features/MultipleFaces";
import { MaskKind } from "../features/MaskKind";
import { MaskAdjustment } from "../features/MaskAdjustment";
import { FaceSwitches } from "../features/FaceSwitches";
import { BoundsToggle } from "../features/BoundsToggle";
import { ManualRegion } from "../features/ManualRegion";
import { RegionDelete } from "../features/RegionDelete";
import { Confidence } from "../features/Confidence";
import { Download } from "../features/Download";
import { CopyOutput } from "../features/CopyOutput";
import { Comparison } from "../features/Comparison";

export function Workspace() {
  const { current, t, loading } = useEditor();
  return <main className="app-shell">
    <header className="app-header"><div><p className="eyebrow">FACE MASK STUDIO</p><h1>{t("顔を隠して、写真を共有", "Mask faces. Share your photos.")}</h1></div><div className="header-actions"></div></header>
    <section className="panel input-panel"><h2>{t("1. 画像を用意", "1. Add images")}</h2><div className="toolbar"><FileInput /><PasteImage /><CameraImage /><SampleInput /></div><p className="muted">JPEG / PNG / WebP · {t("各10 MiB以下・最大10枚", "10 MiB each · up to 10 images")}</p>{loading && <p role="status">{t("画像を読み込んでいます…", "Reading images…")}</p>}</section>

    <div className="workspace-grid"><section className="panel image-panel"><h2>{t("2. 確認・編集", "2. Review and edit")}</h2>{current && <p className="filename">{current.file.name} · {current.width} × {current.height}</p>}<div className="toolbar"><BoundsToggle /><RegionDelete /></div><CanvasStage /><Comparison /><SessionMessages /></section>
    {current && <aside className="editor-panels"><BatchDetection /><MultipleFaces /><MaskKind /><MaskAdjustment /><FaceSwitches /><ManualRegion /><Confidence /><section className="panel"><h2>{t("3. 保存・共有", "3. Save and share")}</h2><Download /><CopyOutput /></section></aside>}</div>
    <footer><p>{t("画像と編集履歴は、このページを開いている間だけ保持します。自動検出を実行すると、画像をサーバー経由で外部の顔検知サービスへ送ります。外部サービスの保存方針は運用者に確認してください。", "Images and edit history stay in this page for the current session. Running detection sends the image through the server to an external face detection service. Ask the operator about that service’s retention policy.")}</p></footer>

  </main>;
}
