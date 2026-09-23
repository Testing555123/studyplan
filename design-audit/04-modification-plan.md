# studyplan 頁面修改計劃（三版本）

> 依據：`01-visual-style-analysis.md`（風格與現狀）、`design-tokens.json`（結構化令牌）、`02-design-system-recommendations.md`（令牌架構）、`03-issues-and-fixes.md`（27 條問題清單）
> 對標基準：Notion / Linear｜現狀完成度 **6.0 / 10**
> 性質：**方案文件，未改動任何程式碼**。可直接作為設計評審文件、開發任務清單、AI 生成新頁面的依據。
> 證據格式 `檔案:行號`。對比度為 WCAG 2.1 相對亮度實算（`(L1+0.05)/(L2+0.05)`，白底 `#FFFFFF` 為參考）。

---

## 0. 三版本的關係（先讀這段）

**這不是三套方案，而是同一條改進鏈上的三個停止點。**

```
V1 輕量優化  ⊂  V2 中度重構  ⊂  V3 全面升級
   改色值        補維度           品牌級
   改行為        統控件           重構層級
```

選擇 V2 意味著**先做完 V1 的全部內容**；選擇 V3 意味著**先做完 V1 + V2**。這樣設計是為了避免同時維護三份互相衝突的規範。

**選版決策樹**：

```
兩個月內有上線壓力？
├─ 是 → V1（1–2 天，零視覺回歸風險）
└─ 否
   ├─ 團隊有 1–2 週可投入前端？
   │  ├─ 是 → V2（品質躍升最大，CP 最高）
   │  └─ 否 → V1 + 排期 V2
   └─ 有品牌升級預算與決策權？
      ├─ 是 → V3
      └─ 否 → V2
```

**建議**：**直接做到 V2**。V1 只解決「不達標」，V2 才解決「不高級」；V3 的邊際效益來自品牌資產與裝飾層哲學，需要產品方參與決策，不適合作為純前端任務。

---

## 1. 修改計劃總覽

### 1.1 三版本定位

| | **V1 輕量優化版** | **V2 中度重構版** | **V3 全面升級版** |
|---|---|---|---|
| **一句話定位** | 把不達標的修到合規 | 把散落的收成系統 | 把工具做成品牌 |
| **目標** | 消滅所有 WCAG 不達標項與功能缺陷，零結構變動 | 補齊令牌維度、統一控件規格、建立可調控的視覺系統 | 建立品牌識別資產與資訊層級體系，完成風格哲學收斂 |
| **改動幅度** | 7 個檔案的色值 + 1 處快捷鍵；**不動佈局、不動字階、不動結構** | 新增約 60 個令牌 + 全站替換約 40 處裸值 + 字階重構（含單頁試點） | 新增品牌資產、裝飾層空間隔離、頁腳層級重排、暗色覆蓋 |
| **適合場景** | 兩週內要上線 / 只需過無障礙審核 / 前端人力 < 1 人日 | 有 1–2 週前端工時 / 準備長期迭代 / 準備做第二個頁面 | 品牌升級專案 / 有設計師參與 / 準備對外正式發布 |
| **工期** | 1–2 天 | 1–2 週 | 3–6 週 |
| **是否需品牌方決策** | 否 | 否 | **是** |
| **視覺回歸風險** | 極低 | 中（字階放大需單頁試點） | 中高（涉及版面與裝飾） |
| **完成度預期** | 6.0 → **7.0** | 6.0 → **8.0** | 6.0 → **9.0** |

### 1.2 改動邊界矩陣（防止過度修改）

| 維度 | V1 | V2 | V3 |
|---|:--:|:--:|:--:|
| 改色值 | ✅ | ✅ | ✅ |
| 改快捷鍵/行為 | ✅ | ✅ | ✅ |
| 補令牌維度 | 部分 | ✅ | ✅ |
| 改字階 | ❌ | ✅（試點後全站） | ✅ |
| 統一控件規格 | ❌ | ✅ | ✅ |
| 改佈局結構 | ❌ | ❌ | ✅ |
| 改資訊架構 | ❌ | ❌ | ✅ |
| 新增品牌資產 | ❌ | ❌ | ✅ |
| 裝飾層收斂 | ❌ | 部分 | ✅ |
| 暗色模式覆蓋 | ❌ | ❌ | ✅ |

### 1.3 問題總量與分配

| 來源 | 總數 | V1 處理 | V2 處理 | V3 處理 |
|---|---|---|---|---|
| 03 號文件的 27 條問題 | 27 | 9（P0 全部） | 11（P1 全部） | 7（P2 全部） |
| 本計劃新增的診斷項 | 6 | 1 | 3 | 2 |
| **合計** | **33** | **10** | **14** | **9** |

---

## 2. 現狀問題診斷（17 維）

每維給出：現狀 → 證據 → 等級（🔴 必修 / 🟡 應修 / 🟢 微調 / ✅ 保留）→ 歸屬版本。

### 2.1 風格統一性 🔴 → V2/V3

- **現狀**：企業級克制骨幹與消費級裝飾動效並存。骨幹（殼層 5 個 Vue 檔）零手寫 `dark:`、全靠語義令牌；表皮（`main.css`:346–484 裝飾層）有 5 組無限運行動效。
- **證據**：`main.css`:631（aurora-drift 20–34s infinite）、:652（ring-breathe 5.5s infinite，class L584）、:669（gradient-pan 9s infinite，class L827）；降級區見 L937–966
- **判定**：骨幹為主風格（承載 100% 功能介面、令牌驅動可維護、使用者主要任務路徑全在其上）
- **衝突後果**：`ring-breathe` 與 `aurora-drift` 永不停止，與 Notion/Linear「介面靜止時絕對安靜」的紀律相悖，長時間閱讀產生注意力殘留
- **修法**：V2 做部分收斂（裝飾不進內頁），V3 做空間隔離 + 語義隔離

### 2.2 色彩 🔴 → V1

- **現狀**：`brand-500 #06b6d4` 對白底僅 **2.43:1**，卻同時用於實心按鈕填充、連結文字、圖標色、焦點環——**一個值承擔三種對比度要求，必然至少一種不達標**
- **證據**：`main.css`:53（色值）、`app.config.ts`:23（映射）、`main.css`:127（焦點環）、`AppHeader.vue`:91 與 `AppSidebar.vue`:43（`bg-primary text-white`）
- **實算**：brand-500 相對亮度 L=0.3825 → 白字對比 `(1.05)/(0.4325) = 2.43:1`（AA 正常文字 4.5:1、大字/非文字 3:1 **全項不達標**）
- **次級問題**：`ai-500 #8b5cf6` 對白底 **4.24:1**（差 0.26 未達 4.5:1）；`ai` 色階只有 6 階，缺 200/300/800/900/950
- **修法**：分離「實底用」與「文字用」兩個語義別名（見 M1-01～M1-04）

### 2.3 字體 🟡 → V2

- **現狀**：`Inter` + `Noto Sans SC` + `PingFang SC`，選型**正確**；但 `font-family` 寫在 `@layer base`（`main.css`:117–118）而非 `@theme` 的 `--font-*`
- **證據**：`main.css`:117–118；載入於 `nuxt.config.ts`:184（Google Fonts，異步化 + preconnect）
- **風格庫佐證**：「Modern Dark Cinema (Inter System)」的 mood 為 *technical, precision, clean, premium, developer, professional*，Best For 含 *Developer tools, high-end productivity apps* —— **與本專案定位高度吻合，不換字體**
- **問題**：`font-sans` 工具類不指向 Inter，只靠 html 繼承；無 `--font-mono`
- **修法**：V2 令牌化（M2-08），**不改字體本身**

### 2.4 字階與排版 🔴 → V2

- **現狀**：9 檔非模數化字階 11 / 12 / 12.5 / 13 / 13.5 / 15 / 17 / 22 / 26 px，含 **2 個分數像素**，無 line-height / letter-spacing / font-weight 配對
- **證據**：`main.css`:83–91；分數像素為 `--text-meta: 0.78125rem`(12.5px) 與 `--text-body: 0.84375rem`(13.5px)
- **基準落差**：
  - 風格庫建議字階（Inter 系）：12 labels / 16 body / 22 subhead / 32 section；字重 400 body(lh 1.4–1.5)、600 card titles & buttons、700 section、800 title
  - UX 規範：body line-height 1.5–1.75；行動端正文 ≥16px（Severity: High）
- **實況**：正文 13.5px 比底線少 2.5px；比值序列 1.09/1.04/1.04/1.04/1.11/1.13/1.29/1.18，前五檔肉眼無法區分
- **另有**：5 種硬編碼字號繞過令牌，其中 `text-[11px]` ≡ `--text-eyebrow`、`text-xs` ≡ `--text-caption` 完全同值重複
- **修法**：V2 重構為 7 檔 4px 對齊 + 完整配對（M2-01），**必須先單頁試點**

### 2.5 佈局 🟡 → V2/V3

- **現狀**：側欄 256px ↔ 80px 折疊、頁頭 64px sticky、內容區**無最大寬度約束**
- **證據**：`app.vue`:114–115（w-64/w-20）、`AppHeader.vue`:63（h-16）、`app.vue`:144（`main` 無 `max-w-*`）
- **影響**：超寬螢幕（≥1920px）下各頁內容寬度可能不一致；長文行寬過長影響可讀性
- **修法**：V2 加佈局令牌 + `--layout-content-max: 1200px`（M2-06）

### 2.6 間距 🟢 → V2

- **現狀**：全部使用 Tailwind 默認刻度，天然符合 4px 網格；**無語義層**
- **證據**：`px-5` / `gap-2.5` / `space-y-1` / `mt-16` / `p-4~6` 散落
- **問題**：`p-5` 不知道是「卡片內距」還是「區塊內距」，無法一鍵調整全站密度
- **修法**：V2 加語義別名，**不改刻度值**（M2-09）

### 2.7 圓角 🟡 → V2

- **現狀**：**2 枚死令牌** + 4 種裸值
- **證據**：`--radius-card: 1rem` 與 `--radius-pill: 9999px` 全倉零使用（`main.css`:76–77 僅命中聲明行）；實際用 `rounded-xl`(12) / `rounded-2xl`(16) / `rounded-full` / `rounded-lg`(8)
- **風險**：形同虛設的令牌，未來想統一調圓角時「改了不生效」，是最易被忽視的一類缺陷
- **修法**：V2 令牌值對齊實際使用（card=12 / panel=16 / sm=8 / pill）+ 全站替換（M2-04）

### 2.8 陰影 🔴 → V2

- **現狀**：**無 elevation 令牌、無語義層級**，4 種裸值
- **證據**：`main.css`:396–399（.glass-card 自訂雙層）、:458/:466（shadow-sm → hover:shadow-md）、`app.vue`:130（shadow-xl）、`AppHeader.vue`:91 與 `AppSidebar.vue`:43 與 `AiAssistant.vue`:149（shadow-sm）
- **基準**：風格庫「Dimensional Layering」給出 4 層 elevation：
  - `--elevation-1: 0 1px 3px rgba(0,0,0,0.1)`
  - `--elevation-2: 0 4px 6px rgba(0,0,0,0.1)`
  - `--elevation-3: 0 10px 20px rgba(0,0,0,0.1)`
  - `--elevation-4: 0 20px 40px rgba(0,0,0,0.15)`
  - 並標註 accessibility risk: **high** | requires: contrast-text-4.5, keyboard, visible-focus, reduced-motion
- **修法**：V2 建立 5 層（4 層基準 + 玻璃專用層）（M2-02）

### 2.9 圖標 🟡 → V2

- **現狀**：lucide，來源單一、線性統一、**零 emoji**（✅ 已達標）；但**兩套引入方式並存**、尺寸硬編碼
- **證據**：`Sparkles` 在 `AppSidebar.vue`:44 用 `i-lucide-sparkles`，在 `AppHeader.vue`:10→92 與 `AiAssistant.vue`:14→153/175 用組件導入；尺寸 18/20/14 硬編碼（`AppFooter.vue`:9→27 為 14）
- **判定**：圖標庫**不遷移**（風格庫 Pre-Delivery Checklist 明確接受 Lucide）
- **修法**：V2 統一走 `i-lucide-*` + 尺寸令牌（M2-07）

