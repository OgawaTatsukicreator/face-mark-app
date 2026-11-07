"use client";
import { useEditor } from "../editor-session";
export function SampleInput() { const { addSample, loading, progress, t } = useEditor(); return <button disabled={loading || progress.running} onClick={() => void addSample()}>{t("サンプルで試す", "Try the sample")}</button>; }
