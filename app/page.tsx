"use client";
 
import { useRef, useState, DragEvent, ChangeEvent, useEffect,} from "react";
 
// 受け付ける画像形式（これ以外はacceptFileでエラーにする）
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
 
// 画面遷移図の3画面に対応するstate
type Screen = "upload" | "preview" | "result";
 
// 顔検知APIから返ってくる座標情報の型
// 【修正】Number(大文字)→number(小文字)に変更。
// 大文字のNumberはJSの組み込みオブジェクト型を指すため、
// 数値そのものを表すTypeScriptの型としては小文字が正しい。
type Box = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};


function drawMask(ctx: CanvasRenderingContext2D, box: Box) {
  const width = box.x_max - box.x_min;
  const height = box.y_max - box.y_min;

  const size = Math.min(width, height) * 1.1; //スタンプ崩れ防止と1.1倍によって幅の余裕を持たせる
  const centerX = box.x_min + width / 2;
  const centerY = box.y_min + height / 2;

  ctx.font = `${size}px sans-serif`;

  // 文字の描画位置を中央基準にする（デフォルトは左上基準なので調整が必要）
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText("😊", centerX, centerY);
}

export default function Home() {
  // ---- 画面遷移・ファイル関連のstate ----
  const [screen, setScreen] = useState<Screen>("upload");
  const [file, setFile] = useState<File | null>(null); // 選択された生のFileオブジェクト（APIへの送信に使う）
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // <img>表示用の一時URL
  const [error, setError] = useState<string | null>(null); // ファイル形式・サイズ等のバリデーションエラー
  const canvasRef = useRef<HTMLCanvasElement>(null); // 画面3のcanvas要素への参照
 
  // ---- 9/8で追加：顔検知API連携用のstate ----
  const [isLoading, setIsLoading] = useState(false); // API通信中かどうか（ボタンの無効化・表示切替に使う）
  const [boxes, setBoxes] = useState<Box[]>([]); // boxを配列で扱うようにする
  const [apiError, setApiError] = useState<string | null>(null); // API通信で発生したエラーメッセージ
 
  // ---- ファイルを受け取った時の共通処理（D&Dでもダイアログ選択でも共通） ----
  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return; // ファイルが選ばれなかった場合は何もしない（キャンセル等）
 
    // 画像形式チェック：ACCEPTED_TYPESに含まれない場合はエラー表示して処理を止める
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setError("画像ファイル（jpg / png / webp）を選択してください");
      return;
    }

    //ファイルサイズチェック
    if (candidate.size > MAX_FILE_SIZE) {
      setError("ファイルサイズが大きすぎます(10MB以下にしてください)");
      return;
    }
 
    setError(null);
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate)); // ブラウザ内だけで有効な一時URLを発行
    setScreen("preview"); // 画面遷移図：D&D/選択 → 画面2へ
  };
 
  // ドロップ時のハンドラ：ブラウザのデフォルト動作（画像を別タブで開く等）を止めてacceptFileに渡す
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    acceptFile(e.dataTransfer.files?.[0]);
  };
 
  // ドラッグ中の要素がドロップ領域の上を通過している間、常に呼ばれる
  // ここでpreventDefaultしないと、onDropイベント自体が発火しない仕様のため必須
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
 
  // 通常のファイル選択ダイアログ（<input type="file">）から選んだ場合のハンドラ
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };
 
  // 「画像を削除」ボタン押下時：状態を全部リセットしてアップロード画面に戻る
  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl); // メモリリーク防止：発行した一時URLを解放
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setBoxes([]); // 前回のマスク結果を引きずらないようにリセット
    setApiError(null); // 前回のAPIエラーメッセージもリセット
    setScreen("upload"); // 画面遷移図：画像を削除 → 画面1へ戻る
  };
 
  // 「画像をマスク」ボタン押下時：バックエンド(/api/detect)へ画像を送信し、顔の座標を取得する
  const handleMask = async () => {
    if (!file) return; // 念のためのガード（通常はfileがある状態でしかこのボタンは押せない）
 
    setIsLoading(true); // 通信開始：ボタンを無効化し「処理中...」表示に切り替える
    setApiError(null); // 前回のエラー表示をクリア
 
    try {
      // ブラウザ→自分のバックエンド(API Route)への送信データを作成
      const formData = new FormData();
      formData.append("file", file);
 
      // 自分のバックエンド(/api/detect)へPOST
      // ※ここで直接外部の顔検知APIを叩かないのは、APIキーをブラウザに露出させないため
      const response = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });
 
      // ステータスが200番台以外は異常とみなし、catchブロックに処理を移す
      // 【修正】ダブルクォート("...")のままだと${response.status}が展開されず
      // 文字列そのまま出力されてしまうため、バッククォート(`...`)に変更。
      if (!response.ok) {
        throw new Error(`サーバーエラー（ステータス: ${response.status}）`);
      }
 
      const data = await response.json();
      
      // resultが配列であることを確認してから中身を見る
      if (!Array.isArray(data.result)) {
        setApiError("サーバーからの応答が正しくありませんでした");
        setIsLoading(false);
        return;
      }
 
      // 顔検知APIの仕様上、顔が見つからない場合はresultが空配列で返ってくる
      if (!data.result || data.result.length === 0) {
        setApiError("顔が検出されませんでした");
        setIsLoading(false);
        return;
      }
 
      // 正常に座標が取得できた場合：検出された全ての顔の座標を保存する
      const detectedBoxes = data.result.map((r: {box: Box }) => r.box);
      setBoxes(detectedBoxes);
      setScreen("result"); // 画面遷移図：画像をマスク → 画面3へ
    } catch (err) {
      // ネットワーク切断、サーバーダウンなど、fetch自体が失敗した場合もここに来る
      console.error("マスク処理エラー:", err); // 開発者向け：詳細はコンソールにのみ出す
      setApiError("通信に失敗しました。もう一度お試しください"); // ユーザー向け：詳細を出さず簡潔に
    } finally {
      // 成功・失敗・途中return、どのルートを通っても最後に必ず通る
      // ボタンの無効化状態を解除し忘れないようにするための保険
      setIsLoading(false);
    }
  };
 
  // 「戻る」ボタン押下時：結果画面からプレビュー画面へ戻る
  const handleBack = () => {
    setScreen("preview"); // 画面遷移図：戻る → 画面2へ
  };
 
  // 画面3（結果画面）が表示されたタイミングで、canvasに元画像を描画する
  // マスク自体の描画（box座標を使った矩形描画など）は次工程で実装予定
  useEffect(() => {
    if (screen !== "result" || !previewUrl || !canvasRef.current) return;
 
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
 
    const img = new Image();
    img.onload = () => {
      // canvasのサイズを元画像の実サイズに合わせる
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      boxes.forEach((box) => {
        drawMask(ctx, box);
      })
 
      // 【動作確認用ログ】画像サイズとbox座標の関係を目視で確認するためのもの。
      // 座標データ取得の確認が済んだら削除してよい。
      console.log("画像サイズ:", img.width, img.height);
      console.log("box座標:", boxes);
    };
    img.src = previewUrl;
    // 【修正】boxが更新されたタイミングでも再実行されるよう依存配列に追加。
    // 元のコードはscreenとpreviewUrlのみだったため、
    // box更新のタイミング次第では古い値を参照するリスクがあった。
  }, [screen, previewUrl, boxes]);
 
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      {/* 画面1：アップロード画面 */}
      {screen === "upload" && (
        <UploadScreen
          error={error}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onFileChange={handleFileChange}
        />
      )}
 
      {/* 画面2：プレビュー画面（previewUrlがある場合のみ表示） */}
      {screen === "preview" && previewUrl && (
        <PreviewScreen
          previewUrl={previewUrl}
          onRemove={handleRemove}
          onMask={handleMask}
          isLoading={isLoading}
          apiError={apiError}
        />
      )}
 
      {/* 画面3：マスク結果画面 */}
      {screen === "result" && (
        <ResultScreen canvasRef={canvasRef} onBack={handleBack} />
      )}
    </main>
  );
}
 