### 2.10 圖片 🟢 → V3

- **現狀**：**無任何真實圖片資產**，兩處佔位（首字母圓形、品牌方塊）
- **證據**：`AppHeader.vue`:131–135（首字母 `name.slice(0,2).toUpperCase()`，L33–35）、`AppSidebar.vue`:43（品牌方塊）
- **漸變頭像**：`packages/shared/src/constants/avatar.ts`:28 `'from-brand-400 to-brand-600'`，由 L54 `avatarGradientClass(seed)` 導出；依賴 `main.css`:24 的 `@source` 掃描共享包
- **問題**：無 logo、無 favicon、無 OG 圖，品牌不可攜
- **修法**：V3 建品牌資產（M3-01）；`@source` 的 5 層相對路徑脆弱性 → V2 加 CI 檢查（M2-12）

### 2.11 按鈕 🔴 → V1/V2

- **現狀**：實心按鈕白字對比度 **2.43:1** ❌；懸浮 AI 鈕 `h-12 w-12`(48px) 尺寸合格，但 `hover:scale-105 active:scale-95` 為硬編碼
- **證據**：`AppHeader.vue`:91 / `AppSidebar.vue`:43（`bg-primary text-white`）、`AiAssistant.vue`:149
- **基準**：WCAG 2.2 AA 網頁指標目標最小 **24×24 CSS px**，相鄰目標間距 ≥8px（Severity: High）；原生平台為 iOS 44pt / Android 48dp
- **修法**：V1 改填充色（M1-01），V2 建立組件規格表 + 觸控目標核查（M2-10 / M2-11）

### 2.12 卡片 🟡 → V2

- **現狀**：`.card-surface` / `.card-surface-sm` 用 `rounded-2xl` + `shadow-sm → hover:shadow-md`（300ms），圓角與陰影皆非令牌
- **證據**：`main.css`:458 / :466；`.glass-card` 於 :396–399
- **問題**：卡片圓角（16px）與按鈕圓角（12px）無層級關係，是裸值巧合而非設計決策
- **修法**：V2 納入 elevation + radius 令牌（M2-02 / M2-04）

### 2.13 導航 🟡 → V1/V2/V3

- **現狀**：側欄 4 項、折疊態只剩圖標、底部「學習進度 42%」為**靜態假資料**；頁頭無主導航（已遷至側欄，合理）
- **證據**：`AppSidebar.vue`:26–31（4 項）、:57/66/69（折疊態文字隱藏）、:84/87（42% 假資料）、`AppFooter.vue`:15–31（全站僅 1 個頁腳連結）
- **風險**：折疊態圖標若無 accessible name，鍵盤/螢幕閱讀器使用者無法辨識（**推測**：Nuxt UI 的 `UButton` + `icon` prop 通常不自動產生 accessible name，需實測）
- **修法**：V1 補 accessible name（M1-08），V2 補 z-index 層級（M2-03），V3 頁腳層級重排 + 假資料處理（M3-05 / M3-06）

### 2.14 動效 🟢（部分 🔴）→ V2/V3

- **✅ 已達標（不許改）**：`prefers-reduced-motion` **三層覆蓋** —— CSS 全域（`main.css`:449–459）+ 裝飾層補丁（:937–966）+ JS 側（`useTilt.ts`:77、`useReveal.ts`:58）+ `@media (hover:none)` 觸屏降級。品質高於多數商業產品。
- **🔴 問題**：5 組無限動效密度過高（見 2.1）；約 11 種時長散落、無 duration 令牌
- **修法**：V2 補 duration/easing 令牌（M2-05），V3 做空間與語義隔離（M3-02～M3-04）

### 2.15 品牌氣質 🟡 → V3

- **現狀**：品牌識別 = 青藍方塊 + Sparkles 圖標，無 logo 資產；頁腳單薄；品牌人格為「個人開發者技術品牌 / 技術博主」（推測，依據：4 項內容站導航、1 個頁腳連結、靜態假進度、GitHub Star 號召區 + 電子書導流）
- **證據**：`AppHeader.vue`:91 / `AppSidebar.vue`:43（品牌方塊）、`AppFooter.vue`:22–29（唯一連結）
- **品牌一致性框架缺口**（對照 `brand` 技能 checklist）：Logo（無版本/無留白規範/無尺寸規範）、Colors（缺語義狀態色）、Typography（字階未成層級）、Imagery（無資產）、Voice（無術語與大小寫規範）、Channel（頁腳/導航未審）
- **修法**：V3（M3-01、M3-09）

### 2.16 可讀性與無障礙 🔴 → V1/V2

| 項 | 現狀 | 基準 | 判定 |
|---|---|---|---|
| 正文 13.5px | `--text-body`（`main.css`:87） | 行動端 ≥16px | ❌ |
| 行高 | 無配對，散落 `leading-8`（:171）/ `leading-6`（:203） | 1.5–1.75 | ❌ |
| 焦點環 | `outline-brand-500`（:126–128）= 2.43:1 | ≥3:1 狀態對比 + 2px 周長 | ❌ |
| ⌘K | 只註冊 `meta_k`（`app.vue`:52–54） | — | ❌ 功能缺陷 |
| `text-dimmed` | 用於頁腳分隔符（`AppFooter.vue`:30） | 推測 stone-400 = 2.52:1 | ⚠️ 待實測 |
| AI 文字 | ai-500 = 4.24:1 | 4.5:1 | ❌ |
| reduced-motion | 三層覆蓋 | — | ✅ |
| 觸控目標 | 頁頭 64px / AI 鈕 48px / 側欄項未測 | 24×24 CSS px，間距 ≥8px | ⚠️ 待測 |

### 2.17 資訊層級 🟡 → V3

- **現狀**：有隱性層級（語義色 + 字號）但**無顯性定義**。9 檔字階中有至少 5 檔未被使用（`--text-title` / `--text-heading` / `--text-display` 等），說明層級在實作中被繞過
- **證據**：`main.css`:83–91 vs 實際使用；`.prose-post` 用 `text-xl`/`text-lg`（:175/:179）繞過 `--text-heading`/`--text-title`
- **修法**：V3 定義 4 級資訊層級並綁定到字階（M3-08）

---

## 3. 修改策略總表

### 3.1 按維度 × 版本

| 維度 | 策略 | 具體手段（非形容詞） | 版本 |
|---|---|---|---|
| **色彩** | 分離用途 + 加深實底 | 實心填充 500→700（白字 2.43→5.36:1）；文字色 500→700；裝飾色保留 400/500；焦點環 500→700 | V1 |
| **色彩** | 補齊色階 | ai 補 200/300/800/900/950 共 5 階，消除空兜底 | V1 |
| **字階** | 模數化 + 配對 | 9 檔→7 檔 4px 對齊（12/14/16/18/20/24/30）；消分數像素；配 `--leading-*`（正文 1.5）；配 `--tracking-*` | V2 |
| **字重** | 建立對比 | 400 body / 500 次要強調 / 600 卡片標題與按鈕 / 700 區塊標題（依風格庫 Enterprise SaaS 字重建議） | V2 |
| **佈局** | 加約束 | 內容區 `max-w: 1200px`；頁頭高、側欄寬、FAB 尺寸令牌化 | V2 |
| **間距** | 加語義層 | 5 個語義別名（inline/stack/card/block/section），不動刻度值 | V2 |
| **圓角** | 復活 + 統一 | card=12 / panel=16 / sm=8 / pill=9999；全站替換 4 種裸值 | V2 |
| **陰影** | 建層級 | 5 層 elevation（4 層基準 + 玻璃層），雙層結構（近距銳利 + 遠距柔和） | V2 |
| **邊框** | 弱化 | 裝飾性邊框從 `border-primary-400`（對比 1.81:1）改為 `border-default`；僅強調態用主色 | V2 |
| **圖標** | 統一引入 | 全走 `i-lucide-*`；尺寸令牌 5 檔（12/14/16/20/24） | V2 |
| **圖片** | 建資產 | SVG logo + favicon + OG 圖 | V3 |
| **按鈕** | 建規格 | 4 態表（Default/Hover/Active/Disabled）× 6 屬性；觸控 ≥24px | V2 |
| **卡片** | 綁令牌 | padding/radius/shadow 全走 component 層令牌 | V2 |
| **導航** | 補語義 + 層級 | 折疊態加 accessible name；z-index 8 級；頁腳補層級 | V1/V2/V3 |
| **動效** | 收斂 + 令牌化 | duration 7 檔 + easing 3 條；無限動效空間隔離（只進首頁） | V2/V3 |
| **品牌** | 建識別 | logo + 品牌指南 + 語氣規範 | V3 |
| **可讀性** | 放大 + 配行高 | 正文 13.5→16px，行高 24px（1.5） | V2 |
| **無障礙** | 消滅不達標 | 焦點環/AI 文字/⌘K/摺疊態標籤/dimmed 文字 | V1 |
| **資訊層級** | 顯性定義 | 4 級層級 × 字階 × 字重 × 色彩 綁定表 | V3 |

### 3.2 「高級感」的具體實現路徑（回應「不要空泛建議」）

「提升高級感」在本計劃中**被拆解為以下 8 個可驗證動作**，不接受籠統表述：

| # | 動作 | 具體參數 | 驗證方式 |
|---|---|---|---|
| 1 | **降低強調色飽和衝擊** | 實心主色 `#06b6d4`（S=94%, L=43%）→ `#0e7490`（S=82%, L=31%），明度降 12 個百分點 | 實算對比度 5.36:1 |
| 2 | **拉大留白** | 卡片內距 `p-5`(20px) 保持；區塊間距從 `mt-16`(64px) 標準化為 `--space-section: 64px` 並允許頁面覆寫為 80/96px | grep 全站 `mt-16` 歸零 |
| 3 | **減少雜色** | 裝飾色從 7 處字面量收斂為 5 個令牌；強調色使用場景限定為「互動 + 選中」，裝飾性邊框改用 `border-default` | grep `rgb(` 字面量歸零 |
| 4 | **統一圓角** | 4 種裸值 → 4 個令牌，且建立層級關係（sm 8 < card 12 < panel 16 < pill） | grep `rounded-xl/2xl/lg/full` 歸零 |
| 5 | **弱化邊框** | 裝飾邊框 `border-primary-400`（1.81:1，視覺刺眼）→ `border-default`（低對比中性） | 目測 + grep |
| 6 | **優化字重對比** | 建立 400/500/600/700 四級，標題與正文至少差 2 級（正文 400 vs 卡片標題 600） | 字重分佈統計 |
| 7 | **建立陰影層次** | 4 種裸值 → 5 層語義 elevation，相鄰層級偏移量遞增（1px/4px/12px/24px） | grep `shadow-sm/md/xl` 歸零 |
| 8 | **減少持續動效** | 同頁同時運行的 infinite 動效 ≤2 組；`ring-breathe` 週期 5.5s→8s，幅度 .35↔.75→.35↔.55 | DevTools 動效面板計數 |

---

## 4. V1 輕量優化版

### 4.1 目標
消滅所有 WCAG 不達標項與唯一的功能缺陷。**不追求視覺升級，只追求合規與正確。**

### 4.2 改動幅度
7 個檔案的色值調整 + 1 處快捷鍵補綁 + 5 個令牌新增。**不動佈局、不動字階、不動結構、不新增依賴。**

### 4.3 適合場景
兩週內上線 / 只需通過無障礙審核 / 前端人力 < 1 人日 / 作為 V2 的前置階段。

### 4.4 具體修改項

