# HP自動生成ツール セットアップ手順

社内スタッフがフォーム入力だけでクライアント向けHPを生成し、GitHubへPush、Cloudflare Pagesで公開するための一式です。

---

## 同梱ファイル

```text
/
├── index.html
├── config.js
├── gas_main.gs
├── README.md
└── templates/
    ├── salon/
    │   └── index.html
    └── food/
        └── index.html
```

---

## 1. まず何をするか

初回セットアップは、次の順番で進めるとスムーズです。

1. GitHub リポジトリを作る
2. Cloudflare Pages と接続する
3. Google スプレッドシートを作る
4. Google Apps Script に `gas_main.gs` を設定する
5. `config.js` にGASのURLなどを入れる
6. `index.html` をブラウザで開いて動作確認する

---

## 2. GitHubリポジトリ作成

### 作成する構成

GitHub上では、最低限次の構成にしてください。

```text
repo-root/
├── sites/
│   └── （ここに公開サイトが自動追加される）
└── templates/
    ├── salon/
    │   └── index.html
    └── food/
        └── index.html
```

### 手順

1. GitHubで新しいリポジトリを作成します
2. リポジトリ直下に `templates/` フォルダを作成します
3. このパッケージの `templates/salon/index.html` を GitHub の `templates/salon/index.html` に配置します
4. このパッケージの `templates/food/index.html` を GitHub の `templates/food/index.html` に配置します
5. `sites/` フォルダを空で作成します
   - 空フォルダが作れない場合は `.gitkeep` を置いてください

### 補足

- `clinic` と `school` は、テンプレートが未配置でも GAS 側のフォールバックHTMLで最低限公開できます
- ただし、見た目を整えるなら後から `templates/clinic/index.html` と `templates/school/index.html` を追加するのがおすすめです

---

## 3. Cloudflare Pages接続

### 手順

1. Cloudflare Dashboard を開きます
2. **Pages** → **Create a project** を選びます
3. GitHub リポジトリを接続します
4. Build settings は以下でOKです

```text
Framework preset: None
Build command: なし
Build output directory: /
Root directory: /
```

### 公開URLについて

Cloudflare Pages のプロジェクト名が `my-hp-project` の場合、公開URLは以下の形になります。

```text
https://my-hp-project.pages.dev/sites/salon-001/
```

この `my-hp-project` の部分を、後で Apps Script の `CLOUDFLARE_PROJECT` に設定します。

---

## 4. Googleスプレッドシート作成

### 用途

スプレッドシートは以下の記録に使います。

- 発行日時
- サイトID
- 業種
- 店舗名
- 発行URL
- GitHub URL
- ステータス
- 担当スタッフ名

### 手順

1. Google スプレッドシートを新規作成します
2. スプレッドシートURLの `/d/XXXX/edit` の `XXXX` 部分を控えます
3. これを Apps Script の `SPREADSHEET_ID` に設定します

※ シート名は `sites` が自動で作成されます

---

## 5. Google Apps Script 設定

### 新規作成

