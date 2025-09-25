# agbd （auto git branch delete）

<a href="https://github.com/sponsors/riya-amemiya"><img alt="Sponsor" src="https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#white" /></a>

git のローカル／リモートブランチを安全に整理する CLI です。対話 UI でブランチを選んで削除できるほか、条件を指定した自動削除やドライラン表示にも対応しています。

## インストール

```bash
npm install --global agbd
```

## 使い方

```bash
agbd [options]
```

### 主なオプション

- `--pattern <regex>`: ブランチ名を正規表現でフィルタ（正規表現エラー時は部分一致）
- `--remote`: リモートブランチも対象に含める（デフォルト: ローカルのみ）
- `--dry-run`: 実際に削除せず、対象ブランチの一覧のみ表示
- `-y, --yes`: 確認プロンプトをスキップして即実行
- `--force`: 未マージブランチも強制削除（ローカルのみ）
- `--protected <list>`: 保護ブランチのリスト（カンマ区切り／正規表現可、デフォルト: `main,master,develop,release`）
- `--default-remote <name>`: リモート名のデフォルト値（省略時は `origin`）
- `--cleanup-merged <days>`: 最終コミットが指定日数より古いブランチのみ対象
- `--config <command>`: 設定の管理 (`show`, `set`, `edit`, `reset`)
- `--no-config`: 設定ファイルを無視してデフォルト＋CLIフラグのみ適用
- `-v, --version`: バージョン表示
- `-h, --help`: ヘルプ表示

### 設定ファイル

設定は以下の優先順位で適用されます（上が優先）：

1. CLIフラグ
2. ローカル設定 (`.agbdrc` をカレントディレクトリから上位に探索)
3. グローバル設定 (`~/.config/agbd/config.json`)
4. デフォルト値

`--no-config` を付けると設定ファイルを読み込みません。設定項目：

- `remote`: boolean
- `dryRun`: boolean
- `yes`: boolean
- `force`: boolean
- `pattern`: string
- `protectedBranches`: string[]
- `defaultRemote`: string
- `cleanupMergedDays`: number

#### 設定管理コマンド

- `agbd --config show`: 現在の有効な設定を表示（default/global/local の由来付き）
- `agbd --config set`: 対話的な設定エディタを起動
- `agbd --config edit`: `$EDITOR` でグローバル設定ファイルを開く
- `agbd --config reset`: グローバル設定を初期値へリセット

### 使用例

```bash
# 対話モードでローカルブランチを整理
agbd

# 30日以上更新のないリモート feature ブランチをドライラン表示
agbd --pattern '^feature/' --remote --cleanup-merged 30 --dry-run

# bugfix ブランチを確認なしで強制削除
agbd --pattern 'bugfix/' --force --yes

# main/master/develop を除いてマージ済みブランチを削除
agbd --cleanup-merged 0 --protected main,master,develop
```

## 動作の概要

agbd は Git の内部コマンドを利用して対象ブランチの一覧を取得し、最終コミット日時・メッセージ・マージ済み状態などを表示します。保護ブランチは名前一致のほか `/regex/` 形式の正規表現でも指定可能です。

対話モードでは Ink 製の UI 上でブランチを複数選択できます（Space で選択切替、Enter で確定）。`--pattern` や `--cleanup-merged` などを指定すると、自動モードで非対話的に処理を進められます。

`--dry-run` を付けると削除計画のみ表示し、実際の削除は行いません。削除はローカルの場合 `git branch -d/-D`、リモートの場合 `git push <remote> --delete <branch>` を実行します。

## 開発

```bash
# 依存関係のインストール
bun install

# ビルド
bun run build

# 開発（watch）
bun run dev

# Lint（チェック／自動修正）
bun run test
bun run lint
```

## ライセンス

MIT

## 貢献

Issue/PR は歓迎です。詳細は CONTRIBUTING を参照してください。
