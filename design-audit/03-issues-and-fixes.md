# studyplan 設計系統問題清單與優化方案

> 配套文件：`01-visual-style-analysis.md`（現狀與論證）、`design-tokens.json`（結構化數據）、`02-design-system-recommendations.md`（可複用建議）
> 分級：**P0** = 影響可讀性/可用性，應立即修；**P1** = 一致性或品質問題，近期修；**P2** = 優化與預防，排期修。
> 本文件只給方案，**未改動任何程式碼**。

---

## 問題總覽

| 類別 | P0 | P1 | P2 | 小計 |
|---|---|---|---|---|
| 視覺 / 對比度 | 3 | 2 | 1 | 6 |
| 無障礙 | 3 | 2 | 1 | 6 |
| 響應式 | 1 | 1 | 1 | 3 |
| 一致性 | 1 | 4 | 3 | 8 |
| 品牌 / 資料 | 1 | 2 | 1 | 4 |
| **合計** | **9** | **11** | **7** | **27** |

---

## 一、視覺 / 對比度

### P0-1｜全站強調色 `#06b6d4` 對白底僅 2.43:1，無法承載白字與文字

- **現象**：`brand-500 #06b6d4` 同時被用作實底按鈕填充、連結文字、圖標色、焦點環色，但對白底對比度只有 **2.43:1**。
- **證據**：
  - `--color-brand-500: #06b6d4`（`main.css`:53），`primary: 'brand'`（`app.config.ts`:23）
  - 白字 on `brand-500` = **2.43:1**，遠低於 AA 的 4.5:1（正常文字）與 3:1（大字/非文字）
  - 實測計算：`brand-500` 相對亮度 L=0.3825 → `(1.05)/(0.4325) = 2.43`
  - 受影響處：`AppHeader.vue`:91 品牌方塊 `bg-primary text-white`、`AppSidebar.vue`:43 同上、`main.css`:127 焦點環 `outline-brand-500`
- **影響**：主按鈕文字、品牌方塊圖標、所有 `text-primary` 小字在亮色模式下均不達 WCAG AA。這是全站最嚴重的單一問題。
- **改法**（二選一）：
  - **A（建議）**：實底填充改用 `brand-700 #0e7490`（白字 **5.36:1** ✅），hover 用 `brand-800 #155e75`（白字 **7.27:1** ✅）。落地方式見 `02` §2.2 的 `--color-primary-solid` 別名。
  - **B**：保留 `brand-500` 實底，但文字改用 `brand-950 #083344`（深色字）。觀感偏螢光，不建議。
- **目標檔案**：`main.css`（新增別名）、`app.config.ts`（若 Nuxt UI 的 `bg-primary` 解析為 500，需在 `@theme` 層調整或覆寫 `--ui-color-primary-500`）
- **前置**：需先 `pnpm install` 後實測 Nuxt UI v4 的 `bg-primary` 實際解析色階（本報告標註為「推測」）

---

### P0-2｜焦點環 `outline-brand-500` 對比度 2.43:1，低於非文字 3:1 門檻

- **現象**：全域 `:focus-visible` 用 `outline-2 outline-offset-2 outline-brand-500`。
- **證據**：`main.css`:126–128
- **基準**：UX 規範「Focus Appearance」要求 focus indicator 至少 **2 CSS px 周長 + 3:1 狀態對比**；「Focus States」為 Severity: High。
- **影響**：鍵盤使用者在白底上看不清焦點位置；且在 `brand-500` 填充的按鈕上，焦點環與按鈕同色，幾乎完全不可見。
- **改法**：
  ```css
  /* main.css:126-128 */
  :focus-visible {
    outline: 2px solid var(--color-brand-700);  /* 白底 5.36:1 ✅ */
    outline-offset: 2px;
  }
  ```
  暗色模式下另加 `.dark :focus-visible { outline-color: var(--color-brand-400); }`（`stone-950` 上 **10.93:1** ✅）。
- **補充**：若焦點環需落在實心按鈕上仍可見，建議加一層白色描邊（`outline` + `box-shadow: 0 0 0 2px #fff`），或改用 `outline-offset: -2px` 的內縮環。

