"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";

type Screen = "upload" | "preview" | "result";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return;
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
    setScreen("preview");
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

  return (
    <main className="min-h -screen flec items-center justify-center bg-slate-50 pc-4">
      {screen === "upload" && (
        <UploadScreen
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onFileChange={handleFileChange}
        />
      )}
      {screen === "preview" && <p>preview画面</p>}
    </main>
  );
};

function UploadScreen({
  onDrop,
  onDragOver,
  onFileChange,
}: {
  onDrop: (e:DragEvent<HTMLDivElement>) => void;
  onDragOver: (e:DragEvent<HTMLDivElement>) => void;
  onFileChange: (e:ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="md-6 text-lg font-semibold text-slate-800">
        顔をマスクする
      </h1>
    

      <div 
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
        className="flex h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-sm text-slate-500">
        ここに画像をドラック・＆・ドロップしてください
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
      </div>

      <div className="mt-6 flex gap-3">
        <button className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400">
          画像を削除
        </button>
        <button className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          画像を送信
        </button>
      </div>
    </div>
  );
}