#### M1-01｜實心主色對比度不足
| 欄位 | 內容 |
|---|---|
| **問題** | `brand-500 #06b6d4` 對白底 2.43:1，白字實心按鈕不達 AA（`AppHeader.vue`:91、`AppSidebar.vue`:43） |
| **目標** | 實心按鈕白字對比 ≥4.5:1 |
| **修改方案** | 新增語義別名 `--color-primary-solid: var(--color-brand-700)`（白字 **5.36:1**）、`--color-primary-solid-hover: var(--color-brand-800)`（白字 **7.27:1**）、`--color-primary-text: var(--color-brand-700)`（白底 **5.36:1**）、`--color-primary-decor: var(--color-brand-500)`（裝飾用，維持鮮豔）。寫入 `@layer base { :root { … } }`，不污染 `@theme` 的工具類命名空間 |
| **執行難度** | 低（約 15 行 CSS + 確認 Nuxt UI 覆寫點） |
| **影響範圍** | 全站所有實心按鈕、品牌方塊、強調態 |
| **優先級** | P0 |
| **風險** | **中**：全站強調色變深，是一次可見的品牌色觀感改變。需 `pnpm install` 後先實測 `bg-primary` 解析為 500 還是 600 |
| **驗收標準** | 白字對實心填充 ≥4.5:1（目標 5.36:1）；`text-primary` 對 `bg-default` ≥4.5:1；所有按鈕在 375/768/1440px 三斷點目測無溢出 |
| **目標檔案** | `main.css`（新增別名區塊）、`app.config.ts`（若需覆寫 `--ui-color-primary-500`） |

#### M1-02｜焦點環對比度不足
| 欄位 | 內容 |
|---|---|
| **問題** | `main.css`:126–128 `:focus-visible { @apply outline-2 outline-offset-2 outline-brand-500; }`，2.43:1 < 3:1 門檻；且在 brand-500 實心按鈕上與按鈕同色，完全不可見 |
| **目標** | 焦點環對相鄰色 ≥3:1，且在實心按鈕上可見 |
| **修改方案** | `outline-color: var(--color-brand-700)`（白底 5.36:1）；暗色分支 `.dark :focus-visible { outline-color: var(--color-brand-400); }`（stone-950 上 10.93:1）；對實心按鈕額外加 `box-shadow: 0 0 0 2px var(--color-on-primary)` 白環 |
| **執行難度** | 低（約 6 行 CSS） |
| **影響範圍** | 全站所有可聚焦元素 |
| **優先級** | P0 |
| **風險** | 低。唯一需注意：白環在白底上看不見，僅在實心按鈕上生效，需用 `:where()` 限制作用域 |
| **驗收標準** | Tab 遍歷全站，每個可聚焦元素焦點環清晰可見；實心按鈕上的焦點環可辨識；對比度實測 ≥3:1 |
| **目標檔案** | `main.css`:126–128 |

#### M1-03｜AI 文字色對比度不足
| 欄位 | 內容 |
|---|---|
| **問題** | `ai-500 #8b5cf6` 對白底 4.24:1，差 0.26 未達 4.5:1 |
| **目標** | AI 文字/圖標 ≥4.5:1 |
| **修改方案** | AI 文字與圖標改用 `--color-ai-600 #7c3aed`（**5.70:1**）；`ai-500` 僅保留給裝飾漸變與邊框；`ai-700 #6d28d9`（7.10:1）作為深態文字 |
| **執行難度** | 低 |
| **影響範圍** | `main.css`:426 漸變線、所有 `text-ai-*`、`AiAssistant.vue` |
| **優先級** | P0 |
| **風險** | 低 |
| **驗收標準** | AI 文字/圖標對 `bg-default` ≥4.5:1（目標 5.70:1） |
| **目標檔案** | `main.css`、`AiAssistant.vue` |

#### M1-04｜ai 色階缺 5 檔
| 欄位 | 內容 |
|---|---|
| **問題** | `ai` 只有 6 階（50/100/400/500/600/700），缺 200/300/800/900/950；已註冊為 Nuxt UI 別名（`app.config.ts`:39），會展開 11 階引用，缺檔取空兜底 |
| **目標** | 與 brand 的 11 階對稱，消除空兜底風險 |
| **修改方案** | 補入 Tailwind violet 標準值：`--color-ai-200: #ddd6fe`、`--color-ai-300: #c4b5fd`、`--color-ai-800: #5b21b6`、`--color-ai-900: #4c1d95`、`--color-ai-950: #2e1065` |
| **執行難度** | 低（5 行） |
| **影響範圍** | `main.css`:68–73 區塊；所有 `color="ai"` 組件 |
| **優先級** | P0（與 brand 的踩坑同源，`main.css`:30–39 有明確記錄） |
| **風險** | 無（`@theme static` 已保證輸出） |
| **驗收標準** | build 後產物中含全部 11 個 `--color-ai-*` 變數；`--ui-color-ai-950` 不為空 |
| **目標檔案** | `main.css`:68–73 |

#### M1-05｜⌘K 未綁 Ctrl+K（唯一功能缺陷）
| 欄位 | 內容 |
|---|---|
| **問題** | `app.vue`:52–54 只註冊 `meta_k`，但 L51 註解寫「⌘K / Ctrl+K」，UI 上 `UKbd` 顯示 `⌘K`——Windows/Linux 使用者看到提示卻按不出來 |
| **目標** | 全平台可用 |
| **修改方案** | `defineShortcuts({ meta_k: toggle, ctrl_k: toggle })`；`UKbd` 依平台顯示（`navigator.platform` / UA 判斷，或用 `@vueuse/core` 既有能力） |
| **執行難度** | 低（約 5 行） |
| **影響範圍** | `app.vue` 全局、`AppHeader.vue` 搜尋入口的提示文字 |
| **優先級** | P0 |
| **風險** | 低。注意 `ctrl_k` 在部分瀏覽器可能與其他快捷鍵衝突（如 Firefox 的搜尋列），需實測 |
| **驗收標準** | macOS ⌘K 與 Windows/Linux Ctrl+K 皆可開啟；提示文字隨平台變化 |
| **目標檔案** | `app.vue`:52–54、`AppHeader.vue`（`UKbd` 顯示） |

#### M1-06｜裝飾色字面量散落
| 欄位 | 內容 |
|---|---|
| **問題** | `rgb(255 255 255 / .14)`（`main.css`:397）、`rgb(15 23 42 / .18)`（:398）、`rgb(255 255 255 / .12)`（:557）、`bg-black/40`（`app.vue`:129）、`text-white`（`AppHeader.vue`:91、`AppSidebar.vue`:43）、`opacity-70`（`AppSidebar.vue`:71）均為硬編碼 |
| **目標** | 令牌化，並為 V3 的暗色覆蓋預留掛點 |
| **修改方案** | 新增 `--glass-highlight` / `--shadow-ambient` / `--spot-highlight` / `--overlay-scrim` / `--color-on-primary` / `--opacity-secondary`，寫入 `@layer base { :root { … } }` |
| **執行難度** | 低（約 10 行 + 7 處替換） |
| **影響範圍** | `main.css` 裝飾層、`app.vue`、`AppHeader.vue`、`AppSidebar.vue` |
| **優先級** | P1 |
| **風險** | 低 |
| **驗收標準** | grep 上述字面量歸零；視覺無差異（值完全相同） |
| **目標檔案** | 見上 |

#### M1-07｜`text-dimmed` 用於可讀文字（推測項）
| 欄位 | 內容 |
|---|---|
| **問題** | `text-dimmed` 出現在頁腳分隔符（`AppFooter.vue`:30）；若綁定 stone-400 `#a8a29e`，對白底僅 **2.52:1** ❌ |
| **目標** | 所有需閱讀的文字 ≥4.5:1 |
| **修改方案** | **第一步是實測**：`pnpm install` 後查 `@nuxt/ui` 的 `--ui-text-dimmed` 綁定值。若確為 stone-400，將所有「需閱讀」處改為 `text-muted`（stone-500，**4.80:1**）或 `text-toned`（stone-600，**7.63:1**）；純裝飾元素（分隔符）可保留 dimmed 但加 `aria-hidden` |
| **執行難度** | 低（實測後替換） |
| **影響範圍** | `AppFooter.vue` 及全站 `text-dimmed` 使用處 |
| **優先級** | P0（**待實測確認等級**） |
| **風險** | 低。此條當前標「推測」，等級可能因實測結果調整 |
| **驗收標準** | 實測文件化；所有可讀文字 ≥4.5:1 |
| **目標檔案** | `AppFooter.vue`:30 等 |

#### M1-08｜側欄折疊態圖標缺 accessible name（推測項）
| 欄位 | 內容 |
|---|---|
| **問題** | 折疊為 `w-20` 時導航文字隱藏（`AppSidebar.vue`:57/66/69），只剩圖標；若無 `aria-label`，鍵盤與螢幕閱讀器使用者無法辨識 |
| **目標** | 兩種狀態下皆有可訪問名稱 |
| **修改方案** | 為導航按鈕加 `aria-label={link.label}`（或 `UTooltip`），且在展開/折疊兩態下保持一致 |
| **執行難度** | 低 |
| **影響範圍** | `AppSidebar.vue` 4 個導航項 |
| **優先級** | P0（**待實測**：Nuxt UI 的 `UButton` + `icon` prop 是否已自動產生） |
| **風險** | 低 |
| **驗收標準** | 螢幕閱讀器在折疊態能讀出每個導航項名稱；鍵盤 Tab 可遍歷 |
| **目標檔案** | `AppSidebar.vue`:60–70 |

### 4.5 具體參數建議（V1 全表）

| 令牌 | 舊值 | 新值 | 對比度變化 |
|---|---|---|---|
| `--color-primary-solid` | （無，隱含 brand-500 `#06b6d4`） | `#0e7490`（brand-700） | 白字 2.43:1 → **5.36:1** |
| `--color-primary-solid-hover` | （無） | `#155e75`（brand-800） | 白字 → **7.27:1** |
| `--color-primary-text` | （無，隱含 brand-500） | `#0e7490`（brand-700） | 白底 2.43:1 → **5.36:1** |
| `--color-primary-decor` | （無） | `#06b6d4`（brand-500） | 裝飾用，無對比度要求 |
| `:focus-visible` outline | `brand-500`（2.43:1） | `brand-700`（**5.36:1**）/ 暗色 `brand-400`（**10.93:1**） | — |
| AI 文字/圖標 | `ai-500 #8b5cf6`（4.24:1） | `ai-600 #7c3aed`（**5.70:1**） | — |
| `--color-ai-200/300` | 缺 | `#ddd6fe` / `#c4b5fd` | — |
| `--color-ai-800/900/950` | 缺 | `#5b21b6` / `#4c1d95` / `#2e1065` | — |
| `--color-on-primary` | `text-white` 硬編碼 | `#ffffff` | — |
| `--overlay-scrim` | `bg-black/40` | `rgb(0 0 0 / .4)` | — |
| `--glass-highlight` | `rgb(255 255 255 / .14)` | 同值令牌化 | — |
| `--shadow-ambient` | `rgb(15 23 42 / .18)` | 同值令牌化 | — |
| `--spot-highlight` | `rgb(255 255 255 / .12)` | 同值令牌化 | — |
| `--opacity-secondary` | `opacity-70` | `.7` | — |
| 快捷鍵 | `meta_k` | `meta_k` + `ctrl_k` | — |

### 4.6 影響範圍
7 個檔案：`main.css`、`app.config.ts`（可能需要）、`app.vue`、`AppHeader.vue`、`AppSidebar.vue`、`AppFooter.vue`、`AiAssistant.vue`

### 4.7 風險
| 風險 | 等級 | 緩解 |
|---|---|---|
| 全站強調色變深，是可見的品牌觀感改變 | 中 | 先在單一頁面套用，設計/產品確認後再全站推 |
| `bg-primary` 解析值未實測 | 中 | `pnpm install` 後優先查證；若為 600，改用 700 的調整幅度更小 |
| `ctrl_k` 與瀏覽器快捷鍵衝突 | 低 | 實測主要瀏覽器 |
| 白環焦點樣式在白底失效 | 低 | 用 `:where()` 限制僅實心按鈕生效 |

### 4.8 驗收標準
- [ ] 實心按鈕白字對比 ≥4.5:1（實測，目標 5.36:1）
- [ ] 所有 `text-primary` 對 `bg-default` ≥4.5:1
- [ ] 焦點環對相鄰色 ≥3:1，實心按鈕上可見
- [ ] AI 文字/圖標 ≥4.5:1
- [ ] Tab 遍歷全站焦點環清晰
- [ ] ⌘K 與 Ctrl+K 皆可開啟（含平台化提示）
- [ ] build 產物含完整 11 階 `--color-ai-*`
- [ ] grep `rgb(` / `bg-black/40` / `text-white` 字面量歸零
- [ ] 側欄折疊態每個圖標有 accessible name
- [ ] 視覺回歸：首頁、/posts、/roadmap、/trending 四頁 375/768/1440px 無溢出