1. [Google Apps Script](https://script.google.com/) を開く
2. 新しいプロジェクトを作成
3. 既存の `Code.gs` の内容を削除
4. このパッケージの `gas_main.gs` を貼り付ける
5. 保存する

### スクリプトプロパティ設定

Apps Script の **プロジェクトの設定** → **スクリプト プロパティ** に以下を登録してください。

```text
GEMINI_API_KEY      : Gemini APIキー
GITHUB_TOKEN        : GitHub Personal Access Token
GITHUB_OWNER        : GitHubユーザー名またはOrg名
GITHUB_REPO         : GitHubリポジトリ名
GITHUB_BRANCH       : main
SPREADSHEET_ID      : 記録用スプレッドシートID
CLOUDFLARE_PROJECT  : Cloudflare Pagesプロジェクト名
```

### 各値の意味

- `GEMINI_API_KEY`
  - Gemini API を呼ぶためのキーです
- `GITHUB_TOKEN`
  - GitHub Contents API でファイル作成・更新するためのトークンです
  - `repo` 権限を含む Personal Access Token を推奨します
- `GITHUB_OWNER`
  - GitHub のユーザー名または Organization 名
- `GITHUB_REPO`
  - リポジトリ名
- `GITHUB_BRANCH`
  - 通常は `main`
- `SPREADSHEET_ID`
  - Google スプレッドシートのID
- `CLOUDFLARE_PROJECT`
  - Cloudflare Pages プロジェクト名

---

## 6. Webアプリとしてデプロイ

### 手順

1. Apps Script 右上の **デプロイ** → **新しいデプロイ** を押します
2. 種類は **ウェブアプリ** を選択します
3. 実行ユーザーは **自分** を選択します
4. アクセスできるユーザーは、社内利用に合わせて設定します
   - 一般的には **全員** または **Googleアカウントを持つ全員**
5. デプロイ後に発行されるURLをコピーします

そのURLを `config.js` の `GAS_ENDPOINT` に貼り付けます。

---

## 7. フロントエンド設定

### `config.js` を編集

最低限、以下の3つを変更してください。

```javascript
GAS_ENDPOINT: 'https://script.google.com/macros/s/あなたのデプロイID/exec',
CLOUDFLARE_PROJECT: 'あなたのCloudflare Pagesプロジェクト名',
SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/あなたのID/edit',
GITHUB_REPO_URL: 'https://github.com/あなたの組織名/あなたのリポジトリ名'
```

### モック動作について

`GAS_ENDPOINT` を未設定のままにすると、`index.html` はモックモードで動きます。

モックモードでは：
- 画面遷移は確認できる
- バリデーションは確認できる
- ローディングアニメーションは動く
- 実際のAPI送信は行わない
- ダミーURLを表示する

つまり、GAS連携前でもUI確認ができます。

---

## 8. `index.html` の使い方

1. `index.html` と `config.js` を同じフォルダに置きます
2. ブラウザで `index.html` を開きます
3. 業種を選びます
4. ヒアリング内容を入力します
5. 確認画面から生成を実行します
6. 完了画面に公開URLが表示されます

### 注意

ローカル環境でも動きますが、ブラウザ設定によっては `fetch()` 周りで制限が出る場合があります。
その場合は簡易HTTPサーバー上で開いてください。

例：VS Code の Live Server など

---

## 9. GASの処理内容

`gas_main.gs` では、以下の順に処理します。

1. フォームの必須項目チェック
2. `siteId` 採番（例: `salon-001`）
3. Gemini API でコピー生成
4. `site.json` を組み立て
5. GitHub に以下2ファイルを作成
   - `sites/{siteId}/site.json`
   - `sites/{siteId}/index.html`
6. スプレッドシートに記録
7. 公開URLを返却

---

## 10. GitHub に保存される形

生成が成功すると、GitHubには次のように保存されます。

```text
sites/
└── salon-001/
    ├── site.json
    └── index.html
```

Cloudflare Pages はこの更新を検知して自動デプロイします。

---

## 11. トラブルシューティング

### 1) 「スクリプトプロパティが未設定です」と出る

Apps Script のスクリプトプロパティに必要項目が入っていません。

確認対象：
- GEMINI_API_KEY
- GITHUB_TOKEN
- GITHUB_OWNER
- GITHUB_REPO
- SPREADSHEET_ID
- CLOUDFLARE_PROJECT

### 2) GitHub Push に失敗する

以下を確認してください。

- `GITHUB_TOKEN` に repo 権限があるか
- `GITHUB_OWNER` と `GITHUB_REPO` が正しいか
- ブランチ名が `main` で合っているか
- リポジトリが存在しているか

### 3) 完了画面のURLを開いても 404 になる

Cloudflare Pages のデプロイ反映に少し時間がかかる場合があります。
数十秒待ってから再読み込みしてください。

また、以下も確認してください。
- GitHub に `sites/{siteId}/` が作成されているか
- Cloudflare Pages が該当リポジトリに接続されているか

### 4) Gemini API エラーが出る

以下を確認してください。
- APIキーが正しいか
- Gemini API が利用可能なプロジェクトか
- 利用制限に達していないか

### 5) UIは動くが本番送信されない

`config.js` の `GAS_ENDPOINT` が `YOUR_DEPLOYMENT_ID` のままの可能性があります。

---

## 12. 非エンジニア向け運用メモ

- 普段の運用では、基本的に `index.html` を使うだけです
- APIキーやトークンを変更する時だけ Apps Script 側を触ります
- 業種を増やしたい時は次の3点を追加します
  1. `config.js` に業種を追加
  2. `index.html` の業種別入力項目を追加
  3. GitHub の `templates/{業種}/index.html` を追加

---

## 13. 今後の拡張アイデア

- clinic / school 専用テンプレート追加
- 画像アップロード機能
- 地図iframe自動埋め込み
- 予約フォーム連携
- 公開停止 / 再公開の管理UI
- 生成履歴一覧画面

---

## 14. 最後に

この一式は、まず **社内運用で迷わず使えること** を優先して構成しています。
`index.html` は GAS 未接続でも画面確認できるため、UI確認 → GAS接続 → 本番運用 の順に進めるのがおすすめです。
