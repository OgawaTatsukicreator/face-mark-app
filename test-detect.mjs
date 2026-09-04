import { readFileSync } from "node:fs";
import "dotenv/config";

const API_URL = process.env.FACE_API_URL;
const API_KEY = process.env.FACE_API_KEY;

async function main() {
    if (!API_URL || !API_KEY) {
        throw new Error("環境変数 FACE_API_URL / FACE_API_KEY が設定されていません");
    }

    const fileBuffer = readFileSync("./face.jpg");
    const blob = new Blob([fileBuffer])

    const formData = new FormData();
    formData.append("file", blob, "face.jpg");

    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY },
        body: formData,
    });

    console.log("status:", response.status);

    const data = await response.json();
    console.log("response:", JSON.stringify(data, null, 2));
}

main().catch((err) => {
    console.error("エラーが発生:",err);
})