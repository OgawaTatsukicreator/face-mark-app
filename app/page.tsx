"use client"; //このファイルがブラウザ側で実行されるコンポーネントであることをNext.jsに伝える

import { useState, DragEvent } from "react"; //useState→Reactフック、DragEvent→D&D機能の実装にあたっての型定義

type Step = "upload" | "preview" | "masked"; //画面遷移状態を表すUnion型

export default function ImageProcessor(){
  //現在のステップを管理(初期値は""upload")
  const [step, setStep] = useState<Step>("upload"); //画面遷移のステータス確認
  const [image, setImage] = useState<File | null>(null); //写真がアップロードされているか
  const [isDragAction, setIsDragActive] = useState(false); //ドラックアクションの判定

  //ドラック系のイベントハンドラー
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if(e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    }else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };


}
