import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof Blob)) {
            return NextResponse.json(
                {error: "画像ファイルが送信されていません"},
                {status: 400}
            );
        }

        const apiUrl = process.env.FACE_API_URL;
        const apiKey = process.env.FACE_API_KEY;

        if (!apiUrl || !apiKey) {
            return NextResponse.json(
                {error: "サーバー設定error:環境変数が未設定です"},
                {status: 500}
            )
        }

        //ブラウザいから受け取ったファイルを、外部の顔検知APIへそのまま中継する
        const externalFormData = new FormData();
        externalFormData.append("file", file, "upload.jpg");

        const externalResponse = await fetch(apiUrl, {
            method: "POST",
            headers: { "x-api-key": apiKey },
            body: externalFormData,
        });

        const data = await externalResponse.json();

        return NextResponse.json(data, { status: externalResponse.status });
    } catch (error) {
        console.error("API Router エラー:", error);
        return NextResponse.json(
            { error: "サーバー内部でエラーが発生しました"},
            { status: 500}
        )
    }
}