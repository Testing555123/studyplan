# studyplan 全站設計系統視覺審計報告

> 審計對象：`apps/web` 全站設計系統（設計令牌 + Nuxt UI 外觀映射 + 殼層組件）
> 技術棧：Nuxt 4.5 / Vue 3.5 / Nuxt UI v4.11 / Tailwind CSS 4.3（CSS-first）/ lucide 圖標 / motion-v
> 完成度對標基準：**Notion / Linear**（克制、高效、高密度質感）
> 證據格式：`檔案:行號`。所有結論均可回溯到原始碼。無法確定的部分標註「推測」。

---

## 一、整體美術風格判斷

### 主風格

**Corporate Clean（企業級潔淨）為骨幹 + Glassmorphism（玻璃擬態）為表層裝飾 + 技術型青藍品牌色為識別錨點。**

這是一個「底色是企業級工具、表皮是消費級光效」的混合體。骨幹部分（側欄、按鈕、卡片、表格、命令面板）完全遵循 Nuxt UI 的企業級語義令牌，殼層 5 個 Vue 檔案中 `dark:` 手寫變體數量為 **0**（`AppHeader.vue` / `AppSidebar.vue` / `AppFooter.vue` / `AiAssistant.vue` / `app.vue` 全數依賴 `bg-default` / `text-muted` / `border-default`），說明底層是標準的設計系統驅動，不是手搓樣式。表皮部分（`AuroraBackground`、`glass-card`、`gradient-frame`、`ring-breathe`、`tilt-spot`）則是裝飾層，定義於 `main.css` 的 `@layer components`（如 `.glass-card` L726、`.aurora-blob` L690、`.ring-breathe` L584、`.gradient-frame` L827、`.tilt-spot` L912），降級規則位於 L937–966。

### 風格關鍵詞

| 層級 | 關鍵詞 | 證據 |
|---|---|---|
| 骨幹 | 語義化、中性、克制、高密度、工具感、網格化 | 殼層 0 處手寫 `dark:`；全靠 `bg-default`/`text-muted`/`border-default` |
| 識別 | 科技青藍、冷暖對比、單一強調色 | `--color-brand-500: #06b6d4`（`main.css`:53）；`primary: 'brand'`（`app.config.ts`:23） |
| 裝飾 | 玻璃、光暈、漸變流動、懸浮、呼吸、傾斜高光 | `glass-card`（L726）、`aurora-drift`（L631）、`gradient-pan`（L669）、`ring-breathe`（L584）、`tilt-spot`（L912） |
| 中性 | 暖灰、低飽和、護眼 | `neutral: 'stone'`（`app.config.ts`:31），註解明確寫「原先用 slate（冷灰），改為 stone 後帶暖調」 |

### 視覺情緒

**「理性、輕盈、略帶未來感的技術友善」**。

- **理性**來自：暖灰中性 + 語義令牌 + 無 emoji 圖標 + 統一的 8px 網格間距（Tailwind 默認刻度）。
- **輕盈**來自：玻璃頁頭 `bg-default/75 backdrop-blur-xl`（`AppHeader.vue`:63）、大圓角（`rounded-xl`/`rounded-2xl`）、低對比邊框。
- **未來感**來自：青藍 × 紫羅蘭的冷暖對撞（`main.css` L60–66 註解自述「靛藍→紫是當下 AI 類產品主流視覺語言」）+ Aurora 光暈 + 呼吸光環。

與 Notion 的「去情緒化、純工具」相比，本專案多了一層情緒（裝飾動效）；與 Linear 的「暗色精密感」相比，本專案是亮色、更軟、更輕。

### 品牌氣質

**「個人開發者的技術品牌 / 獨立開發者作品集」，而非企業產品。**

推論依據：
1. 導航只有 4 項（首頁 / 帖子流 / 全棧學習路線 / GitHub 熱門，`AppSidebar.vue`:26–31）——是內容站結構，不是產品功能結構。
2. 頁腳只有 1 個連結「配套電子書」（`AppFooter.vue`:22–29），無多欄連結矩陣、無隱私條款/關於我們層級——典型個人站，非企業站。
3. 側欄底部「學習進度 42%」是**靜態假資料**（`AppSidebar.vue`:84 文字 + L87 寬度 `w-[42%]`），說明這部分尚未接真實資料源。
4. 全站有 GitHub Star 號召區（`home/GithubCtaSection.vue`）與「配套電子書」導流——內容變現導向。

**推測**：品牌人格偏「技術博主 / 教程作者」，而非「SaaS 供應商」。這與「學習路線 + 帖子 + GitHub 熱門」的內容三角一致。

### 目標受眾感受

| 受眾 | 感受預測 | 依據 |
|---|---|---|
| 前端初學者 / 轉職者 | 親和、不嚇人、有「跟著學」的引導感 | 學習路線作為一級導航（`AppSidebar.vue`:29 `i-lucide-route`） |
| 在職前端工程師 | 熟悉、順手、資訊密度可接受；但裝飾動效可能被認為「不夠幹練」 | ⌘K 命令面板（`app.vue`:155–165）、trending 榜單——工程師習慣的入口 |
| 招聘方 / 潛在客戶 | 完成度不錯，但側欄 42% 假資料與只有 1 個頁腳連結會削弱專業信任 | `AppSidebar.vue`:84–87、`AppFooter.vue`:22–31 |