### 4.9 修改後預期效果
完成度 6.0 → **7.0**。全站無 WCAG AA 不達標項，功能缺陷歸零。**視覺上唯一的變化是強調色變深**——這會讓品牌色從「鮮豔螢光青」轉為「沉穩科技青」，更接近 Linear 的精密感，但也可能被感知為「沒那麼活潑」。這是 V1 唯一的主觀代價。

---

## 5. V2 中度重構版

> **前提：已完成 V1 全部內容。**

### 5.1 目標
補齊令牌維度、統一控件規格、建立可調控的視覺系統。**這是從「能用」到「好維護」的躍升，也是三個版本中 CP 最高的一版。**

### 5.2 改動幅度
新增約 60 個令牌（分 primitive / semantic / component 三層）+ 全站替換約 40 處裸值 + 字階 9 檔→7 檔重構（含單頁試點）。**保留資訊架構與佈局結構。**

### 5.3 適合場景
有 1–2 週前端工時 / 準備長期迭代 / 準備做第二個頁面 / 團隊開始有「設計不一致」的抱怨。

### 5.4 具體修改項

#### M2-01｜字階模數化（**高風險，需試點**）
| 欄位 | 內容 |
|---|---|
| **問題** | 9 檔非模數化（11/12/12.5/13/13.5/15/17/22/26），含 2 個分數像素，無 line-height / letter-spacing / font-weight 配對；正文 13.5px 低於行動端 16px 底線 |
| **目標** | 建立 4px 對齊、有配對、有層級的字階系統 |
| **修改方案** | 7 檔替換 9 檔：**12 / 14 / 16 / 18 / 20 / 24 / 30 px**；配 `--leading-*`：16/20/24/28/28/32/38（正文 16→24 為 1.5）；配 `--tracking-*`：tight `-0.011em` / normal `0` / eyebrow `0.18em`（取自 `AppSidebar.vue`:53 既有值）；字重 4 級：400 body / 500 次要 / 600 卡片標題與按鈕 / 700 區塊標題（依風格庫 Enterprise SaaS 建議）。**先在 `/posts` 單頁試點** |
| **執行難度** | **高** |
| **影響範圍** | 全站所有文字 |
| **優先級** | P0 |
| **風險** | **高**：正文 13.5→16px 使內容區高度增加約 18%，首頁 2×2 分區、帖子卡片列表、路線頁可能溢出 |
| **驗收標準** | 375/768/1024/1440/1920px 五斷點無溢出；正文行高 1.5；行動端正文 ≥16px；無分數像素；`.prose-post` 的 `text-xl`/`text-lg` 已改指令牌 |
| **目標檔案** | `main.css`:83–91（字階）、:171/:175/:179（prose）、`AppSidebar.vue`:53/70/71/78/82/91 |

#### M2-02｜Elevation 層級
| 欄位 | 內容 |
|---|---|
| **問題** | 無 elevation 令牌，4 種裸值（`shadow-sm`/`shadow-md`/`shadow-xl`/自訂雙層），無語義層級 |
| **目標** | 建立可表達層次關係的陰影系統 |
| **修改方案** | 5 層（依風格庫 Dimensional Layering 的 4 層為基底，加上玻璃專用層）：<br>`--shadow-xs: 0 1px 2px rgb(15 23 42 / .06)`<br>`--shadow-sm: 0 1px 3px rgb(15 23 42 / .08), 0 1px 2px rgb(15 23 42 / .05)`<br>`--shadow-md: 0 4px 12px -2px rgb(15 23 42 / .10), 0 2px 6px -2px rgb(15 23 42 / .05)`<br>`--shadow-lg: 0 12px 32px -8px rgb(15 23 42 / .14), 0 4px 12px -4px rgb(15 23 42 / .07)`<br>`--shadow-overlay: 0 24px 64px -16px rgb(15 23 42 / .22), 0 8px 24px -8px rgb(15 23 42 / .10)`<br>`--shadow-glass: inset 0 1px 0 var(--glass-highlight), 0 12px 40px -16px var(--shadow-ambient)`<br>語義層：`--elevation-card` / `-card-hover` / `-panel` / `-fab` / `-drawer` / `-glass` |
| **執行難度** | 中 |
| **影響範圍** | `main.css`:396–399/:458/:466、`app.vue`:130、`AppHeader.vue`:91、`AppSidebar.vue`:43、`AiAssistant.vue`:149 |
| **優先級** | P1 |
| **風險** | 低。風格庫標註 Dimensional Layering 的 accessibility risk 為 **high**（requires contrast-text-4.5, visible-focus），落地時需同步確認焦點環不被陰影干擾 |
| **驗收標準** | grep `shadow-sm/md/xl` 歸零；相鄰層級偏移量遞增（1/4/12/24px）；卡片 hover 有明確層次變化 |
| **目標檔案** | `main.css` @theme + 6 處替換 |

#### M2-03｜Z-index 層級
| 欄位 | 內容 |
|---|---|
| **問題** | 只有 `z-40`（`AiAssistant.vue`:149）與 `z-50`（`AppHeader.vue`:63、`app.vue`:128）兩個裸值，無體系；AI 懸浮鈕層級低於頁頭 |
| **目標** | 建立可預測的層級，防止新增浮層踩坑 |
| **修改方案** | 8 級：`--z-base: 0` / `--z-sticky: 10` / `--z-dropdown: 20` / `--z-fab: 30` / `--z-header: 40` / `--z-drawer: 50` / `--z-modal: 60` / `--z-toast: 70` / `--z-tooltip: 80`（依 UX 規範「Define z-index scale system (10 20 30 50)」，Severity: High）|
| **執行難度** | 中（需考慮 Nuxt UI 內部 z 值） |
| **影響範圍** | 3 個檔案 + 未來所有浮層 |
| **優先級** | P1 |
| **風險** | **中**：`UHeader` / `UModal` / `USlideover` 內部有自己的 z 值（**推測**為 z-50 級別），可能與本層級衝突，需實測 |
| **驗收標準** | 行動端抽屜開啟時 AI 懸浮鈕被遮罩覆蓋；⌘K 面板在所有元素之上；無 `z-40`/`z-50` 裸值 |
| **目標檔案** | `main.css`（新增）、`app.vue`、`AppHeader.vue`、`AiAssistant.vue` |

#### M2-04｜圓角令牌復活
| 欄位 | 內容 |
|---|---|
| **問題** | `--radius-card: 1rem` / `--radius-pill: 9999px` 零使用（死令牌）；實際用 4 種裸值 |
| **目標** | 令牌值對齊實際使用，並建立層級關係 |
| **修改方案** | `--radius-sm: 0.5rem`(8px) / `--radius-card: 0.75rem`(12px) / `--radius-panel: 1rem`(16px) / `--radius-pill: 9999px`；全站替換：`rounded-lg→rounded-sm`、`rounded-xl→rounded-card`、`rounded-2xl→rounded-panel`、`rounded-full→rounded-pill` |
| **執行難度** | 中（約 15 處替換） |
| **影響範圍** | `AppHeader.vue`、`AppSidebar.vue`、`AiAssistant.vue`、`main.css`（:203/:215/:359/:458/:466/:554） |
| **優先級** | P1 |
| **風險** | 低。注意 `--radius-card` 從 1rem 改為 0.75rem（對齊實際的 rounded-xl），這是**修正令牌而非改視覺** |
| **驗收標準** | grep `rounded-xl/2xl/lg/full` 歸零；令牌使用率 100%（無新死令牌） |
| **目標檔案** | 見上 |

#### M2-05｜Duration / Easing 令牌
| 欄位 | 內容 |
|---|---|
| **問題** | 約 11 種時長散落（`main.css`:251–563、`app.vue`:114/123–126），僅 1 個 easing 令牌 |
| **目標** | 統一一處可調 |
| **修改方案** | `--duration-instant: 100ms` / `-fast: 150ms` / `-base: 200ms` / `-slow: 300ms` / `-slower: 450ms` / `-enter: 200ms` / `-exit: 150ms`（出場快於入場）；easing：`--ease-out-expo: cubic-bezier(.22,1,.36,1)`（已有）/ `--ease-spring: cubic-bezier(.34,1.56,.64,1)`（回彈，既有 `.animate-pop`）/ `--ease-in-out: cubic-bezier(.4,0,.2,1)` |
| **執行難度** | 中（約 14 處替換） |
| **影響範圍** | `main.css` 動效區、`app.vue` |
| **優先級** | P2 |
| **風險** | 低 |
| **驗收標準** | grep 硬編碼時長歸零；出場時長 ≤ 入場時長 |
| **目標檔案** | `main.css`、`app.vue` |

#### M2-06｜佈局令牌 + 內容區最大寬度
| 欄位 | 內容 |
|---|---|
| **問題** | `app.vue`:144 的 `main` 無 `max-w-*`；頁頭高、側欄寬、FAB 尺寸均為裸值 |
| **目標** | 建立可預測的內容寬度與佈局參數 |
| **修改方案** | `--layout-header-h: 4rem`(64px) / `--layout-sidebar-expanded: 16rem`(256px) / `--layout-sidebar-collapsed: 5rem`(80px) / `--layout-content-max: 75rem`(1200px) / `--fab-size: 3rem`(48px) / `--fab-inset: 1.5rem`(24px) / `--blur-glass: 24px`；`app.vue`:144 加 `mx-auto w-full max-w-[var(--layout-content-max)]` |
| **執行難度** | 中 |
| **影響範圍** | `app.vue`、`AppHeader.vue`、`AiAssistant.vue` + 全站頁面寬度 |
| **優先級** | P1 |
| **風險** | **中**：加最大寬度會改變全站頁面的水平留白，需逐頁確認 |
| **驗收標準** | 1920px 下各頁內容寬度一致且 ≤1200px；長文行寬可讀（建議 ≤75 字符） |
| **目標檔案** | `main.css`、`app.vue`:144 |

#### M2-07｜圖標統一
| 欄位 | 內容 |
|---|---|
| **問題** | `Sparkles` 走兩條路徑（`AppSidebar.vue`:44 用 `i-lucide-sparkles`，`AppHeader.vue`:10→92、`AiAssistant.vue`:14→153/175 用組件導入）；尺寸硬編碼 18/20/14 |
| **目標** | 單一路徑 + 尺寸令牌 |
| **修改方案** | 全站統一 `i-lucide-*` 字符串（Nuxt UI 原生、可走 `UIcon` 的 size prop）；`--icon-xs: 12px` / `-sm: 14px` / `-md: 16px` / `-lg: 20px` / `-xl: 24px`；僅在需傳複雜 props 時才用組件導入 |
| **執行難度** | 低（約 8 處） |
| **影響範圍** | `AppHeader.vue`、`AppSidebar.vue`、`AppFooter.vue`、`AiAssistant.vue`、`app.vue` |
| **優先級** | P1 |
| **風險** | 低。注意 tree-shaking 行為差異，替換後需確認 bundle 體積無異常增長 |
| **驗收標準** | `Sparkles` 只有一種引入方式；無硬編碼 `:size=`；同層級圖標尺寸一致 |
| **目標檔案** | 見上 |

#### M2-08｜字體族令牌化
| 欄位 | 內容 |
|---|---|
| **問題** | `font-family` 寫在 `@layer base`（`main.css`:117–118）而非 `@theme` 的 `--font-*`；`font-sans` 工具類不指向 Inter；無 `--font-mono` |
| **目標** | 字體可令牌化替換 |
| **修改方案** | `@theme static { --font-sans: 'Inter', 'Noto Sans SC', 'PingFang SC', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }`；base 層改為 `@apply font-sans` |
| **執行難度** | 低 |
| **影響範圍** | `main.css`:112–119 |
| **優先級** | P1 |
| **風險** | 低。**不換字體**——Inter 選型已被風格庫佐證為正確 |
| **驗收標準** | `font-sans` 解析為 Inter；`font-mono` 可用 |
| **目標檔案** | `main.css` |