// ============================================================
// 画面1: アップロード画面
// ============================================================
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
  // 非表示の<input type="file">をクリックさせるための参照
  const inputRef = useRef<HTMLInputElement>(null);
 
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
        顔をマスクする
      </h1>
 
      {/* ドロップ領域。クリックでもファイル選択ダイアログが開くようにしている */}
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
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
          className="hidden" // 見た目上は非表示。クリックはdiv側で拾う
        />
      </div>
 
      {/* バリデーションエラー表示 */}
      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
 
      {/*
        画面遷移図上は存在するが、実際の遷移はドロップ/選択で自動的に行われるため
        現状は見た目だけのボタン（disabled）にしている
      */}
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
 
// ============================================================
// 画面2: プレビュー画面
// ============================================================
function PreviewScreen({
  previewUrl,
  onRemove,
  onMask,
  isLoading,
  apiError,
}: {
  previewUrl: string;
  onRemove: () => void;
  onMask: () => void;
  isLoading: boolean; // true の間はボタンを無効化し多重送信を防ぐ
  apiError: string | null; // API通信のエラーメッセージ（あれば赤字表示）
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
        顔をマスクする
      </h1>
 
      {/* 選択済み画像のプレビュー表示 */}
      <div className="flex h-48 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <img
          src={previewUrl}
          alt="アップロードされた画像のプレビュー"
          className="max-h-full max-w-full object-contain"
        />
      </div>
 
      {/* API通信エラー表示（顔未検出・通信失敗など） */}
      {apiError && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {apiError}
        </p>
      )}
 
      <div className="mt-6 flex gap-3">
        <button
          onClick={onRemove}
          disabled={isLoading} // 通信中は削除も禁止（状態の整合性を保つため）
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          画像を削除
        </button>
        <button
          onClick={onMask}
          disabled={isLoading} // 通信中は再送信を禁止
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {isLoading ? "処理中..." : "画像をマスク"}
        </button>
      </div>
    </div>
  );
}
 
// ============================================================
// 画面3: マスク結果画面
// ============================================================
function ResultScreen({
  canvasRef,
  onBack,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-lg font-semibold text-slate-800">
        マスク結果
      </h1>
 
      {/* 元画像＋（将来的には）マスク済みの状態を描画するcanvas */}
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
  );
}