### 相似設計趨勢

明確指認（依 `ui-ux-pro-max` 風格庫對照）：

1. **Corporate Clean / Minimalism & Swiss Style**（主風格，骨幹）
   - 風格庫定義：Clean, simple, spacious, functional, white space, high contrast, geometric, grid-based
   - 本專案符合度：**高**（網格化、語義令牌、無多餘裝飾的殼層）
2. **Glassmorphism**（次要風格，表層）
   - 風格庫定義：Frosted glass, backdrop blur 10–20px, translucent white 10–30%, 1px 亮邊, multi-layer depth
   - 本專案符合度：**中**。命中 `backdrop-blur-xl`（頁頭）、半透明 `bg-default/75`、`glass-card` 的 `inset 0 1px 0 rgba(255,255,255,.14)` 高光邊（`main.css`:397）；但**未命中**「vibrant background」——本專案背景是中性灰白，不是彩色，因此玻璃效果缺乏襯底，視覺上接近「毛玻璃」而非完整 Glassmorphism。
   - 風格庫對 Glassmorphism 的無障礙標註為 `risk:conditional | requires: contrast-text-4.5` —— 與本報告後續發現的對比度問題直接相關。
3. **Apple Style（推測，弱）** —— 大圓角、玻璃、柔和陰影、SF 風字重的組合接近 Apple HIG 的語言，但未使用 SF Pro 字體（用的是 Inter），因此判定為「氣質相近、非刻意模仿」。
4. **AI-Native UI（局部）** —— 紫羅蘭語義色 + Sparkles 圖標 + 懸浮 AI 助手（`AiAssistant.vue`），是當下 AI 產品的通用語彙。

**未命中**：Neumorphism（無內凹擬態）、Brutalism（無粗黑邊/raw 感）、Y2K（無）、Cyberpunk（無霓虹/扫描线）、Material Design（無 ripple/海拔色階）、Bento Grid（首頁 2×2 分區接近但不具 Bento 的不規則與密集感）。

### 設計完成度評價（對標 Notion / Linear）

| 維度 | 本專案 | Notion | Linear | 判定 |
|---|---|---|---|---|
| **令牌化程度** | 7/10。顏色與字號已令牌化；`shadow / spacing / z-index / duration / border / opacity` **六類全部無令牌** | 9/10 | 9/10 | 落後 |
| **色彩紀律** | 8/10。色值單一來源（`@theme`），`app.config.ts` 只做別名映射，架構正確 | 9/10 | 9/10 | 接近 |
| **排版系統** | 5/10。有 9 檔字號令牌，但**非模數化**（11/12/12.5/13/13.5/15/17/22/26px，含兩個分數像素），且**無 line-height / letter-spacing / font-weight 配對** | 8/10（15–16px 正文，1.5 行高） | 9/10（13–14px + 精確字重行高補償） | **明顯落後** |
| **Elevation 體系** | 3/10。只有 Tailwind 默認 `sm/md/xl` 三檔裸用 + 1 處自訂雙層陰影，**無語義層級** | 7/10 | 8/10 | **明顯落後** |
| **裝飾克制度** | 5/10。Aurora 光暈 + 呼吸光環 + 傾斜高光 + 漸變流動共 5 組裝飾動效 | 9/10（幾乎無裝飾） | 8/10 | **落後**（但見「風格衝突」章） |
| **資訊密度** | 6/10。正文 13.5px 偏小但行高未配套；側欄底部卡片為假資料 | 9/10 | 9/10 | 落後 |
| **鍵盤/無障礙** | 6/10。有全域 `:focus-visible`（`main.css`:126–128）、有 `prefers-reduced-motion` 雙層處理（L131–140 + L578–607）、有 `@media (hover:none)` 禁用 tilt（L613–621）；但焦點環用色對比度不足、⌘K 未綁 Ctrl+K | 8/10 | 9/10 | 落後 |
| **一致性** | 6/10。兩枚死令牌、AI 助手不用 ai 色板、同一圖標兩種引入方式、5 種硬編碼字號 | 9/10 | 9/10 | 落後 |

**綜合：6.0 / 10**。

一句話總結：**「架構是對的，細節是半成品」**。令牌單一來源、`@theme static` 的完整色階輸出、殼層零手寫 `dark:`、reduced-motion 的雙層覆蓋——這四件事說明作者具備明確的設計系統意識，且做過真實的踩坑修復（`main.css` L30–39、L15–23 的註解都是踩坑記錄）。落後的地方集中在三類：(a) 只令牌化了「顏色 + 字號」，其餘維度裸奔；(b) 字階不是模數系統；(c) 裝飾動效的密度與 Notion/Linear 的克制哲學相悖。

Notion / Linear 級別的差距不在「多寫幾個令牌」，而在**是否建立了完整的維度覆蓋與嚴格的克制紀律**——這兩點正是 02 號文件要補的。

---

## 二、色彩系統

### 2.1 主色 brand（科技青藍，Tailwind cyan 標準色階）

