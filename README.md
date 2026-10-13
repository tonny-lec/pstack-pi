# pstack for Pi

Cursor 公式 pstack 0.15.20 を Pi coding agent CLI に移植した非公式パッケージです。原典 commit は `1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def`、検証対象は `@earendil-works/pi-coding-agent` 1.1.0 です。

51 の原典スキル、23 のプレイブック、2 のエージェント定義を移植しています。pstack が使う `deslop`・`control-cli`・`control-ui` を同じ公式リポジトリから同梱し、Pi 向けの `create-skill` 接続先を加えています。合計55スキルです。

## 使い始める

Node.js 22.19 以上が必要です。

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.1.0
pi install git:github.com/tonny-lec/pstack-pi
cd /path/to/your/project
pi
```

Pi 内で、プロバイダ未設定なら `/login` を実行します。その後、`/setup-pstack` で利用可能なモデルと役割・推論予算を確認し、`/poteto-mode <依頼>` で作業を開始します。`/skill:poteto-mode` も利用できます。継続モードは `/pstack-off` で解除できます。

インストールを保存せず試す場合は `pi -e git:github.com/tonny-lec/pstack-pi`、解除は `pi remove git:github.com/tonny-lec/pstack-pi` です。ローカルの checkout は `pi install /absolute/path/to/pstack-pi` で登録できます。

## 移植した接続部分

| 原典の接続先 | Pi での対応 |
|---|---|
| スキル呼び出し | 標準 `/skill:<name>` と原典名の短縮コマンド |
| Task | 独立した Pi プロセス、モデル指定、バックグラウンド実行、明示的な再開 |
| 親による結果回収 | `pstack_tasks` の list/status/wait/stop と完了通知 |
| AskQuestion | Pi TUI / RPC の選択・自由入力。print モードでは質問を会話へ返す |
| TodoWrite | 分岐に従う Pi 履歴内の ToDo |
| 役割別モデル設定 | `pstack_models` と Pi agent ディレクトリの `pstack-models.md` |
| 継続モード | セッション履歴へ保存し、各ターンの指示へ反映 |
| 会話履歴 | 現在の Pi セッションと同じワークスペースの JSONL |
| `/loop` | 起動中の Pi に定期入力。`/loop 1h <依頼>`、停止は `/loop stop` |

モデルは `provider/model:effort` で指定します。`auto` と `inherit-parent` は親のモデルを使います。原典のモデル・推論段階・パネル人数の方針は維持しています。Cursor の旧形式のモデル名は、基底モデルが Pi で利用可能な場合に限り変換します。Cursor の `fast` サービス階層は Pi では提供されず、変換結果にその違いを表示します。利用できないモデルを黙って別モデルへ変えません。

## 実行上の境界

- Cursor Cloud VM、Cursor Projects、automation/benny、Webhook routine と sender-key UI を使う `make-bot-ui` は含めません。
- 並列の書き込み作業では、原典と同様に別 worktree を用意し、Task の `cwd` へ渡します。ローカルプロセスのコンテキスト分離は VM の分離とは異なります。
- 読み取り専用 Task のツールは `read / grep / find / ls` に制限します。通常 Task はそのプロジェクトで利用できる Pi のツールと設定を読み込みます。
- Pi 終了時に子プロセスを停止します。再起動後の作業は履歴・ブランチから明示的に再開します。`/loop` は Pi が終了したりコンピュータがスリープしたりすると実行されません。
- `create-skill` は Pi のファイル作成・検証方式への接続です。Cursor の専用 UI は移植していません。
- 個人生成モードはスキルとして呼び出せますが、自動継続は未実装です。必要なターンで再度呼び出すか、継続させる指示を利用先の Pi の AGENTS.md へ設定してください。
- `make-bot-ui` と Benny はパック全体を除外しています。汎用的なサーバー・Tailscale手順や、Slack報告の分類・再現修正の本文も、この移植には含みません。
- 原典補助ツールの orch / watch-pr は Bun と GitHub CLI 等を使用します。元の実装と依存定義を維持しています。

## 再検証

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run verify
```

`provenance/` に原典アーカイブと全ファイルのハッシュ、`scripts/port.py` に許可した変換を保存しています。`verify` は変更対象の本文も含め、原典からの再生成結果と比較します。

テストには、実際の Pi CLI がローカルの決定的な応答器を使って Task・履歴・ツールを呼ぶ統合検証と、接続部分の検証があります。有料 API、全モデル・全プレイブックの振る舞い、外部 MCP、PR 作成・マージは検証していません。

詳細は [移行判断](docs/migration.md) と [検証結果](docs/verification.md) にあります。

原典: [Cursor pstack](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def/pstack)。Pi: [公式ドキュメント](https://github.com/earendil-works/pi/tree/v1.1.0/packages/coding-agent/docs)。MIT ライセンスの帰属は同梱 LICENSE と原典アーカイブに保存しています。
