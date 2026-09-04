# 顔検知API 疎通確認ログ

## 2026/09/04 curlでの確認（正常系）

**確認方法:** curl.exe（PowerShell）

**リクエスト:**
顔が写っている `face.jpg` を送信

```bash
curl.exe "https://compreface.webfrontier.co.jp/api/v1/detection/detect" -H "Content-Type: multipart/form-data" -H "x-api-key: ***" -F "file=@face.jpg"
```

**レスポンス:** ステータス 200

```json
{
  "result": [
    {
      "box": {
        "probability": 0.9993902444839478,
        "x_max": 366,
        "y_max": 513,
        "x_min": 81,
        "y_min": 131
      }
    }
  ]
}
```

**メモ:**
- `probability` が1に近いほど検出の信頼度が高い（今回は0.999と非常に高い）
- `box` の座標（`x_min`, `y_min`, `x_max`, `y_max`）はピクセル単位と思われる
- 元画像のサイズとの関係は後日要確認（マスク描画時の座標変換に影響する可能性あり）

---

## 2026/09/04 Node.js(fetch)での確認（正常系）

**確認方法:** `test-detect.mjs`（Node.js / fetch）

**実装のポイント:**
- APIキー・URLは `.env` から `process.env` 経由で読み込み、コード内にハードコードしていない
- `dotenv` パッケージを使用（`import "dotenv/config"`）
- `FormData` を使う場合、`Content-Type` ヘッダーは明示的に指定しない（`fetch` が自動でboundary付きの値を生成するため）

**レスポンス:** ステータス 200

```json
{
  "result": [
    {
      "box": {
        "probability": 0.9993902444839478,
        "x_max": 366,
        "y_max": 513,
        "x_min": 81,
        "y_min": 131
      }
    }
  ]
}
```

**メモ:**
- curlでの結果と完全に一致することを確認。外部APIの挙動が安定していることが分かる
- `.env`（当初`.env.local`として計画していたが、`dotenv`標準の読み込み対象である`.env`にリネームして使用）
- `.gitignore` の `.env*` ルールにより `.env` はGit管理対象外であることを `git check-ignore -v .env` で確認済み

---

## 未実施（今後の確認予定）

| ケース | 内容 | 結果 |
| :--- | :--- | :--- |
| 顔なし画像 | 顔が写っていない画像を送信した場合のレスポンス | 未確認 |
| 非画像ファイル | 画像以外のファイルを送信した場合のレスポンス | 未確認 |
| 不正なAPIキー | キーを誤った値にした場合の認証エラーレスポンス | 未確認 |

---

## 本日のゴール達成状況

- [x] curlコマンドで正常にJSONレスポンス（box座標）を取得できた
- [x] Node.js（fetch）からも同様にレスポンスを取得できた
- [ ] 異常系（顔なし・不正キーなど）のレスポンス内容を確認・記録した
- [x] APIキーを環境変数に切り出し、Git管理対象外にした