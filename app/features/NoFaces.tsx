"use client";
import { useEditor } from "../editor-session";
export function NoFaces() { const { current, edit, t } = useEditor(); return current?.status === "done" && !edit?.regions.length && <p role="status">{t("顔が見つかりませんでした。手動で範囲を追加するか、別の画像を選んでください。", "No faces found. Add a region manually or choose another image.")}</p>; }