| 令牌 | HEX | RGB | HSL | 對白底對比度 | 視覺作用 |
|---|---|---|---|---|---|
| `brand-50` | `#ecfeff` | 236,254,255 | 183,100%,96% | 1.04:1 | 極淺青底，hover 底色 / 淺色標籤底 |
| `brand-100` | `#cffafe` | 207,250,254 | 185,96%,90% | 1.12:1 | 淺色選中態底 |
| `brand-200` | `#a5f3fc` | 165,243,252 | 186,93%,82% | 1.25:1 | 分隔/淺邊框（低對比，僅裝飾） |
| `brand-300` | `#67e8f9` | 103,232,249 | 187,92%,69% | 1.45:1 | 裝飾漸變起點 |
| `brand-400` | `#22d3ee` | 34,211,238 | 188,86%,53% | 1.81:1 | 裝飾邊框（`main.css`:211 `border-primary-400`）、頭像漸變起點 |
| `brand-500` | `#06b6d4` | 6,182,212 | 189,94%,43% | **2.43:1** ⚠️ | **全站強調色**：實底按鈕、連結、選中態、焦點環（`main.css`:127） |
| `brand-600` | `#0891b2` | 8,145,178 | 192,91%,36% | 3.68:1 | hover 加深態、頭像漸變終點 |
| `brand-700` | `#0e7490` | 14,116,144 | 193,82%,31% | 5.36:1 ✅ | 唯一滿足 AA 正常文字的青藍（**目前未被用作文字色**） |
| `brand-800` | `#155e75` | 21,94,117 | 194,70%,27% | 7.27:1 ✅ | 深態文字（未使用） |
| `brand-900` | `#164e63` | 22,78,99 | 196,64%,24% | — | 暗色模式文字候選（未使用） |
| `brand-950` | `#083344` | 8,51,68 | 197,79%,15% | — | 暗色模式極深底（未使用） |

**關鍵事實**：brand 色階是**完整 11 階**，靠 `@theme static`（`main.css`:41）強制輸出。註解 L30–39 記錄了原因：普通 `@theme` 只輸出被引用的色階，實測 brand 只輸出 8 階（缺 100/900/950），導致 Nuxt UI 的 `--ui-color-primary-950` 取到空兜底值。這是一次真實踩坑的正確修復。

### 2.2 語義色 ai（AI 紫羅蘭）

| 令牌 | HEX | RGB | HSL | 對白底對比度 | 視覺作用 |
|---|---|---|---|---|---|
| `ai-50` | `#f5f3ff` | 245,243,255 | 250,100%,98% | — | AI 面板極淺底 |
| `ai-100` | `#ede9fe` | 237,233,254 | 251,91%,95% | — | AI 標籤底 |
| `ai-400` | `#a78bfa` | 167,139,250 | 255,92%,76% | — | AI 裝飾漸變（**已缺 200/300**） |
| `ai-500` | `#8b5cf6` | 139,92,246 | 258,89%,66% | **4.24:1** ⚠️ | AI 主色（頁頭漸變線終點 `main.css`:426） |
| `ai-600` | `#7c3aed` | 124,58,237 | 262,83%,58% | 5.70:1 ✅ | AI 加深態 |
| `ai-700` | `#6d28d9` | 109,40,217 | 263,70%,50% | 7.10:1 ✅ | AI 深態文字 |

**色階缺口**：ai 只有 6 檔（50/100/400/500/600/700），**缺 200/300/800/900/950**。與 brand 的 11 階不對稱。由於 `ai` 已在 `app.config.ts`:39 註冊為 Nuxt UI 顏色別名，Nuxt UI 會展開 11 個色階引用（`--ui-color-ai-950: var(--color-ai-950, )`），缺檔將取空兜底值 —— **與 brand 曾發生的問題同源**。

### 2.3 中性色與語義角色

`neutral: 'stone'`（`app.config.ts`:31），暖灰。語義類由 Nuxt UI 提供，殼層使用的有：`bg-default`、`bg-muted`、`bg-inverted`、`text-toned`、`text-muted`、`text-dimmed`、`text-highlighted`、`text-inverted`、`border-default`、`border-emphasis`、`bg-primary`、`text-primary`。

**推測（未能本地實測，因 `node_modules` 未安裝）**：Nuxt UI v4 的語義映射大致為 `text-muted`→neutral-500、`text-dimmed`→neutral-400、`text-toned`→neutral-600。以 stone 計算的對白底對比度為：

| 推測綁定 | stone 值 | 對比度 | AA(4.5:1) 判定 |
|---|---|---|---|
| `text-dimmed`（若 = stone-400 `#a8a29e`） | 168,162,158 | **2.52:1** | ❌ 不達標 |
| `text-muted`（若 = stone-500 `#78716c`） | 120,113,108 | 4.80:1 | ✅ 勉強達標 |
| `text-toned`（若 = stone-600 `#57534e`） | 87,83,78 | 7.63:1 | ✅ 達標 |

`main.css`:122 `body { @apply bg-default text-toned; }` —— 正文用 toned 是正確選擇。

### 2.4 裝飾色（硬編碼字面量）

