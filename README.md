# verdaccio-poc

ローカルで簡単に起動できる Verdaccio の PoC レジストリです。付属ミドルウェア `verdaccio-block-recent` により「公開から *N* 日未満の最新版を直接使わせない」ソフトブロック ポリシーを適用できます。

## ミドルウェアの意図
Supply-chain 攻撃対策として、直近で公開されたばかりのバージョン（特に `latest` に昇格した直後）を即時利用せず一定の冷却期間を設けます。

挙動 (Soft Block 方式):
1. パッケージの `dist-tags.latest` が安全閾値 (limit_days) を超えていればそのまま返却。
2. 新しすぎる場合は、過去のバージョンから「安全な中で最も新しいもの」を探し `dist-tags.latest` を差し替え。
3. 差し替えた際、元々の最新版を `dist-tags.quarantined` としてマーク。
4. 安全なバージョンが1つもなければ `dist-tags.latest` を削除 (利用時にエラーになるため意図的に足止め)。

これにより利用者は普段通り `npm install some-package` をしても、一定期間が過ぎるまで危険度の高い最新版を取り込むことが抑制されます。

## ローカル起動 (推奨)
```bash
git clone https://github.com/D-ske104/verdaccio-poc.git
cd verdaccio-poc
npm install
npm run start   # 内部で verdaccio を scripts/start.cjs 経由で起動
```

起動後: http://localhost:4873/

### オプション: GitHub Packages から取得したい場合
`publishConfig.registry` を保持しているため、公開したら以下のように設定可能です。
```ini
@d-ske104:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```
※ トークン権限: `read:packages` (公開する場合は `write:packages` も)。
その後 `npm install @d-ske104/verdaccio-poc` で取得できます。現在はローカル利用を前提としているため公開は行っていません。

## 開発メモ
`prepare` スクリプトでプラグインを自動ビルドします。ソース変更後は単に `npm run start` で再起動すれば反映されます。個別にビルドだけ行いたい場合は `npm run build:plugin`。

## 設定 (`config.yaml`)
```yaml
middlewares:
  block-recent:
    enabled: true
    limit_days: 21  # 公開から21日未満の最新版を soft block
```
`limit_days` (number): この日数未満の最新版を直接使わせない。未設定時は 3 日。

## 実装概要
- ルート `GET /:package` をフックしストレージからメタデータ取得。
- Verdaccio v6 の `storage.getPackage({ name, req, callback })` コールバック API を使用。
- キャッシュ汚染を避けるためメタデータをディープコピーしてから `dist-tags` を加工。
- 時刻判定は `info.time[version]` の ISO 文字列を `Date.getTime()` で比較。

## セキュリティ上の考慮
- 最新版を完全拒否せず過去の安全バージョンへ自動フォールバックすることで開発体験を損なわない。
- 攻撃が混入する恐れがある「直近の急な major/minor 更新」を社内CIが即取り込むことを防ぐ。
- `quarantined` タグにより監視/レビュー対象が明確になる。

## 制限事項 / 今後の拡張案
- 現在は `GET /:package` のみ対応。`/-/package/<name>/dist-tags` 等の他 API を追加で再書換する案あり。
- スコープ別・パッケージ別ホワイトリスト (例: `always_allow: ['typescript', '@types/*']`) 追加検討。
- ブロック通知を JSON エラーではなく標準化されたレスポンスへ変更するオプション。
- 監査ログ出力 (JSON Lines) で可視化強化。

## 典型的なトラブルシュート
| 症状 | 原因 | 対処 |
|------|------|------|
| `TypeError: options.callback is not a function` | Promise API で `getPackage` を呼んでいる | コールバック形式 `{ name, req, callback }` に戻す |
| プラグインが読み込まれない | `dist` が publish から除外 | `.gitignore`/`files` フィールドを確認 |
| `npx @d-ske104/verdaccio-poc` が 404 | GitHub Packages のスコープ設定不足 | `~/.npmrc` にスコープ + トークン追加 |
| 最新版が常に消える | `limit_days` が大きすぎる or タイムゾーン差 | 日数調整しログで publish 時刻を検証 |

## ライセンス
現状 `NO LICENSE`。社内利用前提。外部公開する場合は MIT 等へ更新してください。

---
何か改善案や要望があれば Issue / Pull Request を歓迎します。
