import { readFileSync } from "node:fs";

const API_URL = "FACE_API_URL"
const API_KEY = "FACE_API_KEY"; // 後で環境変数化する

async function main() {
    const fileBuffer = readFileSync("./face.jpg");
    const blob = new Blob([fileBuffer])

    const formData = new FormData();
    formData.append("file", blob, "face.jpg");

    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "x-api-key": API_KEY,
        },
        body: formData,
    });

    console.log("status:", response.status);

    const data = await response.json();
    console.log("response:", JSON.stringify(data, null, 2));
}

main().catch((err) => {
    console.error("エラーが発生:",err);
})