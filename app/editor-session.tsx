"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { activeRegions, clampBox, createHistory, DEFAULT_SETTINGS, editHistory, MAX_IMAGES, redoHistory, undoHistory, type EditState, type ImageItem, type MaskSettings, type Region } from "@/lib/editor";
import { createSample, prepareImage } from "@/lib/image-input";
import { renderMaskedCanvas } from "@/lib/render";

export type Translator = (ja: string, en: string) => string;
export type Preferences = { language: "ja" | "en"; theme: "system" | "light" | "dark"; settings: MaskSettings; guideSeen: boolean };
type Progress = { running: boolean; completed: number; total: number };
type Notice = { code: string; name?: string };
type Session = {
  items: ImageItem[]; current: ImageItem | null; selectedId: string | null;
  selectImage: (id: string) => void; removeImage: (id: string) => void; clearImages: () => void;
  addFiles: (files: File[]) => Promise<void>; addSample: () => Promise<void>;
  loading: boolean; progress: Progress; detect: (ids?: string[]) => Promise<void>; stop: () => void;
  edit: EditState | null; updateEdit: (update: (edit: EditState) => EditState) => void;
  selectedRegion: string | null; selectRegion: (id: string | null) => void; region: Region | null;
  undo: () => void; redo: () => void; createOutput: () => Promise<HTMLCanvasElement>;
  preferences: Preferences; setPreferences: (update: (p: Preferences) => Preferences) => void; t: Translator;
  showBounds: boolean; setShowBounds: (value: boolean) => void;
  mode: "select" | "add" | "pan"; setMode: (value: "select" | "add" | "pan") => void;
  zoom: number; setZoom: (value: number) => void; pan: { x: number; y: number }; setPan: (value: { x: number; y: number }) => void;
  compare: boolean; setCompare: (value: boolean) => void; comparison: number; setComparison: (value: number) => void;
  feedback: [string, string] | null; setFeedback: (value: [string, string] | null) => void;
  notices: Notice[];
};

const Context = createContext<Session | null>(null);
export function useEditor() { const value = useContext(Context); if (!value) throw new Error("Editor provider missing"); return value; }

export const errorText = (code: string, t: Translator) => {
  const messages: Record<string, [string, string]> = {
    FILE_TYPE: ["JPEG・PNG・WebPを選んでください。", "Choose a JPEG, PNG or WebP image."],
    FILE_SIZE: ["画像は1枚10 MiB以下にしてください。", "Each image must be 10 MiB or smaller."],
    IMAGE_SIZE: ["画像を8192px・2400万画素以下に縮小してください。", "Resize to at most 8192 px per side and 24 megapixels."],
    IMAGE_DECODE: ["画像を開けません。別の画像を選んでください。", "Cannot open this image. Choose another image."],
    IMAGE_ENCODE: ["画像を変換できません。別の画像を選んでください。", "Cannot convert this image. Choose another image."],
    LIMIT: ["セッションは最大10枚です。不要な画像を削除してください。", "A session holds up to 10 images. Remove an image to add more."],
    NOT_CONFIGURED: ["顔検出の接続設定がありません。手動で範囲を追加できます。", "Face detection is not configured. You can add regions manually."],
    TIMEOUT: ["検出が時間内に終わりませんでした。再試行するか、手動で範囲を追加してください。", "Detection timed out. Retry or add regions manually."],
    INVALID_RESPONSE: ["検出結果を読み取れませんでした。再試行するか、手動編集してください。", "The detection response was invalid. Retry or edit manually."],
    UPSTREAM_ERROR: ["顔検出に接続できません。再試行するか、手動で範囲を追加してください。", "Face detection is unavailable. Retry or add regions manually."],
    NETWORK: ["通信できません。接続を確認するか、手動で範囲を追加してください。", "Connection failed. Check your connection or add regions manually."],
    INVALID_REQUEST: ["画像を送信できませんでした。画像を選び直してください。", "Could not send the image. Select it again."],
    INVALID_IMAGE: ["画像の内容を確認できません。別の画像を選んでください。", "Cannot read the image content. Choose another image."],
    IMAGE_TOO_LARGE: ["画像を8192px・2400万画素以下に縮小してください。", "Resize to at most 8192 px per side and 24 megapixels."],
    FILE_TOO_LARGE: ["画像を10 MiB以下にしてください。", "Reduce the image to 10 MiB or smaller."],
    UNSUPPORTED_TYPE: ["JPEG・PNG・WebPを選んでください。", "Choose JPEG, PNG or WebP."],
  };
  return t(...(messages[code] ?? messages.UPSTREAM_ERROR));
};