---

### P0-3｜AI 語義色 `ai-500 #8b5cf6` 對白底 4.24:1，未達 4.5:1

- **現象**：若 AI 相關文字/圖標使用 `ai-500`，正常文字對比度不足。
- **證據**：`main.css`:71；`app.config.ts`:39 註冊為 `ai` 別名
- **基準**：AA 正常文字需 ≥4.5:1（4.24:1 僅達大字/非文字的 3:1）
- **改法**：AI 文字/圖標改用 `ai-600 #7c3aed`（**5.70:1** ✅）或 `ai-700 #6d28d9`（**7.10:1** ✅）；`ai-500` 僅用於裝飾漸變與邊框。

---

### P1-4｜`ai` 色階只有 6 階，與 brand 的 11 階不對稱

- **現象**：`ai` 缺 200/300/800/900/950。
- **證據**：`main.css`:68–73
- **影響**：`ai` 已註冊為 Nuxt UI 顏色別名（`app.config.ts`:39），Nuxt UI 會展開 11 階引用（`--ui-color-ai-950: var(--color-ai-950, )`），缺檔將取空兜底值 —— **與 brand 曾發生的問題同源**（`main.css`:30–39 明確記錄了這個踩坑）。
- **改法**：補齊 5 階，見 `02` §2.1。

---

### P1-5｜Elevation 無令牌、無語義層級

- **現象**：4 種陰影裸值（`shadow-sm` / `shadow-md` / `shadow-xl` / `.glass-card` 自訂雙層），無層級體系。
- **證據**：`main.css`:396–399 / :458 / :466；`app.vue`:130；`AppHeader.vue`:91；`AppSidebar.vue`:43；`AiAssistant.vue`:149
- **影響**：無法系統性調整「卡片 vs 抽屜 vs 懸浮鈕」的層次關係；新增組件時容易選錯層級。
- **改法**：見 `02` §4.1（5 層 elevation + 玻璃專用層）。

---

### P2-6｜裝飾色字面量散落

- **現象**：`rgb(255 255 255 / .14)`、`rgb(15 23 42 / .18)`、`rgb(255 255 255 / .12)`、`bg-black/40` 等硬編碼。
- **證據**：`main.css`:397 / :398 / :557；`app.vue`:129
- **改法**：見 `02` §2.4，令牌化後順帶支援暗色覆蓋。

---

## 二、無障礙

### P0-7｜⌘K 命令面板只綁定 `meta_k`，Windows / Linux 使用者無法觸發

- **現象**：`defineShortcuts` 只註冊了 `meta_k`。
- **證據**：`app.vue`:52–54（`app.vue`:51 註解寫「⌘K / Ctrl+K」，但程式碼只有 `meta_k`）；UI 上 `UKbd` 顯示的是 `⌘K`（`AppHeader.vue`:105 附近）
- **影響**：非 macOS 使用者看到 `⌘K` 提示但按了沒反應 —— 是明確的功能缺陷，不只是風格問題。
- **改法**：
  ```ts
  defineShortcuts({
    meta_k: toggle,
    ctrl_k: toggle,
  })
  ```
  並讓 `UKbd` 依平台顯示 `⌘K` 或 `Ctrl+K`（`@vueuse/core` 已安裝，可用 `useDevicePixelRatio` 同族的 `navigator.platform` 判斷，或直接用 `useNuxtApp().$i18n` 之外的簡單 UA 判斷）。

---

### P0-8｜正文 13.5px 低於行動端 16px 可讀性底線，且無行高配對

- **現象**：`--text-body: 0.84375rem`（13.5px），且 9 檔字號沒有任何 line-height / letter-spacing 令牌配對。
- **證據**：`main.css`:87；配對缺失見 `main.css`:83–91 全域無 `--leading-*`
- **基準**：UX 規範「Readable Font Size」：Minimum 16px body text on mobile（Severity: High）；「Line Height」：1.5–1.75 for body text
- **影響**：行動端閱讀吃力；長文（帖子詳情頁）尤為明顯。
- **改法**：見 `02` §3.2 / §3.3 —— 正文提到 16px 並配 `line-height: 1.5`（24px）。
- **注意**：這是**高風險變更**，正文放大會讓所有版面變高約 18%，建議先單頁試點。

