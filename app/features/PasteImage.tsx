"use client";
import PasteInput from "../components/PasteInput";
import { useEditor } from "../editor-session";
export function PasteImage() { const { addFiles, loading, progress, t } = useEditor(); return <PasteInput onFiles={addFiles} disabled={loading || progress.running} t={t} />; }