export function EditorProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const itemRef = useRef<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRegion, selectRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputBusy = useRef(false);
  const [progress, setProgress] = useState<Progress>({ running: false, completed: 0, total: 0 });
  const requestRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const batchBusy = useRef(false);
  const mounted = useRef(true);
  const [preferences, setPreferences] = useState<Preferences>({ language: "ja", theme: "system", settings: { ...DEFAULT_SETTINGS }, guideSeen: false });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [feedback, setFeedback] = useState<[string, string] | null>(null);
  const [showBounds, setShowBounds] = useState(false);
  const [mode, setMode] = useState<"select" | "add" | "pan">("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [compare, setCompare] = useState(false);
  const [comparison, setComparison] = useState(50);
  const t = useCallback<Translator>((ja, en) => preferences.language === "ja" ? ja : en, [preferences.language]);

  const changeItems = useCallback((fn: (previous: ImageItem[]) => ImageItem[]) => {
    const next = fn(itemRef.current); itemRef.current = next; setItems(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    // These refs are request counters and resources, not DOM nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { mounted.current = false; runRef.current++; requestRef.current?.abort(); itemRef.current.forEach(item => URL.revokeObjectURL(item.url)); };
  }, []);

  function selectImage(id: string) {
    setSelectedId(id); selectRegion(null); setZoom(1); setPan({ x: 0, y: 0 }); setMode("select"); setFeedback(null);
  }
  function stop() {
    runRef.current++; requestRef.current?.abort(); requestRef.current = null; batchBusy.current = false;
    changeItems(previous => previous.map(item => item.status === "processing" ? { ...item, status: "queued" } : item));
    setProgress(previous => ({ ...previous, running: false }));
    setFeedback(["検出を中断しました。完了した結果は残っています。", "Detection stopped. Completed results are retained."]);
  }
  function removeImage(id: string) {
    if (batchBusy.current) stop();
    const removed = itemRef.current.find(item => item.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    changeItems(previous => previous.filter(item => item.id !== id));
    if (selectedId === id) { setSelectedId(itemRef.current[0]?.id ?? null); selectRegion(null); setZoom(1); setPan({ x: 0, y: 0 }); }
  }
  function clearImages() {
    if (batchBusy.current) stop();
    itemRef.current.forEach(item => URL.revokeObjectURL(item.url)); changeItems(() => []); setSelectedId(null); selectRegion(null); setFeedback(null); setNotices([]);
  }

  async function addFiles(files: File[], demoRegions?: Region[]) {
    if (inputBusy.current || batchBusy.current) return;
    inputBusy.current = true; setLoading(true); setFeedback(null);
    const issues: Notice[] = [];
    try {
      for (const file of files) {
        if (itemRef.current.length >= MAX_IMAGES) { issues.push({ code: "LIMIT" }); break; }
        try {
          const prepared = await prepareImage(file);
          if (!mounted.current) { URL.revokeObjectURL(prepared.url); break; }
          const id = crypto.randomUUID();
          const item: ImageItem = { id, ...prepared, status: demoRegions ? "done" : "queued", history: createHistory(preferences.settings, demoRegions), isSample: Boolean(demoRegions) };
          changeItems(previous => [...previous, item]); selectImage(id);
        } catch (error) { issues.push({ code: error instanceof Error ? error.message : "IMAGE_DECODE", name: file.name }); }
      }
    } finally { inputBusy.current = false; if (mounted.current) { setLoading(false); setNotices(issues); } }
  }
  async function addSample() {
    if (inputBusy.current || batchBusy.current) return;
    try { const sample = await createSample(); if (mounted.current) await addFiles([sample.file], sample.regions); }
    catch { setFeedback(["サンプルを作れませんでした。画像ファイルを選んでください。", "Could not create the sample. Choose an image file."]); }
  }

  async function detect(ids?: string[]) {
    if (batchBusy.current || inputBusy.current) return;
    const targets = itemRef.current.filter(item => !item.isSample && (ids ? ids.includes(item.id) : item.status === "queued" || item.status === "error"));
    if (!targets.length) return;
    const token = ++runRef.current; batchBusy.current = true; setFeedback(null);
    setProgress({ running: true, completed: 0, total: targets.length });
    try {
      for (let index = 0; index < targets.length; index++) {
        if (token !== runRef.current || !mounted.current) break;
        const target = targets[index]; const controller = new AbortController(); requestRef.current = controller;
        let timedOut = false;
        const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
        changeItems(previous => previous.map(item => item.id === target.id ? { ...item, status: "processing", error: undefined } : item));
        try {
          const form = new FormData(); form.append("file", target.file);
          const response = await fetch("/api/detect", { method: "POST", body: form, signal: controller.signal });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(typeof data?.code === "string" ? data.code : "UPSTREAM_ERROR");
          if (!Array.isArray(data?.result) || data.result.length > 500) throw new Error("INVALID_RESPONSE");
          const regions: Region[] = data.result.map((entry: { box?: Record<string, unknown> }) => {
            const box = entry?.box;
            if (!box || ![box.x_min, box.y_min, box.x_max, box.y_max].every(value => typeof value === "number" && Number.isFinite(value))) throw new Error("INVALID_RESPONSE");
            const bounded = clampBox(box as unknown as Region["box"], target.width, target.height);
            if (!bounded || (box.probability != null && (typeof box.probability !== "number" || !Number.isFinite(box.probability) || box.probability < 0 || box.probability > 1))) throw new Error("INVALID_RESPONSE");
            return { id: crypto.randomUUID(), box: bounded, probability: box.probability as number | null ?? null, enabled: true, source: "detected" };
          });
          if (token !== runRef.current || !mounted.current) break;
          changeItems(previous => previous.map(item => item.id === target.id ? { ...item, status: "done", error: undefined, history: editHistory(item.history, { ...item.history.present, regions: [...item.history.present.regions.filter(region => region.source === "manual"), ...regions] }) } : item));
        } catch (error) {
          if (token !== runRef.current || !mounted.current) break;
          const code = timedOut ? "TIMEOUT" : error instanceof Error && error.name !== "TypeError" ? error.message : "NETWORK";
          changeItems(previous => previous.map(item => item.id === target.id ? { ...item, status: "error", error: code } : item));
        } finally { window.clearTimeout(timeout); }
        if (token === runRef.current && mounted.current) setProgress({ running: true, completed: index + 1, total: targets.length });
      }
    } finally {
      if (token === runRef.current && mounted.current) { batchBusy.current = false; requestRef.current = null; setProgress(previous => ({ ...previous, running: false })); }
    }
  }

  const current = items.find(item => item.id === selectedId) ?? items[0] ?? null;
  const edit = current?.history.present ?? null;
  const region = edit?.regions.find(item => item.id === selectedRegion) ?? null;
  function updateEdit(update: (value: EditState) => EditState) {
    if (!current) return;
    changeItems(previous => previous.map(item => item.id === current.id ? { ...item, history: editHistory(item.history, update(item.history.present)) } : item));
    setFeedback(null);
  }
  function undo() { if (current) changeItems(previous => previous.map(item => item.id === current.id ? { ...item, history: undoHistory(item.history) } : item)); }
  function redo() { if (current) changeItems(previous => previous.map(item => item.id === current.id ? { ...item, history: redoHistory(item.history) } : item)); }
  async function createOutput() {
    if (!current) throw new Error("NO_IMAGE");
    const image = new Image(); image.src = current.url; await image.decode();
    return renderMaskedCanvas(image, current.width, current.height, current.history.present);
  }
  const value: Session = { items, current, selectedId, selectImage, removeImage, clearImages, addFiles, addSample, loading, progress, detect, stop, edit, updateEdit, selectedRegion, selectRegion, region, undo, redo, createOutput, preferences, setPreferences, t, showBounds, setShowBounds, mode, setMode, zoom, setZoom, pan, setPan, compare, setCompare, comparison, setComparison, feedback, setFeedback, notices };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function SessionMessages() {
  const { notices, feedback, t, current } = useEditor();
  return <div className="messages" aria-live="polite">
    {notices.map((notice, index) => <p role="alert" key={index}>{notice.name ? `${notice.name}: ` : ""}{errorText(notice.code, t)}</p>)}
    {current?.error && <p role="alert">{errorText(current.error, t)}</p>}
    {feedback && <p role="status">{t(...feedback)}</p>}
  </div>;
}

export function FaceCount() {
  const { edit, t, current } = useEditor();
  if (!edit) return null;
  return <p className="muted" data-testid="face-count">{t("検出", "Detected")}: {edit.regions.filter(region => region.source === "detected").length} · {t("手動", "Manual")}: {edit.regions.filter(region => region.source === "manual").length} · {t("適用", "Masked")}: {activeRegions(edit).length}{current?.isSample && <> · {t("図形サンプル・デモ範囲（自動検出なし）", "Illustrated sample · demo regions (no detection)")}</>}</p>;
}