| 值 | 位置 | 作用 |
|---|---|---|
| `rgb(255 255 255 / 0.14)` | `main.css`:397 | `.glass-card` 頂部 1px 高光邊（模擬玻璃上緣反光） |
| `rgb(15 23 42 / 0.18)` | `main.css`:398 | `.glass-card` 外投影（slate-900 18%，`0 12px 40px -16px`） |
| `rgb(255 255 255 / 0.12)` | `main.css`:557 | `.tilt-spot` 指針跟隨高光 |
| `bg-black/40` | `app.vue`:129 | 行動端抽屜遮罩（**純黑硬編碼，未令牌化**） |
| `text-white` | `AppHeader.vue`:91、`AppSidebar.vue`:43 | 品牌方塊上的白字/白圖標 |
| `opacity-70` | `AppSidebar.vue`:71 | 次要文字透明度 |
| `bg-muted/60` | `AppSidebar.vue`:77 | 側欄底部卡片底 |

---

## 三、字體與排版

### 3.1 字體族

```
'Inter', 'Noto Sans SC', 'PingFang SC', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif
```
位置：`main.css`:117–118（`@layer base { html {} }`）；載入：`nuxt.config.ts`:184（Google Fonts，`Inter:wght@400;500;600;700` + `Noto+Sans+SC:wght@400;500;700`，`display=swap`），並以 `media="print"` + `onload` 異步化（L185–186），`preconnect` 到 fonts.googleapis.com / fonts.gstatic.com（L180–181）。

**識別判定**：
- **西文/數字：Inter**（真實字體，可確認）。Inter 是當下技術型產品的默認選擇，風格庫中「Modern Dark Cinema (Inter System)」一項明確描述其 mood 為 *technical, precision, clean, premium, developer, professional*，Best For 含 *Developer tools, high-end productivity apps* —— **與本專案定位高度吻合，選型正確**。
- **中文：Noto Sans SC**（真實字體）。fallback 到 PingFang SC（macOS 系統中文）→ system-ui。
- **等寬：未指定**，使用 Tailwind 默認 `font-mono`。

**⚠️ 架構問題**：字體族寫在 `@layer base` 而非 `@theme` 的 `--font-*` 令牌。Tailwind 4 的 `--font-sans` / `--font-mono` 機制未被使用，因此 `font-sans` 工具類不會指向 Inter，只能靠 html 繼承。目前能工作，但不具備令牌化的可替換性。

### 3.2 字階（9 檔，`main.css`:83–91）

| 令牌 | rem | px | 聲明用途 | 實際使用 |
|---|---|---|---|---|
| `--text-eyebrow` | 0.6875 | 11 | 頁眉副標 | ❌ 殼層未用（改用 `text-[11px]`，`AppSidebar.vue`:53，同值重複） |
| `--text-caption` | 0.75 | 12 | 頭像字/小字 | ⚠️ 部分（殼層用 `text-xs`，`AppSidebar.vue`:71/82/91，同值重複） |
| `--text-meta` | 0.78125 | 12.5 | 元信息 | — |
| `--text-body-sm` | 0.8125 | 13 | 次標題/用戶名 | — |
| `--text-body` | 0.84375 | 13.5 | 正文 | — |
| `--text-subtitle` | 0.9375 | 15 | 卡片標題(小) | — |
| `--text-title` | 1.0625 | 17 | 卡片標題(大) | ❌ 未使用 |
| `--text-heading` | 1.375 | 22 | 區塊大標題 | ❌ 未使用（`.prose-post` 用 `text-xl`） |
| `--text-display` | 1.625 | 26 | 文章頁主標題 | ❌ 未使用 |

**問題 1：非模數化。** 11 → 12 → 12.5 → 13 → 13.5 → 15 → 17 → 22 → 26，比值序列為 1.09 / 1.04 / 1.04 / 1.04 / 1.11 / 1.13 / 1.29 / 1.18 —— 前五檔擠在 1.04–1.11 之間，靠肉眼幾乎無法區分 12.5px 與 13px、13px 與 13.5px。Notion/Linear 這類產品的字階通常只有 5–7 檔且比值 ≥1.15。

**問題 2：分數像素。** `12.5px`（0.78125rem）與 `13.5px`（0.84375rem）在 1× DPI 下會觸發字體光柵化的亞像素取整，不同瀏覽器/縮放層級渲染結果可能不一致。

**問題 3：只有 font-size，沒有配對。** 9 檔字號沒有任何對應的 `line-height` / `letter-spacing` / `font-weight` 令牌。散落約定：`leading-8`（`main.css`:171）、`leading-6`（L203）、`tracking-tight`（`AppSidebar.vue`:47）、`tracking-[0.18em]`（L53，唯一硬編碼字距）、`font-medium`/`font-semibold`（Tailwind 默認檔）。

**問題 4：正文 13.5px 偏小。** UX 基準明確要求「Minimum 16px body text on mobile」（`ux` 域 *Readable Font Size*，Severity: High）、「Line Height 1.5–1.75 for body text」。13.5px 即便在桌面也偏小；Linear 之所以能用 13–14px，是因為配了精確的字重與行高補償，本專案沒有這套補償。

### 3.3 硬編碼字號：5 種

