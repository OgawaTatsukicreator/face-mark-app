import { NextRequest, NextResponse } from "next/server";
 
// POST /api/detect
// ブラウザから画像を受け取り、外部の顔検知APIへ中継（プロキシ）するエンドポイント。
// ここを経由させる一番の理由はセキュリティ：外部APIのAPIキーをブラウザ側に
// 一切露出させず、サーバー(Node.js)側だけで保持するため。
export async function POST(request: NextRequest) {
    try {
        // ブラウザから送られてきたmultipart/form-dataを解析
        const formData = await request.formData();
        const file = formData.get("file");
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
 
        // fileが存在しない、またはBlob（バイナリデータ）でない場合はリクエスト不正として400を返す
        // 【注意】ここは以前 !(file instanceof Blob) の「!」が抜けていて
        // 正常なファイルでも常にエラーになるバグがあったので、必ずこの形になっているか確認
        if (!file || !(file instanceof Blob)) {
            return NextResponse.json(
                { error: "画像ファイルが送信されていません" },
                { status: 400 }
            );
        }

        // サーバー側でもサイズチェック（フロントを経由しない直接アクセス対策）
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "ファイルサイズが大きすぎます（10MB以下にしてください）" },
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
 
        // .env（.env.local）から外部API情報を読み込む
        // Next.jsは標準でこれらのファイルを自動読み込みするため、
        // dotenvパッケージのimportは不要（Node.js単体スクリプトの時とは違う点）
        const apiUrl = process.env.FACE_API_URL;
        const apiKey = process.env.FACE_API_KEY;
 
        // 環境変数が設定されていない場合はサーバー側の設定不備として500を返す
        // （ここでエラーになる場合、.envファイルの配置場所や開発サーバーの再起動漏れを疑う）
        if (!apiUrl || !apiKey) {
            return NextResponse.json(
                { error: "サーバー設定エラー：環境変数が未設定です" },
                { status: 500 }
            );
        }
 
        // ブラウザから受け取ったファイルを、そのまま外部の顔検知APIへ送るための
        // 新しいFormDataを作成する（ブラウザ側のformDataをそのまま転送はできないため作り直す）
        const externalFormData = new FormData();
        externalFormData.append("file", file, "upload.jpg");
 
        // 外部の顔検知APIへリクエストを中継
        // x-api-keyはここ（サーバーサイド）でのみ付与される。ブラウザ側のコードには一切登場しない
        const externalResponse = await fetch(apiUrl, {
            method: "POST",
            headers: { "x-api-key": apiKey },
            body: externalFormData,
        });
 
        // 外部APIからのレスポンス（顔の座標情報など）をそのままJSONとして受け取る
        const data = await externalResponse.json();
 
        // 外部APIのステータスコードをそのまま引き継いでブラウザに返す
        // （200なら成功、エラー時は外部APIのエラー内容がそのまま伝わる）
        return NextResponse.json(data, { status: externalResponse.status });
    } catch (error) {
        // request.formData()の解析失敗、外部APIへのfetch自体の失敗（ネットワーク断など）
        // といった、try内のどこかで例外が発生した場合はここに来る
        console.error("API Route エラー:", error); // 開発者向け：詳細はサーバーログにのみ出す
        return NextResponse.json(
            { error: "サーバー内部でエラーが発生しました" }, // ユーザー向け：詳細を出さず簡潔に
            { status: 500 }
        );
    }
}