# 検証結果

実施日: 2026-10-13。対象: このリポジトリの Pi 移植実装。

## 対象と原典

- Cursor pstack: 0.15.20、commit `1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def`。[固定した原典](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def/pstack)
- 実行先: Pi coding agent CLI 1.1.0、Node.js 24.21.0。原典補助ツールの試験: Bun 1.4.3。
- 移植: 原典51スキル、23プレイブック、2エージェント定義。team-kit の3スキルと Pi の create-skill 接続先を加え、読み込み対象は55スキル。
- 原典・依存資材153ファイルのうち115ファイルはバイト一致、38ファイルは記録した Pi 接続への変更。24の principle スキルと2エージェント定義は変更なし。
- 原典167ファイルのうち149ファイルを移植、4ファイルを Pi 向けに置換、14ファイルを実行用配布から除外。原典をそのまま配置しない18ファイルを `provenance/manifest.json` の excluded に記録する。置換した4ファイルは2つの plugin.json、README.md、.gitignore。原典アーカイブには全167ファイルを保存している。

## 確認した事実

| 検査 | 結果 | 証拠・意味 |
|---|---|---|
| 移植した接続部分のテスト | 6件成功、失敗0 | `tests/*.test.mjs`。モデル解決、分岐履歴、ToDo、質問、定期入力、並列実行・再開・停止・異常終了を確認 |
| 実 Pi CLI による統合実行 | 上記6件のうち1件が成功 | `tests/pi.test.mjs`。ローカルの決定的な応答器が実際の Pi ツールを呼び、子CLIを2つ起動・回収、片方を再開。readonly のツール制限と保存セッションの継続モードを確認 |
| 原典補助ツールのテスト | 63件成功、失敗0、232 assertions | orch、watch-pr、check-plan の5テストファイル。原典の実装とテストを変更せず実行 |
| 型検査 | 移植拡張・原典 watch-pr とも成功 | `npm run typecheck`、補助ツール内の `bun run typecheck` |
| 原典との差分検査 | 153ファイル成功 | `npm run verify`。変更した本文を含め原典アーカイブから再生成した結果と照合。変換規則の意味が正しいことまで自動保証する検査ではない |
| 利用環境での保存済み登録 | 登録先を読み戻して確認 | `pi list` にローカル checkout の登録。Pi ResourceLoader が55スキル、拡張1件を読み込み、skill diagnostics と extension errors は空 |

Task の各実行は `.jsonl` のセッション、イベント、状態ファイルをワークスペースの Pi 履歴内へ残す。子プロセスの終了と最終応答を確認して完了・失敗を区別する。Pi を終了した後の実行継続は扱わず、再起動時は中断として読み戻す。

## 確認していない範囲

接続部分はローカルで検証したが、有料の実モデルによる全プレイブック実行、モデルの指示遵守、実TUIでの人間の質問操作、外部MCP、GitHubでのPR作成・マージ、長時間の自律運転は未検証。原典のテスト成功も、これらの成功を意味しない。

Cursor Cloud VM、Projects の自動的な会話共有、automation/benny、Webhook routine と sender-key UI を使う make-bot-ui は移植対象外。書き込みの並列実行では別 worktree を Task の cwd に渡す。必要な外部連携は利用先の Pi へ別途設定する。

個人生成モードの自動継続は未実装。make-bot-ui と Benny はパック全体を除外しており、汎用的なサーバー・Tailscale手順や、Slack報告の分類・再現修正の本文も含まない。

## 利用開始と再実行

検証環境では Pi 1.1.0 と Bun 1.4.3 のインストール、ローカルパッケージ登録まで実施した。利用環境では README の手順で登録し、作業するプロジェクトで `pi` を起動する。プロバイダ未設定なら `/login`、続いて `/setup-pstack`、`/poteto-mode <依頼>` を実行する。原典の既定モデルが利用できない場合は `/setup-pstack` で利用可能なモデルを選ぶ。別モデルへの暗黙の置き換えは行わない。

```sh
git clone https://github.com/tonny-lec/pstack-pi.git
cd pstack-pi
npm ci --ignore-scripts
npm run typecheck
npm test
npm run verify
cd skills/poteto-mode/scripts
bun install --frozen-lockfile
bun run typecheck
bun test orch watch-pr check-plan.test.ts
```

利用終了時の登録解除は `pi remove git:github.com/tonny-lec/pstack-pi`。ローカル登録の場合は登録時と同じパスを渡す。セッション履歴の削除は伴わない。
