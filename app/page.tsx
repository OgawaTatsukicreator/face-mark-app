"use client";
 
import { useRef, useState, DragEvent, ChangeEvent, useEffect,} from "react";
 
// 受け付ける画像形式（これ以外はacceptFileでエラーにする）
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_COUNT = 10 //一括アップロードの上限
 
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

// 追加機能：複数の画像対応のための、画像1枚分のデータをまとめた型
// これまでばらばらのstate(file, previewUrl, boxes, apiError)で管理していたものを1つの画像に関する情報を1つのオブジェクトとしてまとめる
type ImageItem = {
  file:File;
  previewUrl:string;
  boxes:Box[] | null; // 未処理： null/処理済み: Box[] (顔なしの場合は空配列)
  itemError: string | null; //  この画像固有のエラーメッセージ
}


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
  const canvasRef = useRef<HTMLCanvasElement>(null); // 画面3のcanvas要素への参照

  // --複数画像対応:ここが変更点--
  
  // file, previewUrl, boxes, apiErrorをImages配列に統合
  const [images, setImages] = useState<ImageItem[]>([]);

  // プレビュー画面で今何枚目を見ているか
  const [previewIndex, setPreviewIndex] = useState(0);

  //アップロード画面でのバリデーションエラー
  //11枚目以降は除外されました糖、アップロード全体に関わるerrorもここに含める
  const [uploadError, setUploadError] = useState<string | null>(null);

  //一括処理が実行中かどうか
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  //一括処理の進捗。　処理中...(3/10枚完了) の表示で使う
  const [processedCount, setProcessedCount] = useState(0);

  //「画像マスク」ボタン自体の多重送信防止フラグ(画像ごとではなく、ボタン単位で1つ)
  const isRequestInFlight = useRef(false);

  const acceptFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return; // ファイルが選ばれなかった場合は何もしない（キャンセル等）
 
    const filesArray = Array.from(fileList); //FileListは配列メソッドが使えないため、まずは配列に変換する
    
    //先頭10枚だけを採用し、11枚目以降は除外する
    const accepted = filesArray.slice(0, MAX_IMAGE_COUNT);
    const rejected = filesArray.slice(MAX_IMAGE_COUNT);

    const newItems: ImageItem[] = [];
    let validationError: string | null = null;

    //採用された各ファイルに対して、1枚ずつバリデーションを行う
    for (const candidate of accepted) {
      if (!ACCEPTED_TYPES.includes(candidate.type)) {
        //1枚でも形式エラーがあれば、その時点で全体を中断する
        validationError = `「${candidate.name}」は画像ファイル(jpg / png / webp)ではありません`;
        break;
      }

      if (candidate.size > MAX_FILE_SIZE) {
        validationError = `「${candidate.name}」のファイルサイズが大きすぎます(10MB以下にしてください)`
        break;
      }

      //バリデーションを通過したら、ImageItemとして追加する
      newItems.push({
        file: candidate,
        previewUrl: URL.createObjectURL(candidate),
        boxes: null, //まだ未処理
        itemError: null
      });
    }

    //バリデーションエラーがあった場合にそこで処理を止めて画面を遷移しない
    if (validationError) { 
      setUploadError(validationError);
      return;
    }

    //11枚目以降を除外した場合のメッセージ（バリデーションエラーがない場合のみ表示）
    if (rejected.length > 0) {
      setUploadError(`最大${MAX_IMAGE_COUNT}枚までです。${rejected.length}舞が洗濯から除外されました`);
    } else {
      setUploadError(null);
    }
 
    setImages(newItems);
    setPreviewIndex(0); //常に1枚目から表示を開始する
    setScreen("preview"); // 画面遷移図：D&D/選択 → 画面2へ
  };


  //画像の読み込みに失敗した場合の共通処理
  const handleImageError = () => {
    handleRemove(); //状態をリセットする
    setError("画像を読み込めませんでした。別の画像を選択してください"); //エラーメッセージをセット
  }
 
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
    if (!file || isRequestInFlight.current) return; // 念のためのガード（通常はfileがある状態でしかこのボタンは押せない&素手のリクエストが進行中の場合も弾く）
    
    isRequestInFlight.current = true //即座にフラグを立てる（再レンダリングを待たない）
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

      // レスポンスのJSON本文は、成功・失敗どちらの場合でも先に読んでおく
      const data = await response.json().catch(() => null);
 
      // サーバー(/api/detect)がエラーを返した場合：ここで処理を完結させる
      // （catchには送らない。catchはfetch自体が失敗した場合専用にするため）
      if (!response.ok) {
        // サーバーが返している{error:"..."}を優先して表示
        // もしそのプロパティがなければステータスコードだけのメッセージにフォールバックする
        const message = data && typeof data.error === "string" ? data.error : `サーバーエラー(ステータス: ${response.status})`;
        setApiError(message);
        return;

      }

      
      // resultが配列であることを確認してから中身を見る
      if (!Array.isArray(data.result)) {
        setApiError("サーバーからの応答が正しくありませんでした")
        return;
      }
 
      // 顔検知APIの仕様上、顔が見つからない場合はresultが空配列で返ってくる
      if (data.result.length === 0) {
        setApiError("顔が検出されませんでした");
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
      isRequestInFlight.current = false; //処理後、フラグを戻す
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

    img.onerror = () => {
      console.error("Canvas描画用の画像読み込みに失敗しました");
      setApiError("画像を読み込めませんでした");
      setScreen("preview");
    };

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
          onImageError={handleImageError}
        />
      )}
 
      {/* 画面3：マスク結果画面 */}
      {screen === "result" && (
        <ResultScreen canvasRef={canvasRef} onBack={handleBack} />
      )}
    </main>
  );
}
 

// 画面1: アップロード画面

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
 

// 画面2: プレビュー画面

function PreviewScreen({
  previewUrl,
  onRemove,
  onMask,
  isLoading,
  apiError,
  onImageError,
}: {
  previewUrl: string;
  onRemove: () => void;
  onMask: () => void;
  isLoading: boolean; // true の間はボタンを無効化し多重送信を防ぐ
  apiError: string | null; // API通信のエラーメッセージ（あれば赤字表示）
  onImageError: () => void;
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
          onError={onImageError}
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
 

// 画面3: マスク結果画面

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