---

### P0-9｜`text-dimmed` 用於實際內容文字時可能不達 4.5:1

- **現象**：`text-dimmed` 出現在頁腳分隔符（`AppFooter.vue`:30）等處。
- **證據**：`AppFooter.vue`:30
- **推測**：`text-dimmed` 若綁定 `stone-400 #a8a29e`，對白底僅 **2.52:1** ❌（`node_modules` 未安裝，未能實測 Nuxt UI 綁定值）
- **影響**：若 `text-dimmed` 被用在任何需要閱讀的文字上（而非純裝飾分隔符），將不達 AA。
- **改法**：實測後，把所有「需要閱讀」的 `text-dimmed` 改為 `text-muted`（若為 stone-500，**4.80:1** ✅）或 `text-toned`（stone-600，**7.63:1** ✅）。純裝飾元素可保留 dimmed。

---

### P1-10｜AI 懸浮鈕 z-40 低於頁頭 z-50，且無統一層級體系

- **現象**：`AiAssistant` 用 `z-40`，頁頭與行動抽屜用 `z-50`，共 2 個裸值。
- **證據**：`AiAssistant.vue`:149（`z-40`）、`AppHeader.vue`:63（`z-50`）、`app.vue`:128（`z-50`）
- **影響**：目前位置不重疊所以沒出問題，但沒有層級體系意味著新增任何浮層都可能踩坑。UX 規範「Z-Index Management」明確要求「Define z-index scale system」（Severity: High）。
- **改法**：見 `02` §4.2 的 8 級層級。

---

### P1-11｜側欄底部「學習進度 42%」為靜態假資料

- **現象**：進度文字與進度條寬度都是寫死的 42%。
- **證據**：`AppSidebar.vue`:84（文字）、`AppSidebar.vue`:87（`w-[42%]`）
- **影響**：
  1. 對使用者的直接誤導（顯示不真實的進度）
  2. 若進度條承載狀態資訊，還需注意「不能只靠顏色/寬度傳達，需有文字替代」
- **改法**：接入真實資料源（`/roadmap` 頁已有 `ProgressHeader`，可複用其計算邏輯）；在資料就緒前，建議先移除該卡片或明確標註為示意。

---

### P2-12｜`useTilt` / `useReveal` 手工 `matchMedia`，未用 motion-v 的 `useReducedMotion`

- **現象**：兩處各自寫 `window.matchMedia?.('(prefers-reduced-motion: reduce)').matches`。
- **證據**：`useTilt.ts`:77、`useReveal.ts`:58
- **影響**：目前功能正確（CSS 層也有覆蓋），但邏輯重複、且未訂閱變化事件（使用者在執行期間切換系統設定不會即時生效）。
- **改法**：改用 `@vueuse/core` 的 `usePreferredReducedMotion`（響應式、自動訂閱），或 motion-v 的 `useReducedMotion`。

---

## 三、響應式

### P0-13｜`AppSidebar` 折疊態下導航只剩圖標，未確認有無 accessible name

- **現象**：側欄折疊為 `w-20` 時，導航文字隱藏（`AppSidebar.vue`:57/66/69），只剩圖標；底部卡片文字亦隱藏。
- **證據**：`app.vue`:115（`w-20`）、`AppSidebar.vue`:57/66/69
- **影響**：若圖標沒有 `aria-label` / `title`，折疊態下螢幕閱讀器使用者與新使用者都無法知道每個圖標是什麼。（**推測**：Nuxt UI 的 `UButton` + `icon` prop 通常不會自動產生 accessible name，需實測）
- **改法**：為折疊態的圖標按鈕明確加上 `aria-label={link.label}` 或 `UTooltip`；`aria-label` 應在展開/折疊兩種狀態下都保持一致。

---

### P1-14｜內容區無最大寬度約束

