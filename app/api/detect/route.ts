import { NextRequest, NextResponse } from "next/server";

// POST /api/detect
// ブラウザから画像を受け取り、外部の顔検知APIへ中継するエンドポイント。
// APIキーをブラウザへ露出させず、サーバー側だけで保持する。
export async function POST(request: NextRequest) {
  let formData: FormData;

  // multipart/form-dataの解析失敗は、
  // サーバー内部エラーではなくリクエスト不正として400を返す。
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("FormData解析エラー:", error);

    return NextResponse.json(
      { error: "画像ファイルが送信されていません" },
      { status: 400 }
    );
  }

  try {
    const file = formData.get("file");

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp",];

    // ファイルが存在しない、またはBlobでない場合
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "画像ファイルが送信されていません" },
        { status: 400 }
      );
    }

    // ファイルサイズの検証
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error:
            "ファイルサイズが大きすぎます（10MB以下にしてください）",
        },
        { status: 413 }
      );
    }

    // MIMEタイプの検証
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "対応していないファイル形式です" },
        { status: 415 }
      );
    }

    // 外部APIの接続情報を環境変数から取得
    const apiUrl = process.env.FACE_API_URL;
    const apiKey = process.env.FACE_API_KEY;

    // 必要な環境変数が設定されていない場合
    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        {
          error:
            "サーバー設定エラー：環境変数が未設定です",
        },
        { status: 500 }
      );
    }

    // 外部APIへ送信するFormDataを作成
    const externalFormData = new FormData();
    externalFormData.append("file", file, "upload.jpg");

    // 外部の顔検知APIへリクエストを送信
    const externalResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: externalFormData,
      signal: AbortSignal.timeout(10_000),
    });

    // 外部APIのレスポンスをJSONとして取得
    const data = await externalResponse.json();

    // 外部APIのステータスコードを引き継いで返す
    return NextResponse.json(data, {
      status: externalResponse.status,
    });
  } catch (error) {
    // 外部APIへの通信失敗など、処理中の予期しない例外
    console.error("API Route エラー:", error);

    return NextResponse.json(
      { error: "サーバー内部でエラーが発生しました" },
      { status: 500 }
    );
  }
}