| 值 | 位置 |
|---|---|
| `text-sm` (14px) | `AppSidebar.vue`:70, :78 |
| `text-xs` (12px) | `AppSidebar.vue`:71, :82, :91 |
| `text-[11px]` | `AppSidebar.vue`:53 |
| `text-xl` (20px) | `main.css`:175（`.prose-post h2`） |
| `text-lg` (18px) | `main.css`:179（`.prose-post h3`） |

其中 `text-[11px]` 與 `--text-eyebrow` 完全同值、`text-xs` 與 `--text-caption` 完全同值 —— **令牌已存在卻被繞過**。

---

## 四、間距、圓角、陰影、邊框

### 4.1 間距

**無間距令牌。** 全部使用 Tailwind 默認刻度（`px-5`、`gap-2.5`、`space-y-1`、`mt-16`、`p-4/5/6`）。優點是天然符合 4px 網格；缺點是沒有語義層級（不知道 `p-5` 是「卡片內距」還是「區塊內距」），無法一鍵調整全站密度。

**內容區無最大寬度約束**：`app.vue`:144 的 `main` 沒有 `max-w-*`，交給各頁面自行處理。對標 Notion/Linear 的「可預測內容寬度」原則，這是一個一致性風險點。

### 4.2 圓角

| 類型 | 值 |
|---|---|
| 令牌 | `--radius-card: 1rem`（L76）、`--radius-pill: 9999px`（L77） |
| **實際使用** | `rounded-xl`(12px)、`rounded-2xl`(16px)、`rounded-full`、`rounded-lg`(8px)、`rounded-[inherit]` |

**⚠️ 兩枚死令牌**：全倉 grep 中 `rounded-card` / `rounded-pill` **零使用**，兩枚令牌僅命中聲明行本身（`main.css`:76–77）。聲稱的「大圓角」性格實際由 `rounded-xl`/`rounded-2xl` 承載，與令牌脫節。

### 4.3 陰影 / Elevation

**無 elevation 令牌，無語義層級。** 全部出現處：

| 位置 | 值 |
|---|---|
| `main.css`:396–399 | `.glass-card`：`inset 0 1px 0 rgb(255 255 255/.14), 0 12px 40px -16px rgb(15 23 42/.18)`（自訂雙層） |
| `main.css`:458 / :466 | `.card-surface` / `.card-surface-sm`：`shadow-sm` → `hover:shadow-md` |
| `app.vue`:130 | 行動抽屜 `shadow-xl` |
| `AppHeader.vue`:91 | 行動品牌方塊 `shadow-sm` |
| `AppSidebar.vue`:43 | 品牌方塊 `shadow-sm` |
| `AiAssistant.vue`:149 | 懸浮按鈕 `shadow-sm` |

共 4 種值（`sm` / `md` / `xl` / 自訂），全是裸用 Tailwind 默認檔。`.glass-panel`（`main.css`:445）刻意無陰影（註解 L440–442 說明）。

### 4.4 邊框

- **無 border-width 令牌**，統一 `border`（1px）/ `border-b` / `border-r` / `border-l-4`。
- 顏色全部走語義類：`border-default`、`border-emphasis`、`border-primary-400`。
- **`ring-*` 工具類零使用**；`divide` 零使用。
- 命名陷阱：`.ring-breathe`（`main.css`:261/320）是**動畫類名**，與 ring 邊框無關，容易被誤讀。

---

## 五、圖標與圖像

### 5.1 圖標：lucide，兩套引入方式並存

| 方式 | 範例 |
|---|---|
| Iconify 字符串（`UIcon` / `icon` prop） | `i-lucide-home`、`i-lucide-message-square-text`、`i-lucide-route`、`i-lucide-github`、`i-lucide-sparkles`、`i-lucide-book-open`、`i-lucide-panel-left-close`、`i-lucide-menu`、`i-lucide-search`、`i-lucide-pen-line`、`i-lucide-log-in/out`、`i-lucide-info`、`i-lucide-alert-circle`、`i-lucide-send`（`AppSidebar.vue`:27–30/44/79、`AppHeader.vue`:30/84/105/44/119/49/148、`AiAssistant.vue`:199/240/216/271、`app.vue`:67–69/89/98） |
| 直接組件導入 `lucide-vue-next` | `Sparkles :size="18"`（`AppHeader.vue`:10→92）、`BookOpen :size="14"`（`AppFooter.vue`:9→27）、`Sparkles :size="20"` / `:size="14"`（`AiAssistant.vue`:14→153/175） |

**一致性問題**：`Sparkles` 這一個圖標，`AppSidebar.vue`:44 用 `i-lucide-sparkles`，`AppHeader.vue` 與 `AiAssistant.vue` 卻用組件導入 —— 同一圖標兩條路徑。圖標尺寸也硬編碼為 18 / 20 / 14 三種，無 size 約定。

**正面**：全站**零 emoji 作為結構圖標**（符合 Pre-Delivery Checklist 首條），且圖標來源單一（lucide），風格統一為線性。

> 註：`ui-ux-pro-max` 默認推薦 Phosphor，本專案使用 lucide —— 這是既有選擇，風格庫的 Pre-Delivery Checklist 亦明確接受 Lucide，無需遷移。

### 5.2 圖像與頭像

