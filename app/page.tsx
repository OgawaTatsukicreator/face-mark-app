"use client";

import { useState } from "react";

type Screen = "upload" | "preview" | "result";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");

  return (
    <main className="min-h -screen flec items-center justify-center bg-slate-50 pc-4">
      <p>現在の画面: {screen}</p>
    </main>
  )
}