#### M2-09｜間距語義層
| 欄位 | 內容 |
|---|---|
| **問題** | 全用 Tailwind 默認刻度，無語義層，無法一鍵調整密度 |
| **目標** | 加別名，不改刻度值 |
| **修改方案** | `--space-inline: 0.5rem`(8px) / `--space-stack: 0.75rem`(12px) / `--space-card: 1.25rem`(20px，現 `p-5`) / `--space-block: 1.5rem`(24px) / `--space-section: 4rem`(64px，取代 `mt-16`) |
| **執行難度** | 低 |
| **影響範圍** | 全站間距（可漸進替換） |
| **優先級** | P2 |
| **風險** | 低 |
| **驗收標準** | 主要組件的間距走語義令牌；可透過改一個值調整全站密度 |
| **目標檔案** | `main.css`、`AppFooter.vue`:15 等 |

#### M2-10｜組件規格表
| 欄位 | 內容 |
|---|---|
| **問題** | 無組件狀態規格，新增組件時重複決策 |
| **目標** | 4 類核心組件的狀態 × 屬性表 |
| **修改方案** | 建立 Button / Card / NavItem / Chip 四張規格表（見 §5.5） |
| **執行難度** | 中 |
| **影響範圍** | 全站組件（文件化為主） |
| **優先級** | P1 |
| **風險** | 低 |
| **驗收標準** | 四張表存在且被新組件遵循；現有組件與表一致 |
| **目標檔案** | `main.css` @layer components + 本文件 §5.5 |

#### M2-11｜觸控目標核查
| 欄位 | 內容 |
|---|---|
| **問題** | 側欄導航項、標籤篩選器等小尺寸互動元素未測 |
| **目標** | 符合 WCAG 2.2 AA |
| **修改方案** | 網頁指標目標 ≥**24×24 CSS px**，相鄰目標間距 ≥**8px**（UX 規範，Severity: High；原生 iOS 44pt / Android 48dp 不適用於網頁判定）；不達標者加大 hit area（用 padding 或偽元素擴展，不改視覺尺寸） |
| **執行難度** | 中（需逐個量測） |
| **影響範圍** | 側欄、標籤篩選、頁頭右區圖標鈕 |
| **優先級** | P1 |
| **風險** | 低 |
| **驗收標準** | 所有互動元素 ≥24×24px 且間距 ≥8px；DevTools 量測通過 |
| **目標檔案** | `AppHeader.vue`、`AppSidebar.vue`、`TagFilter.vue` |

#### M2-12｜`@source` 路徑脆弱性防護
| 欄位 | 內容 |
|---|---|
| **問題** | `main.css`:24 的 `@source '../../../../../packages/shared/src'` 硬編碼 5 層相對路徑；失效時**不報錯**，只是顏色靜默消失（註解 L15–23 已記錄） |
| **目標** | 失效時能被發現 |
| **修改方案** | 加 CI 檢查：build 後 grep 產物中是否含 `from-brand-400` 對應規則；或在 `avatarGradientClass` 的測試中斷言 |
| **執行難度** | 低 |
| **影響範圍** | CI 配置 |
| **優先級** | P2 |
| **風險** | 低 |
| **驗收標準** | 人為改錯路徑時 CI 失敗 |
| **目標檔案** | CI 配置、`main.css`:24 |

### 5.5 組件規格表（M2-10 產出）

**Button（實心主按鈕）**

| 屬性 | Default | Hover | Active | Disabled |
|---|---|---|---|---|
| Background | `--color-primary-solid`（brand-700） | `--color-primary-solid-hover`（brand-800） | brand-800 | `bg-muted` |
| Text | `--color-on-primary`（#fff） | #fff | #fff | `text-dimmed` |
| Border | 無 | 無 | 無 | 無 |
| Shadow | `--shadow-xs` | `--shadow-sm` | 無 | 無 |
| Radius | `--radius-card`（12px） | — | — | — |
| Transition | `--duration-fast` + `--ease-out-expo` | | | |
| 最小尺寸 | 24×24 CSS px（建議 h-9 = 36px） | | | |

**Card**

| 屬性 | 值 |
|---|---|
| Padding | `--space-card`（20px） |
| Radius | `--radius-card`（12px） |
| Border | 1px `border-default`（弱化，非 `border-primary-400`） |
| Shadow | `--elevation-card` → hover `--elevation-card-hover` |
| Shadow transition | `--duration-slow`（300ms） |
| Background | `bg-default` |

**NavItem（側欄導航）**

| 狀態 | Background | Text | Icon |
|---|---|---|---|
| Default | transparent | `text-toned` | `text-toned`（**非 text-dimmed**，避免 2.52:1） |
| Hover | `bg-elevated` | `text-highlighted` | `text-toned` |
| Active | `--color-primary-solid` | `--color-on-primary` | `--color-on-primary` |
| Focus | 上述 + `:focus-visible` outline `brand-700` | | |
| 最小尺寸 | 24×24 CSS px，相鄰間距 ≥8px | | |

**Chip（標籤篩選）**

| 屬性 | 值 |
|---|---|
| 容器 | `flex-wrap`（**禁用 `overflow: hidden`**） |
| 溢出 | 提供可操作的 `+n` 披露 |
| 選中態 | 不能只靠顏色——需同時有填充/邊框差異 |
| 最小尺寸 | 24×24 CSS px，間距 ≥8px |
| 依據 | UX 規範「Chip Collection Reflow」：標籤必須能換行，不得強制單行裁剪（Severity: High） |

### 5.6 具體參數建議（V2 新增令牌全表）

**Primitive 層**（寫入 `@theme static`）

```css
/* 字階 */
--text-xs: 0.75rem;  --text-sm: 0.875rem;  --text-base: 1rem;
--text-lg: 1.125rem; --text-xl: 1.25rem;   --text-2xl: 1.5rem;  --text-3xl: 1.875rem;
/* 行高 */
--leading-xs: 1rem;   --leading-sm: 1.25rem; --leading-base: 1.5rem;
--leading-lg: 1.75rem; --leading-xl: 1.75rem; --leading-2xl: 2rem; --leading-3xl: 2.375rem;
/* 字距 */
--tracking-tight: -0.011em; --tracking-normal: 0em; --tracking-eyebrow: 0.18em;
/* 字體 */
--font-sans: 'Inter','Noto Sans SC','PingFang SC',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
--font-mono: ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
/* 圓角 */
--radius-sm: 0.5rem; --radius-card: 0.75rem; --radius-panel: 1rem; --radius-pill: 9999px;
/* 陰影 5 層 */
--shadow-xs / --shadow-sm / --shadow-md / --shadow-lg / --shadow-overlay / --shadow-glass  /* 見 M2-02 */
/* 時長 7 檔 */
--duration-instant:100ms; --duration-fast:150ms; --duration-base:200ms;
--duration-slow:300ms; --duration-slower:450ms; --duration-enter:200ms; --duration-exit:150ms;
/* easing 3 條 */
--ease-out-expo / --ease-spring / --ease-in-out  /* 見 M2-05 */
/* 間距語義 5 檔 */
--space-inline:0.5rem; --space-stack:0.75rem; --space-card:1.25rem; --space-block:1.5rem; --space-section:4rem;
/* 圖標 5 檔 */
--icon-xs:12px; --icon-sm:14px; --icon-md:16px; --icon-lg:20px; --icon-xl:24px;
```

**Semantic 層**（寫入 `@layer base { :root { } }`，不生成工具類）

```css
--z-base:0; --z-sticky:10; --z-dropdown:20; --z-fab:30; --z-header:40;
--z-drawer:50; --z-modal:60; --z-toast:70; --z-tooltip:80;
--layout-header-h:4rem; --layout-sidebar-expanded:16rem; --layout-sidebar-collapsed:5rem;
--layout-content-max:75rem; --fab-size:3rem; --fab-inset:1.5rem; --blur-glass:24px;
--elevation-card:var(--shadow-xs); --elevation-card-hover:var(--shadow-sm);
--elevation-panel:var(--shadow-sm); --elevation-fab:var(--shadow-md);
--elevation-drawer:var(--shadow-overlay); --elevation-glass:var(--shadow-glass);
```

**Component 層**（寫入各組件類或 Vue 的 `<style>`）

```css
--card-padding: var(--space-card);  --card-radius: var(--radius-card);  --card-shadow: var(--elevation-card);
--button-bg: var(--color-primary-solid); --button-fg: var(--color-on-primary); --button-radius: var(--radius-card);
--nav-item-bg-active: var(--color-primary-solid); --nav-item-fg-active: var(--color-on-primary);
```

### 5.7 影響範圍
全部頁面與組件。字階變更需要逐頁視覺回歸。

### 5.8 風險
| 風險 | 等級 | 緩解 |
|---|---|---|
| 字階放大導致版面溢出 | **高** | `/posts` 單頁試點 → 全站推；五斷點回歸 |
| Nuxt UI 內部 z 值衝突 | 中 | 實測 `UHeader`/`UModal`/`USlideover` 的 z 值後再定層級 |
| 加 `--layout-content-max` 改變全站留白 | 中 | 逐頁確認，允許特殊頁面覆寫 |
| 令牌數量增加導致學習成本 | 低 | 分層命名 + 每個令牌寫註解（延續專案既有習慣） |
| 圖標統一影響 bundle | 低 | 替換後對比 bundle 體積 |

### 5.9 驗收標準
- [ ] 字階 7 檔，無分數像素，正文 16px / 行高 24px
- [ ] 五斷點（375/768/1024/1440/1920）無溢出
- [ ] 陰影 5 層，grep `shadow-sm/md/xl` 歸零
- [ ] 圓角 4 令牌，grep `rounded-xl/2xl/lg/full` 歸零，令牌使用率 100%
- [ ] Z-index 8 級，無裸值；抽屜開啟時 AI 鈕被遮罩覆蓋
- [ ] 圖標單一路徑 + 尺寸令牌
- [ ] `font-sans` 解析為 Inter
- [ ] 所有互動元素 ≥24×24px，間距 ≥8px
- [ ] Chip 容器可換行，無強制裁剪
- [ ] 內容區最大寬度一致（≤1200px）
- [ ] 四張組件規格表被遵循
- [ ] 新增令牌全部有註解說明「為什麼是這個值」

### 5.10 修改後預期效果
完成度 7.0 → **8.0**。視覺上：**字更大更清楚、圓角與陰影有明確層次、品牌色沉穩、全站留白一致**。工程上：**改一個令牌能調全站，新增頁面不再需要重新決策視覺參數**。這是「從零件庫到系統」的轉變。

---

## 6. V3 全面升級版

> **前提：已完成 V1 + V2 全部內容。**

### 6.1 目標
建立品牌識別資產與資訊層級體系，完成風格哲學收斂。**從「好用的工具」變成「有辨識度的品牌」。**

### 6.2 改動幅度
新增品牌資產（logo/favicon/OG）+ 裝飾層空間與語義隔離 + 頁腳資訊層級重排 + 暗色模式裝飾色覆蓋 + 資訊層級顯性定義。**涉及版面與品牌決策。**

### 6.3 適合場景
品牌升級專案 / 有設計師參與 / 準備對外正式發布 / 有變現或招募訴求。

### 6.4 具體修改項

#### M3-01｜品牌資產建立
| 欄位 | 內容 |
|---|---|
| **問題** | 無 logo、無 favicon、無 OG 圖；品牌識別只有「青藍方塊 + Sparkles 圖標」，且 Sparkles 是 AI 類產品通用符號，識別度低 |
| **目標** | 品牌可攜、可辨識 |
| **修改方案** | SVG logo（含字標與單獨符號兩版）+ favicon（多尺寸）+ OG 圖（1200×630）；寫入 `docs/brand-guidelines.md`，定義：最小尺寸、安全留白、單色版本、禁用場景 |
| **執行難度** | 中（需設計資源） |
| **影響範圍** | `app.vue`（head）、`AppHeader.vue`:91、`AppSidebar.vue`:43、`public/` |
| **優先級** | P1 |
| **風險** | 中：品牌識別改變是可見的對外變化，需決策者確認 |
| **驗收標準** | logo 在 16px favicon 至 512px OG 圖全尺寸可辨識；有安全留白與單色版本規範；對照 brand checklist 的 Logo 5 項全通過 |
| **目標檔案** | `public/`、`app.vue`、`AppHeader.vue`、`AppSidebar.vue`、新增 `docs/brand-guidelines.md` |