- **現象**：`app.vue`:144 的 `main` 沒有 `max-w-*`，各頁面自行決定。
- **證據**：`app.vue`:144
- **影響**：在超寬螢幕（≥1920px）上，各頁面的內容寬度可能不一致，破壞跨頁面的視覺節奏；長文行寬也可能過長影響可讀性。
- **改法**：見 `02` §4.6 —— 殼層統一 `max-w-[var(--layout-content-max)]`（建議 1200px），特殊頁面再覆寫。

---

### P2-15｜頁腳分隔符為字面量 `|`

- **現象**：用 `|` 字符當分隔符（`text-dimmed`）。
- **證據**：`AppFooter.vue`:30
- **影響**：螢幕閱讀器會朗讀「豎線」；且不同字體下豎線的視覺粗細不一致。
- **改法**：改用 `border-l` + padding，或 `<span aria-hidden="true">|</span>`。

---

## 四、一致性

### P0-16｜AI 助手完全沒有使用 `ai` 紫羅蘭色板，與設計意圖不符

- **現象**：`AiAssistant.vue` 內 `ai-*` 零命中，AI 圖標與發送鈕都用 `text-primary` / `color="primary"`（brand 青藍）。
- **證據**：`main.css`:60–66 註解明確寫「改用低飽和紫羅蘭 #8b5cf6……AI 助手按鈕用上很自然」；`AiAssistant.vue`:149/175/268 實測皆為 primary
- **影響**：設計意圖與實作脫節 —— 使用者無法從顏色區分「這是 AI 功能」；且 `ai` 色板只有頁面級元件在用，語義系統斷裂。
- **改法**：`AiAssistant.vue` 的圖標與發送鈕改用 `ai` 色板（文字用 `ai-600` 以滿足對比度，見 P0-3）。若決定「AI 就用主色」，則應反向修正 `main.css`:60–66 的註解，避免文件與實作持續矛盾。**兩個方向都可以，但不能維持現狀。**

---

### P1-17｜兩枚圓角令牌為死令牌

- **現象**：`--radius-card: 1rem` / `--radius-pill: 9999px` 全倉零使用；實際用 `rounded-xl` / `rounded-2xl` / `rounded-full` / `rounded-lg`。
- **證據**：`main.css`:76–77（僅命中聲明行）；殼層實際值 4 種
- **影響**：令牌形同虛設，未來想「統一調圓角」時改了不會生效，是最容易被忽視的一類缺陷。
- **改法**：見 `02` §4.4 —— 調整令牌值對齊實際使用（card=12px / panel=16px / sm=8px / pill），然後全站替換。

---

### P1-18｜兩套字號系統並行，且有完全同值的重複

- **現象**：9 檔語義字號令牌 vs 5 種硬編碼 Tailwind 字號，其中 `text-[11px]` ≡ `--text-eyebrow`(11px)、`text-xs` ≡ `--text-caption`(12px)。
- **證據**：`main.css`:83–91 vs `AppSidebar.vue`:53/70/71/78/82/91、`main.css`:175/179
- **改法**：見 `02` §3.3 映射表，全站改用統一的 7 檔。

---

### P1-19｜同一圖標兩種引入方式，尺寸硬編碼

- **現象**：`Sparkles` 在 `AppSidebar.vue`:44 用 `i-lucide-sparkles`，在 `AppHeader.vue`:10→92 與 `AiAssistant.vue`:14→153/175 用組件導入；尺寸為 18/20/14 硬編碼。
- **證據**：見上述行號；`AppFooter.vue`:9→27 的 `BookOpen :size="14"`
- **影響**：圖標尺寸無法統一調整；兩種引入方式的 tree-shaking 行為與渲染結果可能有細微差異。
- **改法**：統一走 `i-lucide-*` 字符串 + `--icon-*` 尺寸令牌（見 `02` §4.7）。

---

### P1-20｜字體族未令牌化

- **現象**：`font-family` 寫在 `@layer base { html {} }`（`main.css`:117–118），而非 `@theme` 的 `--font-*`。
- **影響**：`font-sans` 工具類不指向 Inter，只靠 html 繼承；換字體需改 base 層而非令牌層。
- **改法**：見 `02` §3.4。