**無真實頭像圖片**，兩處佔位：
- `AppHeader.vue`:131–135：首字母（`name.slice(0,2).toUpperCase()`，L33–35），`h-7 w-7 rounded-full bg-primary/10 text-caption text-primary`
- `AppSidebar.vue`:43：品牌方塊 `h-9 w-9 rounded-xl bg-primary text-white`（內含 Sparkles 圖標）

**漸變頭像**：`packages/shared/src/constants/avatar.ts`:28 定義 `'from-brand-400 to-brand-600'`，由同文件 L54 的 `avatarGradientClass(seed)` 導出。為使 Tailwind 掃描到共享包內的類名，`main.css`:24 加了 `@source '../../../../../packages/shared/src'`（註解 L15–23 說明：不加則類不生成、顏色靜默丟失，且不報錯）。這是一處**架構脆弱點**（硬編碼 5 層相對路徑）。殼層未使用該漸變（用於 `PostCard` / `CommentList` 等列表頭像）。

**裝飾性漸變**：`main.css`:422–427（頁頭線 brand-400 → ai-500）、L827–842（`.gradient-frame`）、L912（`.tilt-spot` 高光 `340px circle` radial-gradient）。

---

## 六、殼層組件拆解

### 6.1 佈局骨架（`app.vue`）

```
flex min-h-screen bg-default                        L111
├─ AppSidebar   w-64(256px) ↔ w-20(80px)            L114-115
│               transition-[width] duration-200
│               hidden … sm:flex sm:flex-col        （桌面常駐，行動隱藏）
├─ 行動抽屜     Teleport to="body"                   L121-135
│               fixed inset-0 z-50 sm:hidden
│               遮罩 bg-black/40 backdrop-blur-sm   L129
│               抽屜 absolute inset-y-0 left-0 w-64 shadow-xl
│               進 200ms ease-out / 出 150ms ease-in
└─ flex min-w-0 flex-1 flex-col                     L137
   ├─ AppHeader                                     L139
   ├─ main.flex-1                                   L144  （⚠️ 無 max-w-*）
   ├─ AppFooter                                     L147
   └─ AiAssistant                                   L151
⌘K: UModal + UCommandPalette, sm:max-w-2xl(672px)   L155-165
```

### 6.2 AppHeader

- 外殼 `UHeader :toggle="false"`（L61–62，禁用內建行動菜單，改自繪）
- `sticky top-0 z-50 h-16`（64px）、`bg-default/75 backdrop-blur-xl`、`border-b border-default`（L63）
- 滾動反饋：`.header-gradient-line` + `is-scrolled` 類（`useScrolled()`，L63–64/18）
- 桌面左：側欄折疊鈕（`i-lucide-panel-left-close` / `i-lucide-panel-left`）
- 行動左：`i-lucide-menu` + 品牌方塊 `h-9 w-9 rounded-xl bg-primary text-white shadow-sm`
- 右區：搜尋（`UTooltip` + `UKbd ⌘K`）、`UColorModeButton`、「寫文章」主按鈕、頭像下拉 / 登錄（L101–151）
- **主導航：無**（已遷至側欄）

### 6.3 AppSidebar

- 寬度由 `app.vue` 控制；品牌區 `h-16` + `border-b` + `px-5`，方塊 `h-9 w-9 rounded-xl bg-primary text-white shadow-sm`（L42–43）
- 導航 4 項（L26–31），選中態 `:variant="isActive ? 'solid' : 'ghost'"`（L63）
- 折疊態：`flex flex-col items-center` + `justify-center`，文字隱藏（L57/66/69）
- 底部學習進度卡：`rounded-2xl border border-default bg-muted/60 p-4`，進度條 `h-1.5` + `w-[42%]`（L77–96）—— **42% 為靜態假資料**

### 6.4 AppFooter

- `UFooter class="mt-16"`（L15），**1 行 2 槽**（`#left` / `#right`），無多欄連結矩陣
- 左：版權 `text-caption text-muted`（L17）
- 右：「配套電子書」連結 + `BookOpen :size="14"` → `hover:text-primary`，分隔符為字面量 `|`（`text-dimmed`），技術棧文案（L22–31）
- **全站僅 1 個頁腳連結**

### 6.5 AiAssistant

- 懸浮 `fixed bottom-6 right-6 z-40`（L149），`h-12 w-12`（48px）`rounded-xl border border-default bg-default`，`hover:scale-105 active:scale-95`
- 面板 `USlideover side="right"`，`w-full sm:max-w-md`（桌面 448px / 行動全寬，L164–168）
- 刻意用 `v-if` + `:open="true"` 而非 `v-model`（L156–163 註解：v-model 下抽屜不渲染）
- 可關閉，`aria-label` 隨狀態切換（L150/169）
- **⚠️ 完全沒有使用 ai 紫羅蘭色板**：組件內 `ai-*` 零命中，圖標與發送鈕都用 `text-primary` / `color="primary"`（brand 青藍）。與 `main.css` L60–66 註解闡述的「AI 用紫羅蘭形成冷暖對比」設計意圖**不一致**

### 6.6 ⌘K 命令面板