#### M3-02｜裝飾層空間隔離
| 欄位 | 內容 |
|---|---|
| **問題** | Aurora 光暈、`gradient-frame` 等裝飾動效未限定範圍，可能滲入內頁 |
| **目標** | 裝飾只出現在「歡迎場景」，內容場景保持安靜 |
| **修改方案** | Aurora 與 `.gradient-frame` 僅用於首頁 Hero 與歡迎區；內頁（/posts、/roadmap、/trending、帖子詳情）不載入裝飾層；建立「新增裝飾動效前的 4 問決策」（承載資訊？無限運行？reduced-motion 生效？會進內頁嗎？） |
| **執行難度** | 中 |
| **影響範圍** | `AuroraBackground.vue`、`main.css` 裝飾層（`@layer components` 與 L937–966 降級區）、各頁面 |
| **優先級** | P1 |
| **風險** | 中：首頁與內頁的視覺差異會加大，需確認這是想要的（Notion/Linear 正是這樣做的） |
| **驗收標準** | 內頁無 infinite 動效；首頁保留品牌記憶點；同頁 infinite 動效 ≤2 組 |
| **目標檔案** | `AuroraBackground.vue`、各頁面、`main.css` 裝飾層 |

#### M3-03｜`ring-breathe` 收斂
| 欄位 | 內容 |
|---|---|
| **問題** | 5.5s 無限呼吸（`main.css` L652，class L584），opacity .35↔.75、scale 1↔1.05；在閱讀場景下是持續閃爍 |
| **目標** | 消除被動注意力干擾，或讓其承載明確語義 |
| **修改方案** | 二選一：**A** 改為「有新內容時才呼吸」，靜止時停用；**B** 保留無限但弱化——週期 5.5s → **8s**，opacity 幅度 .35↔.75 → **.35↔.55**，scale 幅度 1↔1.05 → **1↔1.02**。若承載「有新內容」語義，必須同時提供非動效提示（文字/圖標/顏色） |
| **執行難度** | 低 |
| **影響範圍** | `main.css` L584（class）/ L652（keyframes）、使用 `.ring-breathe` 的頭像/卡片 |
| **優先級** | P1 |
| **風險** | 低 |
| **驗收標準** | 若選 B：週期 8s、幅度 .35↔.55；若選 A：靜止時無動效且有非動效提示；reduced-motion 下完全停止 |
| **目標檔案** | `main.css` |

#### M3-04｜`gradient-pan` 改為 hover 觸發
| 欄位 | 內容 |
|---|---|
| **問題** | 9s 無限漸變流動（`main.css` L669，class L827），靜止介面有持續位移 |
| **目標** | 靜止時絕對安靜 |
| **修改方案** | 改為 hover / focus 時才流動，靜止時停在漸變中段（`background-position: 50%`） |
| **執行難度** | 低 |
| **影響範圍** | `main.css` L827（`.gradient-frame`）/ L669（keyframes） |
| **優先級** | P2 |
| **風險** | 低 |
| **驗收標準** | 靜止時無位移；hover 時有流動；reduced-motion 下 hover 也不流動 |
| **目標檔案** | `main.css` |

#### M3-05｜頁腳資訊層級重排
| 欄位 | 內容 |
|---|---|
| **問題** | `AppFooter.vue`:15–31 只有 1 行 2 槽、全站僅 1 個連結（配套電子書）；分隔符為字面量 `|` |
| **目標** | 建立基本的資訊層級與信任感 |
| **修改方案** | 依品牌定位（個人技術品牌）補到 4 組：版權 / 關於 / 回饋或聯絡 / 配套電子書；分隔符改 `border-l` 或 `aria-hidden` 的 span；`mt-16` 改 `--space-section` |
| **執行難度** | 低 |
| **影響範圍** | `AppFooter.vue` |
| **優先級** | P2 |
| **風險** | 低。**注意**：若定位為個人站，過度補連結反而違背「不過度修改」原則——建議至少補「回饋/聯絡」一個入口即可 |
| **驗收標準** | 頁腳有 ≥3 組資訊；無字面量 `|`；對照 brand checklist 的 Website→Footer/navigation 項 |
| **目標檔案** | `AppFooter.vue`:15–31 |

#### M3-06｜側欄假進度資料
| 欄位 | 內容 |
|---|---|
| **問題** | 「學習進度 42%」為靜態假資料（`AppSidebar.vue`:84 文字 + :87 `w-[42%]`），對使用者是誤導 |
| **目標** | 顯示真實資料，或移除 |
| **修改方案** | 接入真實資料源（`/roadmap` 的 `ProgressHeader` 已有計算邏輯可複用）；資料就緒前移除該卡片。若保留進度條，需有文字替代（不能只靠寬度傳達） |
| **執行難度** | 中（需後端/狀態支援） |
| **影響範圍** | `AppSidebar.vue`:77–96、`/roadmap` 頁 |
| **優先級** | P1 |
| **風險** | 低 |
| **驗收標準** | 進度為真實值或卡片已移除；若有進度條則有文字替代 |
| **目標檔案** | `AppSidebar.vue` |

#### M3-07｜暗色模式裝飾色覆蓋
| 欄位 | 內容 |
|---|---|
| **問題** | `.glass-card` 的 `rgb(255 255 255 / .14)` 高光、`rgb(15 23 42 / .18)` 環境陰影、`rgb(255 255 255 / .12)` 高光都是**為亮色設計的**，暗色下白色高光會過曝 |
| **目標** | 暗色模式有獨立的裝飾參數 |
| **修改方案** | `.dark { --glass-highlight: rgb(255 255 255 / .06); --shadow-ambient: rgb(0 0 0 / .40); --spot-highlight: rgb(255 255 255 / .05); }`；`main.css` 玻璃卡（L726）/ 傾斜高光（L912）改引用變數 |
| **執行難度** | 低 |
| **影響範圍** | `main.css` 裝飾層（V1 的 M1-06 已預留掛點） |
| **優先級** | P2 |
| **風險** | 低 |
| **驗收標準** | 暗色下玻璃卡不過曝；兩種模式各測一次對比度 |
| **目標檔案** | `main.css` |

#### M3-08｜資訊層級顯性定義
| 欄位 | 內容 |
|---|---|
| **問題** | 9 檔字階中至少 5 檔未被使用（V2 已減為 7 檔），層級在實作中被繞過（`.prose-post` 用 `text-xl`/`text-lg` 繞過 `--text-heading`/`--text-title`） |
| **目標** | 層級有定義、有綁定、被遵循 |
| **修改方案** | 定義 4 級資訊層級，每級綁定字階 + 字重 + 色彩：<br>**L1 頁面標題**：`--text-3xl`(30px) / 700 / `text-highlighted`<br>**L2 區塊標題**：`--text-2xl`(24px) / 600 / `text-highlighted`<br>**L3 卡片標題**：`--text-xl`(20px) / 600 / `text-highlighted`<br>**L4 正文**：`--text-base`(16px) / 400 / `text-toned`<br>**輔助**：`--text-sm`(14px) / 400 / `text-muted`；`--text-xs`(12px) / 500 / `text-muted` |
| **執行難度** | 中 |
| **影響範圍** | 全站（文件化 + 元件綁定） |
| **優先級** | P1 |
| **風險** | 低 |
| **驗收標準** | 任何新文字都能對號入座到某層級；抽檢 10 處文字全部符合；`.prose-post` 已改指令牌 |
| **目標檔案** | 本文件 + `main.css` prose 區塊 + 各頁面 |

#### M3-09｜品牌語氣與術語規範
| 欄位 | 內容 |
|---|---|
| **問題** | 無語氣規範、無術語表、無大小寫規範（對照 brand checklist 的 Voice 3 項全空） |
| **目標** | 文案一致 |
| **修改方案** | 寫入 `docs/brand-guidelines.md`：語氣（技術、直接、不浮誇）、術語表（「帖子」而非「文章」？「路線」而非「Roadmap」？需決策）、大小寫（按鈕用動詞開頭）、CTA 一致性（「寫文章」「看熱門」等動詞結構統一） |
| **執行難度** | 低（文件工作） |
| **影響範圍** | 全站文案 |
| **優先級** | P2 |
| **風險** | 低 |
| **驗收標準** | brand checklist 的 Tone / Language / Messaging 三組檢查項可執行；抽檢 10 處文案一致 |
| **目標檔案** | 新增 `docs/brand-guidelines.md` |

### 6.5 具體參數建議（V3）

| 項 | 舊值 | 新值 |
|---|---|---|
| `ring-breathe` 週期 | 5.5s | 8s（或改為條件觸發） |
| `ring-breathe` opacity 幅度 | .35 ↔ .75 | .35 ↔ .55 |
| `ring-breathe` scale 幅度 | 1 ↔ 1.05 | 1 ↔ 1.02 |
| `gradient-pan` 觸發 | 9s infinite | hover/focus 才流動，靜止停在 `background-position: 50%` |
| 內頁 infinite 動效數 | 未限制 | 0 |
| 同頁 infinite 動效上限 | 未限制 | ≤ 2 組 |
| 暗色 `--glass-highlight` | `rgb(255 255 255 / .14)` | `rgb(255 255 255 / .06)` |
| 暗色 `--shadow-ambient` | `rgb(15 23 42 / .18)` | `rgb(0 0 0 / .40)` |
| 暗色 `--spot-highlight` | `rgb(255 255 255 / .12)` | `rgb(255 255 255 / .05)` |
| 頁腳資訊組數 | 2 槽（版權 + 電子書） | ≥3 組（版權 / 關於 / 回饋 / 電子書） |
| 側欄進度 | 靜態 42% | 真實值或移除 |
| 資訊層級 | 隱性（9 檔，5 檔未用） | 4 級顯性綁定表 |

### 6.6 影響範圍
全部頁面 + 品牌對外形象 + 新增 `docs/brand-guidelines.md`。

### 6.7 風險
| 風險 | 等級 | 緩解 |
|---|---|---|
| 品牌識別改變需決策者確認 | **中高** | 先出 2–3 個方向提案，確認後再落地 |
| 首頁與內頁視覺差異加大 | 中 | 明確這是刻意策略（對標 Notion/Linear），寫入品牌指南 |
| 裝飾收斂可能被認為「變無聊」 | 中 | 保留首頁記憶點，只收斂內頁與持續動效 |
| 假進度資料移除後側欄底部留白 | 低 | 用其他真實內容（如最新帖子數）替代或移除卡片 |

### 6.8 驗收標準
- [ ] logo 在 16px–512px 全尺寸可辨識，有安全留白與單色版本
- [ ] 內頁無 infinite 動效；同頁 infinite ≤2 組
- [ ] `ring-breathe` 週期 8s / 幅度 .35↔.55，或改為條件觸發
- [ ] `gradient-pan` 靜止時無位移
- [ ] 頁腳 ≥3 組資訊，無字面量 `|`
- [ ] 側欄進度為真實值或已移除
- [ ] 暗色下玻璃卡不過曝，兩種模式對比度各測一次
- [ ] 4 級資訊層級表建立，抽檢 10 處文字符合
- [ ] `docs/brand-guidelines.md` 存在，含 Logo/Colors/Typography/Imagery/Voice 五節
- [ ] brand checklist 的 Visual Consistency 四組可執行

### 6.9 修改後預期效果
完成度 8.0 → **9.0**。視覺上：**內頁極度安靜、首頁有記憶點、品牌有識別、資訊層級一眼可辨**。這是從「好看的介面」到「有觀點的產品」的轉變，也是唯一能支撐對外正式發布與品牌變現的版本。

---

## 7. 任務拆解清單

### 7.1 任務總表（33 項）

