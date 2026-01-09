# メルカリスクレイピング BAN検証計画

## 概要
TypeScript/PlaywrightベースのBAN検証用テンプレートを使用し、メルカリへのスクレイピングでBANされる条件を検証する

---

## 検証対象

1. **リクエスト頻度/レート制限** - 何秒間隔、1時間/1日あたりの上限
2. **IPアドレスの種類** - データセンターIP vs 住宅IP vs モバイルIPでの違い
3. **ヘッドレスブラウザ検知** - headless vs headed、WebDriver検知対策
4. **人間らしい挙動** - スクロール、マウス移動、クリックパターンの影響度
5. **フィンガープリント整合性** - IP/UA/言語/タイムゾーンの整合性
6. **その他** - Cookie、TLS fingerprint、HTTP/2等

---

## BAN判定基準

| シグナル | 検知方法 |
|----------|----------|
| CAPTCHA表示 | `iframe[src*="captcha"]`, `.g-recaptcha` |
| HTTPエラー | 403, 429, 503 |
| リダイレクト | `/error`, `/block` ページへの遷移 |
| コンテンツ欠損 | 商品名・価格が取得不可 |
| 応答遅延 | 10秒以上 |
| JSチャレンジ | "Checking your browser" 等のテキスト |

---

## テストシナリオ

### Phase 1: 基本レート制限テスト（低リスク）

**目的**: 安全なリクエスト間隔の特定

| 間隔 | 回数 | 期待結果 |
|------|------|----------|
| 60秒 | 10回 | 正常 |
| 30秒 | 10回 | 観察 |
| 15秒 | 10回 | 観察 |
| 10秒 | 10回 | 観察 |
| 5秒  | 10回 | 観察 |
| 3秒  | 10回 | 観察 |

**実行コマンド**:
```bash
npm start --test-rate-limit "https://jp.mercari.com/item/m12345678"
```

---

### Phase 2: Stealth効果検証

**目的**: playwright-stealthプラグインの効果測定

| 条件 | 設定 | 結果比較 |
|------|------|----------|
| Stealthなし + headless | `--no-stealth --headless true` | ベースライン |
| Stealthあり + headless | `--headless true` | 改善度確認 |
| Stealthあり + headed | `--headless false` | 最良ケース |

**実行コマンド**:
```bash
# Stealthなし
npm start --no-stealth "https://jp.mercari.com/item/m12345678"

# Stealthあり（デフォルト）
npm start "https://jp.mercari.com/item/m12345678"

# headed モード
npm start --headless false "https://jp.mercari.com/item/m12345678"
```

---

### Phase 3: 人間模倣効果テスト

**目的**: 行動パターンがBAN判定に与える影響を測定

| パターン | 内容 | 設定 |
|----------|------|------|
| A（機械的） | 直接goto + 固定2秒待機 | `--pattern A` |
| B（基本） | ランダム待機 + スクロール | `--pattern B` |
| C（高度） | マウス移動 + 自然な遷移 | `--pattern C` |

**実行コマンド**:
```bash
# パターンA
npm start --pattern A "https://jp.mercari.com/item/m12345678"

# パターンB（デフォルト）
npm start --pattern B "https://jp.mercari.com/item/m12345678"

# パターンC
npm start --pattern C "https://jp.mercari.com/item/m12345678"
```

---

### Phase 4: IP種別比較（犠牲IP使用）

**目的**: IPアドレスの種類による違いを検証

| IP種別 | 予測安全度 | 設定方法 |
|--------|-----------|----------|
| データセンター | 低 | AWS/GCP等のIP |
| 住宅用プロキシ | 中〜高 | Bright Data等 |
| モバイル | 高 | 4G/5Gプロキシ |

**設定方法** (`.env`):
```env
PROXY_SERVER=http://proxy.example.com:8080
PROXY_USER=username
PROXY_PASS=password
```

---

### Phase 5: フィンガープリント整合性テスト

**目的**: IP/UA/言語/タイムゾーンの不整合がBANに影響するか検証

| ケース | IP | UA/Locale/TZ | 予測 |
|--------|-----|--------------|------|
| 完全整合 | 日本 | ja-JP / Asia/Tokyo | 安全 |
| 部分不整合 | 米国 | ja-JP / Asia/Tokyo | 要検証 |
| 完全不整合 | ドイツ | ja-JP / Asia/Tokyo | 危険 |

**実装箇所**: `src/config.ts` のフィンガープリント設定

---

## 記録項目

各テストで以下を記録:

```json
{
  "timestamp": "ISO8601",
  "config": {
    "ip_type": "datacenter|residential|mobile",
    "stealth_enabled": true,
    "human_behavior": "A|B|C",
    "headless": true
  },
  "request": {
    "url": "https://jp.mercari.com/item/...",
    "interval_ms": 5000
  },
  "response": {
    "status": 200,
    "load_time_ms": 2500
  },
  "ban_signals": {
    "captcha": false,
    "http_error": null,
    "redirect": false,
    "content_missing": false
  }
}
```

**ログ出力先**: `logs/requests.jsonl`

---

## 安全マージン導出

```
推奨値 = 実測限界値 × 2〜3
```

### 運用レベル

| レベル | 間隔 | 1時間上限 | 人間模倣 |
|--------|------|----------|---------|
| 通常運用 | 限界値×3 | 限界値×30% | パターンB |
| 安全運用 | 限界値×5 | 限界値×20% | パターンC |
| 最安全運用 | 限界値×10 | 限界値×10% | パターンC + IPローテ |

---

## 注意事項

1. **法的リスク**: メルカリ利用規約を確認し、過度なスクレイピングは控える
2. **IP汚染**: 自宅IPでの実験は最小限に（犠牲IPを使用）
3. **アカウント**: ログイン状態でのテストは避ける
4. **サービス妨害**: 同時接続数を制限
5. **検知技術の進化**: メルカリ側の対策変更に注意

---

## チェックリスト

### 準備
- [ ] `npm install` 完了
- [ ] `npx playwright install chromium` 完了
- [ ] `.env` 設定完了（プロキシ等）
- [ ] 犠牲用IP準備

### Phase 1: レート制限
- [ ] 60秒間隔テスト
- [ ] 30秒間隔テスト
- [ ] 15秒間隔テスト
- [ ] 10秒間隔テスト
- [ ] 5秒間隔テスト
- [ ] 結果記録・分析

### Phase 2: Stealth効果
- [ ] Stealthなし + headless
- [ ] Stealthあり + headless
- [ ] Stealthあり + headed
- [ ] 結果比較

### Phase 3: 人間模倣
- [ ] パターンAテスト
- [ ] パターンBテスト
- [ ] パターンCテスト
- [ ] 結果比較

### Phase 4: IP種別
- [ ] データセンターIP
- [ ] 住宅用プロキシ
- [ ] モバイルプロキシ
- [ ] 結果比較

### Phase 5: フィンガープリント
- [ ] 整合ケース
- [ ] 不整合ケース
- [ ] 結果比較

### 最終
- [ ] 安全マージン決定
- [ ] 推奨設定ドキュメント作成
