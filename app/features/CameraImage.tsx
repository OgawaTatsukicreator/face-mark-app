"use client";
import CameraInput from "../components/CameraInput";
import { useEditor } from "../editor-session";
export function CameraImage() { const { addFiles, loading, progress, t } = useEditor(); return <CameraInput onFiles={addFiles} disabled={loading || progress.running} t={t} />; }
