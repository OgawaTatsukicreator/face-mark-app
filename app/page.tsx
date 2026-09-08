"use client";

import { useRef, useState, DragEvent, ChangeEvent, useEffect } from "react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Screen = "upload" | "preview" | "result";
type Box = {
  x_min: Number;
  y_min: Number;
  x_max: Number;
  y_max: Number;
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

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

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setScreen("upload");
  };

  // 今はダミー。実際のAPI連携(/api/detect呼び出し)は明日(9/8)実装する
  const handleMask = async () => {
    if (!file) return;

    setIsLoading(true);
    setApiError(null)

    try {
      const formData = new FormData();
      formData.append("file",file);

      const response = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("サーバーエラー(ステータス: ${response.status}) ");
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        setApiError("顔が検出されませんでした");
        setIsLoading(false);
        return;
      }

      setBox(data.result[0].box);
      setScreen("result");
    } catch (err) {
      console.error("マスク処理エラー:", err);
      setApiError("通信に失敗しました。もう一度お試しください");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setScreen("preview");
  };

  // 画面3表示時、元画像をCanvasに描画する（マスク処理自体は明日以降）
  useEffect(() => {
    if (screen !== "result" || !previewUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      // TODO: APIから取得したbox座標をもとにマスクを描画する（次工程）
    };
    img.src = previewUrl;
  }, [screen, previewUrl]);

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
      {screen === "result" && (
        <ResultScreen canvasRef={canvasRef} onBack={handleBack} />
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
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
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
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
        マスク結果
      </h1>

      <div className="flex h-48 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
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