- `UModal` + `UCommandPalette`（`app.vue`:155–165），全站級
- 資料源：`NAV_GROUP` 靜態 3 項（L63–71）+ `onMounted` 拉取 trending(20) / posts(20)（L76–106），失敗靜默
- **⚠️ 只註冊了 `meta_k`**（L52–54）：Windows / Linux 的 Ctrl+K 未綁定，儘管註解寫「⌘K / Ctrl+K」

---

## 七、動效

### 7.1 keyframes（5 組）

| 名稱 | 行號 | 用途 |
|---|---|---|
| `fade-up` | L550 | 通用淡入上移（opacity 0→1，translateY 8px→0） |
| `pop` | L561 | 點讚按壓反饋（scale 1→1.28→1） |
| `aurora-drift` | L631 | 光暈漂移（translate3d + scale 1→1.12，20–34s） |
| `ring-breathe` | L652（class L584） | 頭像光環呼吸（opacity .35↔.75，scale 1↔1.05，5.5s）* |
| `gradient-pan` | L669（class L827） | 漸變流動（background-position 0%→200%，9s linear）* |

> ＊上表為 V3 前的現狀快照；V3 執行後，`ring-breathe` 已收斂為 **8s / opacity .35↔.55 / scale 1↔1.02**，`gradient-pan` 改為 **hover/focus 才流動**（見 `04-modification-plan.md` M3-03 / M3-04），實際行號以 `main.css` 為準。

### 7.2 時長與曲線

| 動效 | 時長 | 曲線 |
|---|---|---|
| `.animate-fade-up` | 450ms | `cubic-bezier(.22,1,.36,1)` |
| `.animate-pop` | 280ms | `cubic-bezier(.34,1.56,.64,1)`（回彈） |
| `.ring-breathe` | 5.5s infinite | ease-in-out |
| `.fade-up-enter/leave` | 300ms | `cubic-bezier(.22,1,.36,1)` |
| `.stagger > *` | — | `calc(var(--i,0) * 45ms)` 遞延 |
| `.drift-slow/mid/fast` | 34s / 26s / 20s infinite | ease-in-out（負延遲 -7s / -13s） |
| `.gradient-frame` | 9s infinite | linear |
| `.reveal` | 550ms | `var(--ease-out-expo)` |
| `.tilt` | 350ms | `var(--ease-out-expo)`，`perspective(900px)` |
| `.tilt-spot` | 300ms（opacity） | `var(--ease-out-expo)` |
| `.header-gradient-line::after` | 400ms（opacity） | `var(--ease-out-expo)` |
| `.card-surface` shadow | 300ms | — |
| 側欄寬度 | 200ms | — |
| 抽屜淡入/淡出 | 200ms / 150ms | ease-out / ease-in |

**時長值共約 11 種，無 duration 令牌。** 僅有 1 個 easing 令牌 `--ease-out-expo`（L103）與 1 個 `--blur-aurora: 56px`（L106）。

### 7.3 prefers-reduced-motion：雙層處理 ✅

- CSS 全域（`main.css`:449–459）：`*`/`::before`/`::after` → `animation-duration: .01ms !important`、`animation-iteration-count: 1`、`transition-duration: .01ms`、`scroll-behavior: auto`
- CSS 裝飾補丁（`main.css`:937–966）：`.reveal--pending` 恢復 `opacity:1; transform:none`；`.aurora-blob` / `.gradient-frame` `animation:none !important`；`.tilt` `transform:none !important`；`.animate-fade-up/.animate-pop/.ring-breathe` `animation-delay: 0s !important`
- JS 側（`useTilt.ts`:77、`useReveal.ts`:58）：手工 `window.matchMedia('(prefers-reduced-motion: reduce)')` 檢測（未使用 motion-v 的 `useReducedMotion`）
- 觸屏降級：`@media (hover: none)`（L613–621）禁用 tilt 與 tilt-spot

**評價**：這是本專案做得**最完整**的一塊，達到甚至超過不少商業產品的水準。CSS + JS + 觸屏三層覆蓋，且裝飾區塊有專門補丁。對應 `ui-ux-pro-max` Pre-Delivery Checklist 的 `prefers-reduced-motion respected` 一項 ✅。

### 7.4 motion-v 使用範圍

`nuxt.config.ts`:38 註冊模組（註解 L35–36 說明「只用於必須連續計算的動效」）。使用處：`useTilt.ts`（指針跟隨傾斜）、`useReveal.ts`（進入視口浮現）、`AppTiltCard.vue`、`AuroraBackground.vue`（滾動視差）、`home/GithubCtaSection.vue`。**殼層本身不用 motion-v**（AppHeader 只用自有 `useScrolled()`）—— 分層合理。

---

## 八、風格衝突判定

全站存在 **1 組實質衝突** 與 **2 組輕微不一致**。

### 衝突 1（實質）：企業級克制骨幹 ⟷ 消費級裝飾動效

| | A 面：工具骨幹 | B 面：裝飾表皮 |
|---|---|---|
| 表現 | 語義令牌、暖灰中性、零手寫 dark、網格間距、無 emoji 圖標 | Aurora 光暈（20–34s 漂移）、呼吸光環（5.5s infinite）、傾斜高光、漸變流動（9s infinite）、玻璃卡 |
| 位置 | 殼層 5 個 Vue 檔 + `@theme` | `main.css` 裝飾層（`@layer components` 與 L937–966 降級區）+ `AuroraBackground.vue` |
| 哲學 | Notion 式「內容即介面」 | 消費級行銷頁式「氛圍營造」 |

