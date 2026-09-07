"use client";

import { useRef, useState, DragEvent, ChangeEvent, useEffect } from "react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Screen = "upload" | "preview" | "result";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return;

    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setError("画像ファイル（jpg / png / webp）を選択してください");
      return;
    }

    setError(null);
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
    setScreen("preview");
  };

  const handleRemove = () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  setFile(null);
  setPreviewUrl(null);
  setError(null);
  setScreen("upload");
};

const handleMask = () => {
  // 今はダミー
  console.log("画像をマスクボタンが押されました");
};

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const canvasRef = useRef<HTMLCanvasElement>(null)

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      {screen === "upload" && (
        <UploadScreen
          error={error}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onFileChange={handleFileChange}
        />
      )}
      {screen === "preview" && previewUrl && (
        <PreviewScreen
          previewUrl={previewUrl}
          onRemove={handleRemove}
          onMask={handleMask}
        />
      )}
    </main>
  );
}

function UploadScreen({
  error,
  onDrop,
  onDragOver,
  onFileChange,
}: {
  error: string | null;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
        顔をマスクする
      </h1>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
        className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-sm text-slate-500 hover:border-slate-400 hover:bg-slate-50"
      >
        ここに画像をドラッグ・アンド・ドロップしてください
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          disabled
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
        >
          画像を削除
        </button>
        <button
          disabled
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-40"
        >
          画像を送信
        </button>
      </div>
    </div>
  );
}

function PreviewScreen({
  previewUrl,
  onRemove,
  onMask,
}: {
  previewUrl: string;
  onRemove: () => void;
  onMask: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1>
        顔をマスクする
      </h1>
    

      <div className="flex h-48 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <img
          src={previewUrl}
          alt="アップロードされた画像のプレビュー"
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onRemove}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          画像を削除
        </button>
        <button
          onClick={onMask}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          画像をマスク
        </button>
      </div>
    </div>
  );
}

function ResultScreen({
  canvasRef,
  onBack
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
        マスク結果
      </h1>

      <div>
        <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
      </div>

      <button
        onClick={onBack}
        className="mt-6 w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        戻る
      </button>
    </div>
  )
}