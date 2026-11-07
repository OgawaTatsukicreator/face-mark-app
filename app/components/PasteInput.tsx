"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type PasteInputProps = {
  onFiles: (files: File[]) => Promise<void> | void;
  disabled?: boolean;
  t: (ja: string, en: string) => string;
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PASTE_MESSAGES = {
  unavailable: ["この環境では貼り付けボタンを使えません。Ctrl／Cmd+Vを押すか、画像を選ぶボタンを使ってください。", "The paste button is unavailable here. Press Ctrl/Cmd+V or use Choose images instead."],
  add: ["貼り付けた画像を追加できませんでした。画像を選ぶボタンから追加してください。", "The pasted image could not be added. Please use Choose images instead."],
  empty: ["クリップボードに対応する画像がありません。画像をコピーしてから試すか、ファイルを選んでください。", "No supported image was found on the clipboard. Copy an image first or choose a file instead."],
  read: ["クリップボードを読み取れませんでした。権限を確認し、Ctrl／Cmd+Vを押すか、画像を選んでください。", "The clipboard could not be read. Check permissions, press Ctrl/Cmd+V, or choose an image instead."],
} as const;

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable || Boolean(target.closest("input, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']"))
  );
}

function clipboardFile(blob: Blob, type: string, index: number) {
  const extension = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  return new File([blob], `clipboard-${Date.now()}-${index + 1}.${extension}`, { type });
}

export default function PasteInput({ onFiles, disabled = false, t }: PasteInputProps) {
  const latest = useRef({ onFiles, disabled });
  const mounted = useRef(false);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<keyof typeof PASTE_MESSAGES | null>(null);
  const [previousDisabled, setPreviousDisabled] = useState(disabled);

  if (previousDisabled !== disabled) {
    setPreviousDisabled(disabled);
    if (disabled) setBusy(false);
  }

  useLayoutEffect(() => {
    latest.current = { onFiles, disabled };
    if (disabled) {
      generation.current += 1;
      busyRef.current = false;
    }
  }, [onFiles, disabled]);

  useEffect(() => {
    mounted.current = true;
    function isCurrent(token: number) {
      return mounted.current && generation.current === token && !latest.current.disabled;
    }
    async function handlePaste(event: ClipboardEvent) {
      if (event.defaultPrevented || latest.current.disabled || busyRef.current || isTextInput(event.target)) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      let files = Array.from(clipboard.files).filter((file) => IMAGE_TYPES.includes(file.type));
      if (files.length === 0) {
        files = Array.from(clipboard.items)
          .filter((item) => item.kind === "file" && IMAGE_TYPES.includes(item.type))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
      }
      if (files.length === 0) return;
      event.preventDefault();
      const token = ++generation.current;
      busyRef.current = true;
      setBusy(true);
      setMessage(null);
      try {
        if (isCurrent(token)) await latest.current.onFiles(files);
      } catch {
        if (isCurrent(token)) setMessage("add");
      } finally {
        if (isCurrent(token)) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.removeEventListener("paste", handlePaste);
    };
  }, []);

  async function readClipboard() {
    if (disabled || latest.current.disabled || busyRef.current) return;
    setMessage(null);
    if (!window.isSecureContext || typeof navigator.clipboard?.read !== "function") {
      setMessage("unavailable");
      return;
    }
    const token = ++generation.current;
    busyRef.current = true;
    setBusy(true);
    const isCurrent = () => mounted.current && generation.current === token && !latest.current.disabled;
    try {
      const items = await navigator.clipboard.read();
      if (!isCurrent()) return;
      const files: File[] = [];
      for (const item of items) {
        // ClipboardItem may expose one picture as multiple formats; take only its best format.
        const type = IMAGE_TYPES.find((candidate) => item.types.includes(candidate));
        if (!type) continue;
        const blob = await item.getType(type);
        if (!isCurrent()) return;
        files.push(clipboardFile(blob, type, files.length));
      }
      if (!isCurrent()) return;
      if (files.length === 0) {
        setMessage("empty");
        return;
      }
      await latest.current.onFiles(files);
    } catch {
      if (isCurrent()) setMessage("read");
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="paste-input">
      <button type="button" onClick={readClipboard} disabled={disabled || busy}>
        {busy ? t("画像を準備中…", "Preparing image…") : t("画像を貼り付け", "Paste image")}
      </button>
      <p className="input-hint">{t("画像をコピーしてCtrl／Cmd+Vでも追加できます。", "You can also copy an image and press Ctrl/Cmd+V.")}</p>
      {message && <p role="status">{t(PASTE_MESSAGES[message][0], PASTE_MESSAGES[message][1])}</p>}
    </div>
  );
}