**判定：A 面（企業級克制）為主風格。** 理由：
1. A 面承載 100% 的功能性介面（導航、內容、表單、命令面板），B 面只出現在首頁與卡片 hover 細節。
2. A 面是令牌驅動的、可維護的；B 面是散落的（裝飾層無令牌、5 組動效各寫各的）。
3. 使用者的主要任務路徑（讀帖、看路線、刷 trending）全部落在 A 面。

**衝突點的具體後果**：`ring-breathe`（5.5s 無限呼吸）與 `aurora-drift`（20–34s 無限漂移）是**永不停止的持續動效**，與 Notion/Linear「介面靜止時絕對安靜」的紀律直接相悖。這類動效在長時間閱讀場景下會產生注意力殘留，且對 `prefers-reduced-motion` 依賴 100% 生效（一旦某條路徑漏掉，使用者無從關閉）。

**收斂方向**：保留 A 面作為唯一主風格，將 B 面降級為「首頁專屬的歡迎層」，不進入內頁與常駐殼層。詳見 02 號文件 §5。

### 不一致 1（輕微）：AI 的色彩語義未落地

`main.css` L60–66 註解明確：「主色是靛藍後，AI 面板若也用靛藍會融進主色……改用低飽和紫羅蘭 #8b5cf6……AI 助手按鈕用上很自然」。但實測 `AiAssistant.vue` 內 `ai-*` 零命中，AI 元素實際用 `text-primary`（青藍）。**設計意圖與實作脫節。**

### 不一致 2（輕微）：兩套字號系統並行

9 檔語義字號令牌 vs 5 種硬編碼 Tailwind 字號，其中兩組完全同值重複（`text-[11px]` ≡ `--text-eyebrow`、`text-xs` ≡ `--text-caption`）。

### 不一致 3（輕微）：同一圖標兩種引入方式

`Sparkles` 同時以 `i-lucide-sparkles`（`AppSidebar.vue`:44）與 `import { Sparkles }`（`AppHeader.vue`:10、`AiAssistant.vue`:14）出現。

---

## 九、可推斷的設計語言規則（隱性規範）

從程式碼中反推出來的、作者實際在遵守但未寫成文件的規則：

1. **色值單一來源**：所有色值只在 `@theme` 定義一次，`app.config.ts` 只做別名映射（`app.config.ts`:8–11 註解明言）。
2. **不自造組件類**：`.glass-bar` / `.nav-link` / `.post-card` / `.ai-panel` / `.tag-pill-*` 已全數刪除，改用 `UHeader` / `UNavigationMenu` / `UButton` / `UCard` / `UAlert`（`main.css`:148–160 註解）。換主題只改 `@theme` 一處。
3. **只在「類名會很長且多處重複」時才抽 `@layer components`**（`main.css`:144–145）。
4. **JS 動效只用於「必須連續計算」的場景**（`nuxt.config.ts`:35–36），其餘交給 CSS。
5. **暗色模式靠語義令牌，不手寫 `dark:`**（殼層 0 處手寫變體）。
6. **踩坑即寫註解**：`@source` 與 `@theme static` 兩處都有詳細的踩坑說明（L15–23、L30–39、L156–163、L440–442）。這是本專案最值得保留的工程習慣。

---

## 十、證據索引

| 檔案 | 審計覆蓋範圍 |
|---|---|
| `apps/web/app/assets/css/main.css` | 裝飾與動效層（V3 後實際行號）：`.glass-card` L726、`.aurora-blob` L690、`.ring-breathe` L584（keyframes L652）、`.gradient-frame` L827、`.tilt-spot` L912；reduced-motion 全域 L449–459、裝飾降級 L937–966 |
| `apps/web/app/app.config.ts` | 全文 42 行 |
| `apps/web/app/app.vue` | 全文 |
| `apps/web/app/components/AppHeader.vue` | 全文 |
| `apps/web/app/components/AppSidebar.vue` | 全文 |
| `apps/web/app/components/AppFooter.vue` | 全文 |
| `apps/web/app/components/AiAssistant.vue` | 全文 |
| `apps/web/nuxt.config.ts` | L35–41（modules/css）、L58–61（colorMode）、L180–186（fonts） |
| `packages/shared/src/constants/avatar.ts` | L28、L54 |
| `apps/web/app/composables/useTilt.ts` / `useReveal.ts` | L77 / L58（reduced-motion 檢測） |

**未實測項（標註「推測」）**：`node_modules` 未安裝，Nuxt UI v4 的 `--ui-text-muted/toned/dimmed` 與 `--ui-bg-default` 的具體綁定色階無法查證；`bg-primary` 在 v4 中解析為 500 還是 600 亦未能實測。相關結論已在文中給出區間值與判定條件。

---

**對比度計算方法**：WCAG 2.1 相對亮度（sRGB 線性化 + ITU-R BT.709 係數），`(L1+0.05)/(L2+0.05)`。白底 `#FFFFFF` 為參考色。
