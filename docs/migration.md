# 移行判断

## 目的・完了条件・制約

目的は Cursor pstack の手順・判断方針を維持し、Pi coding agent CLI で利用可能にすること。原典は 0.15.20、Pi は公開版1.1.0に固定する。ソースはこのリポジトリの checkout を使う。

完了条件は、パッケージ読み込み、モデル指定、独立した並列実行・結果回収・停止・再開、質問・ToDo・継続モード・履歴・定期入力の接続が検証でき、変更した本文を原典から再検査できること。Cursor 専用の VM・Projects・automation・Webhook UI は対象外。pstack の原則、レビュー人数、プレイブックの手順、証拠の水準を変更しない。Codex 専用資材への実行依存を持たない。

## 比較した4案

| 案 | 利点 | 反証・検証結果 | 判断 |
|---|---|---|---|
| 原典を単純コピー | 本文差分が最小 | Pi は Task、Cursor ルール、Cursor 履歴を標準提供しない | 実行できないため見送り |
| 原典を維持し Pi 拡張で接続 | 手順を保ち、不足する操作だけ実装できる | Pi の拡張登録、JSON CLI、保存セッションで実行確認できた | 採用 |
| Codex 版から再移植 | 先行移植を利用できる | Cursor 原典と Codex 適応の2層を比較する必要があり、今回不要な差分が入る | 見送り |
| Pi 向けに全面再設計 | Pi に合わせて自由に設計できる | 振る舞いと思想の変更につながり、必要最低限の変更という条件を満たさない | 見送り |

## 影響範囲と変更例

| 対象 | 対応例 | 維持するもの |
|---|---|---|
| パッケージ定義 | Cursor plugin.json → Pi の package.json/pi | スキル単位と補助ファイル |
| スキル識別子 | `Poteto Mode` → `poteto-mode` | 本文の原則とトリガー |
| Task | 子 Pi CLI、`--model`、`--session`、Task ID | 新規を原則とする委任・親による回収 |
| クラウド実行指示 | local と準備済み worktree の cwd | 並列の役割、正確な SHA、検証条件 |
| モデル設定 | pstack_models と pstack-models.md | 17役割、パネルのリスト長、予算と aliases |
| 履歴 | Pi の session header と message エントリ | 同じワークスペースだけを読む境界 |
| 質問・ToDo・mode | Pi の UI と分岐に従う履歴 | 人間の選好確認、手順の可視化、継続適用 |
| 外部スキル依存 | team-kit の3スキルを原文同梱 | 清掃と実際の操作面での検証 |
| create-skill | Pi の authoring adapter | 作成→検証→試験→改訂の呼び出し先 |

変換規則は `scripts/port.py`、対象全ファイルの分類とハッシュは `provenance/manifest.json` にある。原典は修正せずアーカイブに保存する。新たなバグ修正や原則の統一、手順の削除、モデル人数の変更をこの移行へ混ぜない。

## 判断に用いた基準

Michael Feathers の特性テストを、原典との比較と既存の補助ツール維持に使った。Ron Jeffries / Martin Fowler の YAGNI を、汎用ハーネスやクラウド代替基盤を作らず必要な接続だけに絞る基準に使った。Barry Boehm の Verification / Validation の区別を、本文一致・Pi 接続の動作確認と、実モデルによる全ワークフローの振る舞いを区別する基準に使った。特性テストは原典の正しさやモデルの指示遵守を保証しない。

参照: [Feathers](https://www.informit.com/store/working-effectively-with-legacy-code-9780131177055)、[Fowler](https://martinfowler.com/bliki/Yagni.html)、[Boehm](https://doi.org/10.1109/MS.1984.233702)。