| ID | 任務 | 版本 | 優先級 | 難度 | 依賴 |
|---|---|---|---|---|---|
| M1-01 | 實心主色 → brand-700 | V1 | P0 | 低 | 實測 `bg-primary` |
| M1-02 | 焦點環 → brand-700 + 暗色分支 | V1 | P0 | 低 | — |
| M1-03 | AI 文字 → ai-600 | V1 | P0 | 低 | — |
| M1-04 | 補 ai 色階 5 檔 | V1 | P0 | 低 | — |
| M1-05 | ⌘K 補綁 ctrl_k | V1 | P0 | 低 | — |
| M1-06 | 裝飾色字面量令牌化 | V1 | P1 | 低 | — |
| M1-07 | `text-dimmed` 實測與處理 | V1 | P0 | 低 | `pnpm install` |
| M1-08 | 側欄摺疊態 accessible name | V1 | P0 | 低 | 實測 Nuxt UI |
| M1-09 | 視覺回歸（四頁 × 三斷點） | V1 | P0 | 低 | M1-01 |
| M1-10 | `Sparkles` 雙路徑記錄（不修，V2 處理） | V1 | P2 | — | — |
| M2-01 | 字階 9→7 檔 + 配對（含單頁試點） | V2 | P0 | **高** | V1 完成 |
| M2-02 | Elevation 5 層令牌 | V2 | P1 | 中 | — |
| M2-03 | Z-index 8 級 | V2 | P1 | 中 | 實測 Nuxt UI z 值 |
| M2-04 | 圓角令牌復活 + 全站替換 | V2 | P1 | 中 | — |
| M2-05 | Duration 7 檔 + Easing 3 條 | V2 | P2 | 中 | — |
| M2-06 | 佈局令牌 + 內容區 max-w | V2 | P1 | 中 | — |
| M2-07 | 圖標統一 `i-lucide-*` + 尺寸令牌 | V2 | P1 | 低 | — |
| M2-08 | 字體族令牌化 | V2 | P1 | 低 | — |
| M2-09 | 間距語義層 | V2 | P2 | 低 | — |
| M2-10 | 四張組件規格表 | V2 | P1 | 中 | M2-02/04 |
| M2-11 | 觸控目標核查（24px / 8px） | V2 | P1 | 中 | — |
| M2-12 | `@source` 路徑 CI 檢查 | V2 | P2 | 低 | — |
| M2-13 | 無新死令牌檢查（grep 使用率） | V2 | P2 | 低 | M2-02/04/07 |
| M2-14 | 五斷點全站視覺回歸 | V2 | P0 | 中 | M2-01/06 |
| M3-01 | 品牌資產（logo/favicon/OG） | V3 | P1 | 中 | 設計資源 |
| M3-02 | 裝飾層空間隔離 | V3 | P1 | 中 | — |
| M3-03 | `ring-breathe` 收斂 | V3 | P1 | 低 | — |
| M3-04 | `gradient-pan` 改 hover 觸發 | V3 | P2 | 低 | — |
| M3-05 | 頁腳資訊層級重排 | V3 | P2 | 低 | — |
| M3-06 | 側欄假進度接真實源或移除 | V3 | P1 | 中 | 資料源 |
| M3-07 | 暗色裝飾色覆蓋 | V3 | P2 | 低 | M1-06 |
| M3-08 | 資訊層級 4 級定義 | V3 | P1 | 中 | M2-01 |
| M3-09 | 品牌語氣與術語規範 | V3 | P2 | 低 | — |

### 7.2 並行建議
- **可並行**：M1-02 / M1-03 / M1-04 / M1-05 互不依賴
- **需串行**：M1-01 → M1-09（改色 → 回歸）；M2-01 → M2-14（字階 → 全站回歸）
- **V3 可提前啟動**：M3-01（品牌資產）與 M3-09（語氣規範）是設計工作，可與 V2 的開發並行

---

## 8. 修改前後對照表

### 8.1 色彩

| 項目 | 修改前 | 修改後 | 對比度變化 |
|---|---|---|---|
| 實心按鈕填充 | `brand-500 #06b6d4` | `brand-700 #0e7490` | 白字 2.43:1 → **5.36:1** |
| 實心按鈕 hover | （無定義） | `brand-800 #155e75` | → **7.27:1** |
| 連結/圖標文字 | `brand-500`（2.43:1） | `brand-700`（**5.36:1**） | ❌ → ✅ |
| 焦點環 | `brand-500`（2.43:1） | `brand-700`（**5.36:1**）／暗色 `brand-400`（**10.93:1**） | ❌ → ✅ |
| AI 文字/圖標 | `ai-500 #8b5cf6`（4.24:1） | `ai-600 #7c3aed`（**5.70:1**） | ❌ → ✅ |
| ai 色階 | 6 階（缺 200/300/800/900/950） | 11 階 | 消除空兜底 |
| 裝飾邊框 | `border-primary-400`（1.81:1，刺眼） | `border-default`（中性低對比） | 弱化 |
| 遮罩 | `bg-black/40` 硬編碼 | `--overlay-scrim` | 令牌化 |

### 8.2 排版

| 項目 | 修改前 | 修改後 |
|---|---|---|
| 字階數 | 9 檔 | 7 檔 |
| 字階值 | 11/12/12.5/13/13.5/15/17/22/26 | **12/14/16/18/20/24/30** |
| 分數像素 | 2 個（12.5 / 13.5） | 0 |
| 正文 | 13.5px | **16px** |
| 行高 | 無配對，散落 `leading-6/8` | `--leading-*`，正文 **24px（1.5）** |
| 字重 | 散落 `font-medium/semibold` | 4 級：400 / 500 / 600 / 700 |
| 字距 | `tracking-[0.18em]` 硬編碼 ×1 | `--tracking-tight/normal/eyebrow` |
| 硬編碼字號 | 5 種（`text-[11px]` / `text-xs` / `text-sm` / `text-xl` / `text-lg`） | 0 |
| 字體族位置 | `@layer base` | `@theme` 的 `--font-sans` / `--font-mono` |

### 8.3 維度令牌

| 維度 | 修改前 | 修改後 |
|---|---|---|
| 陰影 | 4 種裸值，無層級 | **5 層語義 elevation** |
| 圓角 | 2 枚死令牌 + 4 種裸值 | **4 令牌，使用率 100%** |
| Z-index | `z-40` / `z-50` 裸值 | **8 級語義層級** |
| 時長 | 約 11 種散落 | **7 檔令牌** |
| Easing | 1 個令牌 | **3 條** |
| 間距 | Tailwind 默認刻度，無語義層 | **5 個語義別名**（刻度值不變） |
| 佈局 | 全裸值，內容區無 max-w | **7 個佈局令牌 + max-w 1200px** |
| 圖標尺寸 | 18/20/14 硬編碼 | **5 檔令牌** |
| 圖標引入 | 2 種方式 | **1 種（`i-lucide-*`）** |
| 透明度 | `opacity-70` / `bg-*/60~75` 硬編碼 | **令牌** |

### 8.4 動效與裝飾

| 項目 | 修改前 | 修改後 |
|---|---|---|
| `ring-breathe` | 5.5s infinite / .35↔.75 / scale 1↔1.05 | 8s / .35↔.55 / scale 1↔1.02，或改條件觸發 |
| `gradient-pan` | 9s infinite 常駐 | hover/focus 才流動，靜止停 50% |
| 內頁 infinite 動效 | 未限制 | **0** |
| 同頁 infinite 上限 | 未限制 | **≤2 組** |
| 暗色玻璃高光 | `rgb(255 255 255 / .14)`（過曝） | `rgb(255 255 255 / .06)` |
| 暗色環境陰影 | `rgb(15 23 42 / .18)` | `rgb(0 0 0 / .40)` |
| reduced-motion | 三層覆蓋 | **不變（已達標）** |

### 8.5 組件與品牌

| 項目 | 修改前 | 修改後 |
|---|---|---|
| 按鈕狀態規格 | 無 | 4 態 × 6 屬性表 |
| 卡片規格 | 圓角/陰影/內距皆裸值 | 全綁 component 令牌 |
| 側欄摺疊態標籤 | 無（推測） | `aria-label` |
| 觸控目標 | 未測 | ≥24×24 CSS px，間距 ≥8px |
| Chip 換行 | 未驗證 | `flex-wrap` + `+n` 披露 |
| 側欄進度 | 靜態 42% | 真實值或移除 |
| 頁腳資訊組 | 2 槽 / 1 連結 | ≥3 組 / ≥3 連結 |
| 頁腳分隔符 | 字面量 `\|` | `border-l` 或 `aria-hidden` span |
| Logo | 無（青藍方塊 + Sparkles） | SVG logo + favicon + OG |
| 資訊層級 | 隱性（9 檔，5 檔未用） | **4 級顯性綁定表** |
| 品牌指南 | 無 | `docs/brand-guidelines.md` |

---

## 9. 保留 / 修改 / 移除 / 避免引入

### 9.1 保留（不得改動）

| 項目 | 為什麼 |
|---|---|
| **`prefers-reduced-motion` 三層覆蓋** | CSS 全域（`main.css`:449–459）+ 裝飾補丁（:937–966）+ JS（useTilt.ts:77 / useReveal.ts:58）+ `@media (hover:none)`。品質高於多數商業產品，是全專案做得最好的一塊 |
| **色值單一來源架構** | `@theme` 定義、`app.config.ts` 只做別名映射（`app.config.ts`:8–11 註解明言）。這是正確的設計系統架構 |
| **`@theme static` 強制輸出** | `main.css`:41，註解 L30–39 記錄踩坑。正確修復，並應套用到 `ai` |
| **殼層零手寫 `dark:`** | 5 個 Vue 檔 `dark:` 計數 = 0，全靠語義令牌。正確架構 |
| **Inter 字體選型** | 風格庫「Modern Dark Cinema (Inter System)」的 mood 與 Best For 與本專案定位完全吻合 |
| **lucide 圖標庫** | 風格庫 Pre-Delivery Checklist 明確接受 Lucide；全站來源單一、線性統一、零 emoji |
| **使用 Nuxt UI 組件而非自造類** | `main.css`:148–160 記錄了 `.glass-bar`/`.nav-link`/`.post-card`/`.ai-panel`/`.tag-pill-*` 的刪除歷程，方向正確 |
| **`AuroraBackground` 本身** | 是品牌記憶點。問題在「擴散到內頁」而非「存在」 |
| **踩坑即寫註解的習慣** | `@source`（L15–23）、`@theme static`（L30–39）、`v-if` 取代 `v-model`（L156–163）、`.glass-panel` 無陰影（L440–442）。這是最值得保留的工程文化 |
| **warm neutral（stone）** | `app.config.ts`:31，註解說明改動意圖為護眼舒適。方向正確 |
| **`v-if` + `:open=true` 的掛載策略** | `AiAssistant.vue`:156–163 註解說明 v-model 下抽屜不渲染。這是踩過坑的正確解 |

### 9.2 只微調（不重構）

| 項目 | 微調內容 |
|---|---|
| 主色 | 只加深實底與文字用色（500→700），**不改色相**（維持青藍識別） |
| ai 色板 | 只補色階 + 文字改用 600，**不改色相** |
| 字階 | 重構為 7 檔，但**不改字體、不改字重家族**，只是重新組織 |
| 圓角 | 值基本不變（8/12/16/pill），只是從裸值改為令牌 |
| 間距 | **刻度值完全不變**，只加語義別名 |
| 裝飾動效 | 只調參數（週期/幅度/觸發條件），**不刪除** |
| 圖標 | 只統一引入方式與尺寸來源，**不換庫** |
| 佈局 | 只加 max-width 約束與參數令牌化，**不改側欄/頁頭結構** |

### 9.3 必須重構

| 項目 | 為什麼不能只微調 |
|---|---|
| **字階系統** | 9 檔含分數像素且比值擠在 1.04–1.11，微調無效，必須重新組織為 7 檔 |
| **色彩語義分離** | 「一個 brand-500 同時當實底/文字/裝飾」是結構性錯誤，必須拆分為 3 個語義別名 |
| **Elevation 體系** | 從無到有，無從微調 |
| **Z-index 體系** | 從 2 個裸值到 8 級，無從微調 |
| **令牌三層架構** | 目前只有 primitive 層（且只有顏色與字號），需要建立 semantic 與 component 兩層 |
| **AI 色彩語義** | `AiAssistant` 完全不用 ai 色板，與設計意圖矛盾。必須二選一：改實作或改註解，**不能維持現狀** |
| **品牌資產** | 從無到有 |
| **資訊層級** | 從隱性到顯性定義 |

### 9.4 避免引入（明確禁止）

