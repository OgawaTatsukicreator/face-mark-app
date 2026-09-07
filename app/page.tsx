"use client";

import { useState } from "react";

type Screen = "upload" | "preview" | "result";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");

  return (
    <main className="min-h -screen flec items-center justify-center bg-slate-50 pc-4">
      <UPloadScreen />
    </main>
  )
}

function UPloadScreen() {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="md-6 text-lg font-semibold text-slate-800">
        顔をマスクする
      </h1>
    

      <div className="flex h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-sm text-slate-500">
        ここに画像をドラック・＆・ドロップしてください
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