---

### P2-21｜無間距語義層

- **現象**：全部使用 Tailwind 默認刻度，無 `--space-*` 語義別名。
- **影響**：無法一鍵調整全站密度（例如把「寬鬆模式」改成「緊湊模式」）。
- **改法**：見 `02` §4.5。

---

### P2-22｜無 duration 令牌，約 11 種時長散落

- **證據**：`main.css`:251–563 各動效、`app.vue`:114/123–126
- **改法**：見 `02` §4.3。

---

### P2-23｜`@source` 硬編碼 5 層相對路徑

- **現象**：`@source '../../../../../packages/shared/src'`
- **證據**：`main.css`:24
- **影響**：目錄結構一旦調整就會靜默失效（註解 L15–23 已說明失效時不報錯，只是顏色消失）。
- **改法**：保持現狀但加一條 CI 檢查（例如 build 後 grep 產物中是否含 `from-brand-400` 對應的 CSS 規則）；或改為絕對路徑別名。

---

## 五、品牌 / 資料

### P0-24｜風格衝突 C1：企業級克制骨幹 ⟷ 消費級裝飾動效，未做空間隔離

- **現象**：Aurora 光暈（20–34s 無限漂移）、呼吸光環（5.5s 無限）、漸變流動（9s 無限）等持續動效，與殼層的企業級克制風格並存。
- **證據**：`main.css`:307–317 / :320–330 / :337–344 / :373–383 / :482；裝飾層 `main.css`:346–484
- **判定**：**A 面（企業級克制）為主風格**（理由見 `01` §八）
- **影響**：`ring-breathe` 與 `aurora-drift` 是永不停止的無限動效，與 Notion/Linear「介面靜止時絕對安靜」的紀律相悖；長時間閱讀場景下產生注意力殘留。
- **改法**：見 `02` §5 —— 空間隔離（裝飾只進首頁）、時間隔離（同頁 infinite ≤ 2 組）、語義隔離（裝飾不承載資訊）、可關閉（已有，保持）。
- **具體建議**：`ring-breathe` 改為「有新內容時才呼吸」或週期拉長到 8s；`gradient-pan` 改為 hover 才流動。

---

### P1-25｜頁腳只有 1 個連結，無品牌/法律層級

- **現象**：`UFooter` 只有 `#left`（版權）+ `#right`（配套電子書 + 技術棧文案），全站僅 1 個頁腳連結。
- **證據**：`AppFooter.vue`:15–31
- **影響**：
  - 若這是「個人技術品牌」，頁腳單薄可接受
  - 若定位為「產品」，缺少 關於/隱私/條款/聯絡 會削弱信任
- **改法**：先明確定位（見 `01` §一的「品牌氣質」判定為「個人開發者技術品牌」），再決定是否補連結。若維持個人站定位，**建議至少補一個聯絡/回饋入口**。

---

### P1-26｜品牌識別只有「青藍 + Sparkles 圖標」，無 logo 資產

- **現象**：品牌識別由 `h-9 w-9 rounded-xl bg-primary text-white` 的方塊 + Sparkles 圖標構成（`AppHeader.vue`:91、`AppSidebar.vue`:43），無文字 logo、無 SVG 資產。
- **證據**：`AppHeader.vue`:91、`AppSidebar.vue`:43
- **影響**：品牌資產不可攜（頭像、OG 圖、favicon 都無法複用）；競爭同質化（Sparkles 是 AI 類產品的通用符號）。
- **改法**：建議至少定義一枚 SVG logo 與一組 favicon/OG 圖，並寫入 `docs/brand-guidelines.md`。

---

### P2-27｜`ui-ux-pro-max` 建議用 Phosphor，本專案用 lucide

- **現象**：技能默認推薦 Phosphor，專案實為 lucide。
- **判定**：**不需處理**。風格庫的 Pre-Delivery Checklist 明確接受 Lucide（「use SVG: Heroicons/Lucide」），且全站圖標來源單一、零 emoji、線性風格統一，已達標準。此條僅作記錄，避免未來誤以為需要遷移。