| 禁止項 | 理由 |
|---|---|
| **換掉 Inter** | 選型已被風格庫佐證正確，換字體是純風險無收益 |
| **遷移圖標庫到 Phosphor** | `ui-ux-pro-max` 默認推薦 Phosphor，但 Lucide 已被規範接受且全站統一。遷移是純成本 |
| **手寫 `dark:` 變體** | 殼層零手寫是正確架構，引入手工 dark 會破壞語義令牌的單一來源 |
| **重寫 reduced-motion 處理** | 已達標且超過標準，重寫可能引入回退 |
| **刪除 `AuroraBackground`** | 是品牌記憶點，問題在範圍控制不在存在與否 |
| **引入第二個強調色** | 目前 brand + ai 已是冷暖雙色，再加入第三色會破壞「單一強調色」的克制原則 |
| **引入 CSS-in-JS / 新的樣式方案** | 專案已用 Tailwind 4 CSS-first + Nuxt UI，引入第二套樣式系統會造成雙軌 |
| **為了「高級感」加更多陰影與漸變** | 本專案的「高級感」路徑是**做減法**（弱化邊框、統一圓角、減少雜色、降低持續動效），不是加法 |
| **引入 emoji 作為圖標** | 全站目前零 emoji，這是對的 |
| **一次性全站替換字階而不試點** | 正文放大 18% 有溢出風險，必須先 `/posts` 單頁試點 |
| **在 V1 階段改佈局或字階** | V1 的價值就是「零結構變動、零回歸風險」，擴大範圍會喪失這個特性 |

---

## 10. 設計驗收標準

### 10.1 通用（每版都要過）

**對比度**
- [ ] 實心按鈕白字對填充 ≥4.5:1（目標 5.36:1）
- [ ] 所有 `text-primary` 對 `bg-default` ≥4.5:1
- [ ] 焦點環對相鄰色 ≥3:1，且在實心按鈕上可見
- [ ] AI 文字/圖標對 `bg-default` ≥4.5:1
- [ ] 所有可讀文字（非裝飾）對背景 ≥4.5:1
- [ ] **暗色模式重跑上述全部**（不假設亮色值適用）

**鍵盤與無障礙**
- [ ] Tab 遍歷全站，每個可聚焦元素焦點環清晰
- [ ] ⌘K 與 Ctrl+K 皆可開啟命令面板
- [ ] 側欄摺疊態每個圖標有 accessible name
- [ ] 螢幕閱讀器朗讀順序與視覺順序一致
- [ ] `prefers-reduced-motion: reduce` 下全站無持續動效
- [ ] 所有互動元素 ≥24×24 CSS px，相鄰間距 ≥8px（WCAG 2.2 AA）
- [ ] 裝飾性圖標 `aria-hidden`，有意義圖標有文字替代
- [ ] 顏色不是唯一資訊載體

**響應式**
- [ ] 375 / 768 / 1024 / 1440 / 1920px 五斷點無溢出、無裁切
- [ ] 行動端抽屜開啟時 AI 懸浮鈕被遮罩覆蓋
- [ ] 觸控目標在行動端加大（不放用桌面尺寸）
- [ ] 長文行寬可讀（建議 ≤75 字符）

**一致性**
- [ ] grep：`rgb(` 字面量 = 0
- [ ] grep：`shadow-sm/md/xl` = 0（V2 起）
- [ ] grep：`rounded-xl/2xl/lg/full` = 0（V2 起）
- [ ] grep：`z-40`/`z-50` = 0（V2 起）
- [ ] grep：`text-[Npx]` = 0（V2 起）
- [ ] 令牌使用率 100%（無死令牌）
- [ ] 每個新增令牌有註解說明「為什麼是這個值」

### 10.2 V1 專屬
- [ ] build 產物含完整 11 階 `--color-ai-*`，`--ui-color-ai-950` 不為空
- [ ] 四頁（/、/posts、/roadmap、/trending）× 三斷點視覺回歸通過
- [ ] 已完成 `--ui-text-dimmed` 與 `bg-primary` 的實測並文件化

### 10.3 V2 專屬
- [ ] 字階 7 檔，無分數像素，正文 16px / 行高 24px
- [ ] `/posts` 單頁試點通過後才全站推
- [ ] Chip 容器可換行，無強制裁剪，溢出有 `+n` 披露
- [ ] 內容區最大寬度一致（≤1200px）
- [ ] 四張組件規格表（Button/Card/NavItem/Chip）被遵循
- [ ] 圖標單一路徑，bundle 體積無異常增長

### 10.4 V3 專屬
- [ ] logo 在 16px（favicon）至 512px（OG）全尺寸可辨識
- [ ] logo 有安全留白規範與單色版本
- [ ] 內頁 infinite 動效數 = 0；首頁同頁 infinite ≤2 組
- [ ] `ring-breathe` 若承載語義則有非動效替代
- [ ] `docs/brand-guidelines.md` 含 Logo/Colors/Typography/Imagery/Voice 五節
- [ ] brand checklist 的 Visual Consistency 四組可執行
- [ ] 4 級資訊層級表建立，抽檢 10 處文字符合

---

## 11. 實施路線圖

### 11.1 時間軸

```
Week 0（前置，0.5 天）
└ pnpm install → 實測 Nuxt UI 的 --ui-* 綁定與 bg-primary 解析值
  （M1-01 / M1-07 / M1-08 / M2-03 四項都依賴這一步）

Week 1（V1，1–2 天）
├ Day 1 上午：M1-01 實心主色 + M1-02 焦點環 + M1-03 AI 色
├ Day 1 下午：M1-04 補 ai 色階 + M1-05 ⌘K + M1-06 令牌化
├ Day 2 上午：M1-07 dimmed 實測處理 + M1-08 摺疊態標籤
└ Day 2 下午：M1-09 視覺回歸（四頁 × 三斷點）
  ▸ 檢查點：V1 驗收標準全過 → 可停在此，也可續做 V2

Week 2–3（V2，1–2 週）
├ W2 Day 1–2：M2-02 Elevation + M2-04 圓角 + M2-03 Z-index（低風險，先做）
├ W2 Day 3–4：M2-07 圖標 + M2-08 字體 + M2-05 時長 + M2-09 間距
├ W2 Day 5：M2-01 字階試點（僅 /posts）
├ W3 Day 1–2：M2-01 全站推 + M2-06 佈局 max-w
├ W3 Day 3：M2-10 組件規格 + M2-11 觸控目標
├ W3 Day 4：M2-12 CI 檢查 + M2-13 死令牌檢查
└ W3 Day 5：M2-14 五斷點全站回歸
  ▸ 檢查點：V2 驗收標準全過

Week 4–9（V3，3–6 週）
├ 設計階段（可與 V2 並行啟動）
│  ├ M3-01 品牌資產（logo/favicon/OG）
│  └ M3-09 品牌語氣規範
├ 開發階段
│  ├ M3-08 資訊層級定義（文件先行）
│  ├ M3-02 裝飾層空間隔離
│  ├ M3-03 ring-breathe 收斂 + M3-04 gradient-pan 改 hover
│  ├ M3-06 側欄假進度
│  ├ M3-05 頁腳層級重排
│  └ M3-07 暗色裝飾色覆蓋
└ 檢查點：V3 驗收標準全過 + brand checklist 可執行
```

### 11.2 決策檢查點

| 檢查點 | 時機 | 決策內容 |
|---|---|---|
| **CP0** | Week 0 後 | 實測結果是否推翻「brand-500 → 700」的方案？（若 `bg-primary` 實為 600，改為 700 的幅度更小） |
| **CP1** | V1 完成 | 強調色變深是否被接受？**這是 V1 唯一的主觀代價** |
| **CP2** | V2 字階試點後 | 正文 16px 是否導致版面溢出？是否要退回 15px 或調整行高補償？ |
| **CP3** | V2 完成 | 是否投入 V3？（需品牌方決策與設計資源） |
| **CP4** | V3 設計階段 | logo 方向、AI 色彩語義（改實作 vs 改註解）、裝飾收斂程度 |

### 11.3 依賴與阻塞

| 阻塞項 | 影響 | 解除方式 |
|---|---|---|
| `node_modules` 未安裝 | M1-01 / M1-07 / M1-08 / M2-03 | `pnpm install`（Week 0 必做） |
| 設計資源未到位 | M3-01 / M3-09 | 提前 2 週提出需求，可與 V2 並行 |
| 真實進度資料源 | M3-06 | 後端/狀態層支援，或先移除卡片 |
| 品牌方向未決策 | M3-01 / M3-02 | CP3 後才啟動 |

---

## 12. 結構化 JSON

機器可讀版本見同目錄 **`modification-plan.json`**，結構：

```jsonc
{
  "meta":              { "project", "basis", "benchmark", "currentScore", "versionRelation" },
  "diagnosis":         [ /* 17 維：dimension / status / severity / evidence[] / gap / version */ ],
  "strategy":          [ /* 維度 × 手段 × 版本 */ ],
  "versions": {
    "V1": { "goal", "scope", "scenario", "effort", "changes[]", "params{}", "impact", "risks[]", "acceptance[]", "expectedOutcome" },
    "V2": { ... },
    "V3": { ... }
  },
  "changes[]":         { "id", "version", "problem", "goal", "solution", "difficulty", "impact", "priority", "risk", "acceptance", "targetFiles[]" },  // 8 欄位齊備
  "beforeAfter[]":     { "category", "item", "before", "after", "metric" },
  "keepModifyRemoveAvoid": { "keep[]", "tweakOnly[]", "mustRefactor[]", "avoidIntroducing[]" },
  "acceptanceChecklist": { "common[]", "V1[]", "V2[]", "V3[]" },
  "roadmap[]":         { "phase", "week", "tasks[]", "checkpoint" },
  "checkpoints[]":     { "id", "timing", "decision" },
  "blockers[]":        { "item", "impact", "resolution" }
}
```

---

## 13. 與 01/02/03 的關係

| 文件 | 角色 | 本計劃如何使用 |
|---|---|---|
| `01-visual-style-analysis.md` | 現狀與論證（每條結論附行號） | §2 的 17 維診斷全部引自此文件的實測結論 |
| `design-tokens.json` | 結構化令牌數據 | §5.6 / §8 的舊值全部引自此 JSON |
| `02-design-system-recommendations.md` | 三層令牌架構建議 | §5 的 V2 方案是此文件建議的**排期化與參數化** |
| `03-issues-and-fixes.md` | 27 條問題清單 | §7 的 M1-xx / M2-xx 多數對應此文件的 P0/P1/P2 編號 |
| **`04-modification-plan.md`（本文件）** | **排期與決策** | 回答「做哪些、什麼時候做、做完怎麼驗」 |
| `modification-plan.json` | 機器可讀任務清單 | 可直接轉為 issue / ticket |

**差異說明**：本計劃在 03 號文件的 27 條之外新增 6 條診斷項（M1-09 視覺回歸、M1-10 雙路徑記錄、M2-13 死令牌檢查、M2-14 全站回歸、M3-08 資訊層級、M3-09 品牌語氣），多為**流程性任務**（回歸、檢查、規範），非新增缺陷。

---

## 14. 已知未實測項

以下結論標註「推測」，執行前需驗證：

| 項 | 推測內容 | 驗證方式 |
|---|---|---|
| `--ui-text-dimmed` 綁定 | 推測為 stone-400 `#a8a29e`（2.52:1） | `pnpm install` 後 grep `@nuxt/ui` 的 `--ui-text-dimmed` |
| `--ui-text-muted` / `--ui-text-toned` 綁定 | 推測為 stone-500（4.80:1）/ stone-600（7.63:1） | 同上 |
| `bg-primary` 解析值 | 推測為 brand-500（2.43:1） | build 後實測按鈕實際背景色 |
| Nuxt UI 內部 z 值 | 推測為 z-50 級別，可能與 M2-03 的 8 級衝突 | 實測 `UHeader` / `UModal` / `USlideover` |
| 側欄摺疊態 accessible name | 推測 `UButton` + `icon` prop 不自動產生 | 螢幕閱讀器實測或查 DOM |
| success/warning 語義色對比度 | 本計劃未給實測值 | 若引入需另行實算 |