---

## 六、不做的事（明確排除）

避免過度優化，以下項目**建議維持現狀**：

| 項目 | 為什麼不改 |
|---|---|
| 換掉 Inter | 選型正確，與技術型產品定位高度吻合（風格庫 mood 完全一致） |
| 遷移圖標庫到 Phosphor | lucide 已被規範接受，且全站風格統一 |
| 重寫 `prefers-reduced-motion` 處理 | 已是 CSS + JS + 觸屏三層覆蓋，品質高於多數商業產品 |
| 手寫 `dark:` 變體 | 殼層零手寫是正確架構，應保持依賴語義令牌 |
| 把 `AuroraBackground` 完全刪除 | 它是品牌記憶點，問題在「擴散到內頁」而非「存在」 |
| 強行模數化到黃金比/純律 | 4px 對齊的字階比「數學上完美」更適合工程實作 |

---

## 七、修復優先序列（建議排期）

```
Sprint 1（1–2 天，低風險高收益）
  ├ P0-7  ⌘K 補綁 ctrl_k                          ← 唯一的功能缺陷，最該先修
  ├ P0-1  實底主色改 brand-700                     ← 需先實測 bg-primary
  ├ P0-2  焦點環改 brand-700 + 暗色分支
  ├ P0-3  AI 文字改 ai-600
  └ P1-4  補齊 ai 色階 5 檔

Sprint 2（2–3 天，令牌化基礎建設）
  ├ P1-5  Elevation 令牌
  ├ P1-10 Z-index 層級
  ├ P1-17 圓角令牌復活
  └ P1-20 字體族令牌化

Sprint 3（3–5 天，高風險需試點）
  ├ P0-8  正文 13.5 → 16px（先在 /posts 試點）
  ├ P1-18 字號系統統一
  └ P0-13 側欄折疊態 accessible name

Sprint 4（品牌與體驗）
  ├ P0-16 AI 助手色彩語義（需先做方向決策）
  ├ P0-24 裝飾層收斂
  ├ P1-11 側欄假進度資料
  └ P1-25/26 品牌資產

Backlog
  ├ P0-9  text-dimmed 實測後調整
  ├ P1-14 內容區最大寬度
  └ P2-*  其餘優化
```

---

## 八、驗證清單（修復後自查）

修復完成後，建議逐項確認：

**對比度**
- [ ] 主按鈕白字對實底色 ≥ 4.5:1（目標 5.36:1）
- [ ] 所有 `text-primary` 文字對 `bg-default` ≥ 4.5:1
- [ ] 焦點環對相鄰色 ≥ 3:1，且在實心按鈕上可見
- [ ] AI 文字/圖標對 `bg-default` ≥ 4.5:1
- [ ] 暗色模式下重跑上述全部（不要假設亮色值適用）

**鍵盤與無障礙**
- [ ] Tab 遍歷全站，每個可聚焦元素都有清晰焦點環
- [ ] ⌘K 與 Ctrl+K 都能開啟命令面板
- [ ] 側欄折疊態每個圖標都有 accessible name
- [ ] `prefers-reduced-motion: reduce` 下全站無持續動效
- [ ] 螢幕閱讀器朗讀順序與視覺順序一致

**一致性**
- [ ] 全站無 `rounded-xl` / `rounded-2xl` 裸值（已改令牌）
- [ ] 全站無 `shadow-sm/md/xl` 裸值
- [ ] 全站無 `z-40` / `z-50` 裸值
- [ ] 全站無 `text-[Npx]` 硬編碼
- [ ] grep 令牌使用率，無新的死令牌

**響應式**
- [ ] 375 / 768 / 1024 / 1440 / 1920px 五個斷點視覺一致
- [ ] 1920px 下內容寬度一致且有約束
- [ ] 行動端抽屜開啟時 AI 懸浮鈕被遮罩覆蓋

**回歸**
- [ ] 首頁 2×2 分區在正文放大後無溢出
- [ ] 帖子列表與詳情頁行寬可讀
- [ ] 路線頁與 trending 頁版面正常
