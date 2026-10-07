# studyplan 可複用設計系統建議

> 配套文件：`01-visual-style-analysis.md`（現狀與論證）、`design-tokens.json`（結構化數據）、`03-issues-and-fixes.md`（問題清單）
> 目標：把「只令牌化了顏色 + 字號」的現狀，補成一套 **primitive → semantic → component** 三層架構，並對齊 Notion / Linear 的克制與完整性水準。
> 所有建議均為**方案文件，未改動任何程式碼**。每個建議標註目標檔案與行號。

---

## 0. 現狀的優點（先別動它）

在給建議之前，先明確哪些東西是對的、不該被「重構」掉：

| 優點 | 證據 | 建議 |
|---|---|---|
| 色值單一來源 | `app.config.ts`:8–11 註解明言；`@theme` 是唯一色值定義處 | 保持 |
| `@theme static` 強制輸出完整色階 | `main.css`:41，註解 L30–39 記錄踩坑 | 保持，並套用到 `ai` 色板 |
| 殼層零手寫 `dark:`，全靠語義令牌 | 5 個 Vue 檔 `dark:` 計數 = 0 | 保持 |
| 不自造組件類，用 Nuxt UI 取代 | `main.css`:148–160 | 保持 |
| `prefers-reduced-motion` 三層覆蓋 | `main.css`:131–140 + L578–607 + `useTilt.ts`:77 / `useReveal.ts`:58；另有 `@media (hover:none)` L613–621 | 保持，這是全專案品質最高的一塊 |
| 踩坑即寫註解的工程習慣 | `@source` L15–23、`@theme static` L30–39、`v-if` 取代 `v-model` L156–163、`.glass-panel` 無陰影 L440–442 | 保持，並擴展到新增令牌 |

**結論：不需要重構，需要「補維度 + 收斂裝飾」。**

---

## 1. 三層令牌架構

### 1.1 現狀差距

```
           顏色    字號    圓角   緩動   模糊   陰影   間距   層級   時長   邊框   透明度
已令牌化    ✅      ✅      ⚠️*    ✅      ✅      ❌     ❌     ❌     ❌     ❌     ❌
```
\* 圓角有令牌但零使用（死令牌）。

六個維度完全裸奔：`shadow` / `spacing` / `z-index` / `duration` / `border` / `opacity`。這是與 Notion/Linear 級別最本質的差距——不是配色不夠好，而是**可調控的維度不夠多**。

### 1.2 目標架構

```
┌─ Layer 1  Primitive（原始值，不含語義）────────────────┐
│  --color-brand-500: #06b6d4                            │  ← 已在 @theme，保持
│  --gray-500: #78716c                                   │
│  --space-4: 1rem                                       │
│  --duration-200: 200ms                                 │
└────────────────────────────────────────────────────────┘
                          ↓ 引用
┌─ Layer 2  Semantic（用途別名，主題可切換）─────────────┐
│  --color-primary: var(--color-brand-700)  ← 文字用     │
│  --color-primary-solid: var(--color-brand-600) ← 實底  │
│  --surface-raised: var(--color-white)                  │
│  --elevation-card: var(--shadow-sm)                    │
│  --space-section: var(--space-16)                      │
└────────────────────────────────────────────────────────┘
                          ↓ 引用
┌─ Layer 3  Component（組件專屬，可覆寫）────────────────┐
│  --card-padding: var(--space-5)                        │
│  --card-radius: var(--radius-card)                     │
│  --card-shadow: var(--elevation-card)                  │
│  --nav-item-bg-active: var(--color-primary-solid)      │
└────────────────────────────────────────────────────────┘
```

**為什麼要分三層**：Layer 2 讓換主題（亮/暗、換品牌色）只動一層；Layer 3 讓「卡片圓角改小但按鈕不變」這種局部調整不必污染全局。Notion/Linear 都是這個結構。

### 1.3 落地位置

- **Layer 1 + Layer 2**：寫進 `main.css` 的 `@theme static`（Tailwind 4 會自動生成 `--color-*` / `--text-*` / `--radius-*` / `--shadow-*` 對應的工具類；注意 `--shadow-*` 與 `--ease-*` 需 `@theme` 才會生成 `shadow-card` / `ease-out-expo` 工具類）
- **Layer 3**：寫進 `@layer components` 的各組件類內（`main.css`:147 起），或對應 Vue 組件的 `<style>` 區塊
- **不在 `@theme` 的純變數**（如 `--z-header`）：放在 `@layer base { :root { … } }`，避免污染 Tailwind 的工具類命名空間

---

## 2. 色彩令牌補全

### 2.1 補齊 `ai` 色階到 11 階（P0）

**問題**：`ai` 只有 6 階（50/100/400/500/600/700），缺 200/300/800/900/950。`app.config.ts`:39 已把 `ai` 註冊為 Nuxt UI 顏色別名，Nuxt UI 會展開 11 階引用（`--ui-color-ai-950: var(--color-ai-950, )`），缺檔取空兜底 —— 與 brand 曾發生的問題**同源**（`main.css`:30–39）。

**建議值**（延續 Tailwind violet 標準色階）：

```css
--color-ai-200: #ddd6fe;
--color-ai-300: #c4b5fd;
--color-ai-800: #5b21b6;
--color-ai-900: #4c1d95;
--color-ai-950: #2e1065;
```
目標：`main.css`:68–73 區塊內插入。

### 2.2 分離「文字用主色」與「實底用主色」（P0）

**問題**：`brand-500 #06b6d4` 對白底對比度僅 **2.43:1**，同時被用作 (a) 實底按鈕的填充色、(b) 連結與圖標的文字色、(c) 焦點環顏色（`main.css`:127）。三種用途的對比度要求不同，卻共用一個值，必然有至少一種不達標。

**建議**：在 `@theme` 之上加一層語義別名：

```css
@layer base {
  :root {
    /* 實底填充：需與其上文字（白）達 4.5:1 → 至少 brand-700 */
    --color-primary-solid:     var(--color-brand-700);  /* #0e7490，白字 5.36:1 ✅ */
    --color-primary-solid-hover: var(--color-brand-800); /* #155e75，白字 7.27:1 */

    /* 文字/圖標：需與背景達 4.5:1 → 至少 brand-700 */
    --color-primary-text:      var(--color-brand-700);  /* #0e7490，白底 5.36:1 ✅ */

    /* 裝飾/邊框/漸變：無對比度要求，可用鮮豔的 400/500 */
    --color-primary-decor:     var(--color-brand-500);
    --color-primary-decor-strong: var(--color-brand-400);
  }
}
```

**注意**：這會讓品牌色「看起來變深」。這是必須的取捨——`#06b6d4` 作為大面積實底在白底上無法承載白字。若希望保留鮮豔觀感，替代方案是**實底按鈕改用深色文字**：`bg-brand-500` + `text-brand-950`（對比度計算：`#083344` 對 `#06b6d4` = 0.432474/0.003150… 需另算，但深色字在高亮青底上通常是可行路徑）。兩個方案二選一，建議前者（改填充色），因為深色文字在青底上視覺上偏「廉價螢光感」。

### 2.3 語義色與狀態色補齊（P1）

目前只有 `brand` 與 `ai`，沒有 `success / warning / error / info` 的語義令牌。內容站至少需要 `error`（表單校驗）與 `warning`（trending 的 stale 過期徽章目前是「琥珀色」，推測為硬編碼或 Tailwind 內建 amber）。

```css
--color-success-500: #16a34a;  /* 白字 3.05:1 — 實底建議用 600 #15803d */
--color-warning-500: #d97706;  /* 白字 3.13:1 — 實底建議用 600 #b45309，文字建議用 700 */
--color-error-500:   #dc2626;  /* 白字 4.83:1 ✅ */
--color-error-700:   #b91c1c;  /* 白底 6.55:1 ✅ 文字用 */
```
> 註：success/warning 的實底值僅為候選，落地前需實測對比度。

### 2.4 裝飾色令牌化（P2）

把散落的硬編碼字面量收進 `@theme`：

| 現在 | 位置 | 建議令牌 |
|---|---|---|
| `rgb(15 23 42 / 0.18)` | `main.css`:398 | `--shadow-ambient: rgb(15 23 42 / .18)` |
| `rgb(255 255 255 / 0.14)` | `main.css`:397 | `--glass-highlight: rgb(255 255 255 / .14)` |
| `rgb(255 255 255 / 0.12)` | `main.css`:557 | `--spot-highlight: rgb(255 255 255 / .12)` |
| `bg-black/40` | `app.vue`:129 | `--overlay-scrim: rgb(0 0 0 / .4)` |
| `text-white` | `AppHeader.vue`:91、`AppSidebar.vue`:43 | `--color-on-primary: #fff` |
| `opacity-70` | `AppSidebar.vue`:71 | `--opacity-secondary: .7` |
| `bg-default/75` | `AppHeader.vue`:63 | `--glass-surface-alpha: .75` |

---

## 3. 排版系統：字階模數化

### 3.1 問題回顧

現有 9 檔：11 / 12 / 12.5 / 13 / 13.5 / 15 / 17 / 22 / 26 px
- 比值序列 1.09 / 1.04 / 1.04 / 1.04 / 1.11 / 1.13 / 1.29 / 1.18 —— 前五檔擠在一起，肉眼無法區分
- 含 2 個分數像素（12.5 / 13.5）
- 無 line-height / letter-spacing / font-weight 配對
- 正文 13.5px 低於行動端 16px 的可讀性底線

### 3.2 建議字階（7 檔，4px 對齊，附完整配對）

```css
@theme static {
  /* --- size --- */
  --text-xs:     0.75rem;    /* 12px */
  --text-sm:     0.875rem;   /* 14px */
  --text-base:   1rem;       /* 16px */
  --text-lg:     1.125rem;   /* 18px */
  --text-xl:     1.25rem;    /* 20px */
  --text-2xl:    1.5rem;     /* 24px */
  --text-3xl:    1.875rem;   /* 30px */

  /* --- line-height（與 size 一一配對）--- */
  --leading-xs:    1rem;      /* 16px → 12px 字 */
  --leading-sm:    1.25rem;   /* 20px → 14px 字 */
  --leading-base:  1.5rem;    /* 24px → 16px 字，比值 1.5 ✅ */
  --leading-lg:    1.75rem;   /* 28px → 18px 字，比值 1.56 */
  --leading-xl:    1.75rem;   /* 28px → 20px 字 */
  --leading-2xl:   2rem;      /* 32px → 24px 字 */
  --leading-3xl:   2.375rem;  /* 38px → 30px 字 */

  /* --- letter-spacing --- */
  --tracking-tight:   -0.011em;
  --tracking-normal:   0em;
  --tracking-eyebrow:  0.18em;  /* 取自 AppSidebar.vue:53 的既有值 */
}
```

### 3.3 舊令牌 → 新令牌 映射表（遷移用）

| 舊令牌 | 舊 px | 新令牌 | 新 px | 變化 | 說明 |
|---|---|---|---|---|---|
| `--text-eyebrow` | 11 | `--text-xs` | 12 | +1 | 11px 過小，且已有 `text-[11px]` 硬編碼在 `AppSidebar.vue`:53 |
| `--text-caption` | 12 | `--text-xs` | 12 | 0 | 合併 |
| `--text-meta` | 12.5 | `--text-sm` | 14 | +1.5 | 消除分數像素 |
| `--text-body-sm` | 13 | `--text-sm` | 14 | +1 | 合併 |
| `--text-body` | 13.5 | `--text-base` | **16** | **+2.5** | **關鍵提升**：對齊行動端 16px 底線 |
| `--text-subtitle` | 15 | `--text-lg` | 18 | +3 | — |
| `--text-title` | 17 | `--text-xl` | 20 | +3 | — |
| `--text-heading` | 22 | `--text-2xl` | 24 | +2 | `.prose-post h2` 的 `text-xl` 亦改指此 |
| `--text-display` | 26 | `--text-3xl` | 30 | +4 | — |

**遷移風險**：正文從 13.5px → 16px 會讓所有內容區變高約 18%，需同步檢查首頁 2×2 分區、帖子卡片列表、路線頁的佈局是否溢出。建議先在單一頁面（如 `/posts`）試點。

### 3.4 字體族令牌化

```css
@theme static {
  --font-sans: 'Inter', 'Noto Sans SC', 'PingFang SC', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
```
目標：`main.css`:117–118 的 `@layer base { html { font-family: … } }` 改為 `@apply font-sans;`，讓 `font-sans` 工具類也正確指向 Inter。

---

## 4. Elevation 與維度補全

### 4.1 Elevation 令牌（P1）

現狀：4 種裸值（`sm` / `md` / `xl` / `.glass-card` 自訂），無語義層級。

```css
@theme static {
  /* 雙層陰影：近距銳利 + 遠距柔和，避免單層陰影的「灰邊」感 */
  --shadow-xs: 0 1px 2px rgb(15 23 42 / 0.06);
  --shadow-sm: 0 1px 3px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.05);
  --shadow-md: 0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.05);
  --shadow-lg: 0 12px 32px -8px rgb(15 23 42 / 0.14), 0 4px 12px -4px rgb(15 23 42 / 0.07);
  --shadow-overlay: 0 24px 64px -16px rgb(15 23 42 / 0.22), 0 8px 24px -8px rgb(15 23 42 / 0.10);

  /* 玻璃專用：保留既有高光邊 + 外投影（main.css:396-399 原值） */
  --shadow-glass: inset 0 1px 0 0 var(--glass-highlight), 0 12px 40px -16px var(--shadow-ambient);
}
```

**語義映射（Layer 2）**：
```css
@layer base {
  :root {
    --elevation-card:    var(--shadow-xs);
    --elevation-card-hover: var(--shadow-sm);
    --elevation-panel:   var(--shadow-sm);
    --elevation-fab:     var(--shadow-md);
    --elevation-drawer:  var(--shadow-overlay);
    --elevation-glass:   var(--shadow-glass);
  }
}
```
取代處：`main.css`:458/466（`.card-surface` / `-sm` 的 `shadow-sm → hover:shadow-md`）、`app.vue`:130（`shadow-xl` → `--elevation-drawer`）、`AppHeader.vue`:91 / `AppSidebar.vue`:43 / `AiAssistant.vue`:149（`shadow-sm` → `--elevation-fab` 或 `--elevation-panel`）。

### 4.2 Z-index 層級（P1）

現狀：只有 `z-40`（`AiAssistant.vue`:149）與 `z-50`（`app.vue`:128、`AppHeader.vue`:63）兩個裸值，且 **AI 懸浮鈕 z-40 低於頁頭 z-50** —— 若兩者在行動端重疊，AI 鈕會被頁頭蓋住。這是潛在的真實 bug。

```css
@layer base {
  :root {
    --z-base:     0;
    --z-sticky:   10;
    --z-dropdown: 20;
    --z-fab:      30;   /* AI 懸浮鈕：需低於 header 嗎？見下方決策 */
    --z-header:   40;   /* sticky 頁頭 */
    --z-drawer:   50;   /* 行動抽屜 + 遮罩 */
    --z-modal:    60;   /* ⌘K 命令面板 */
    --z-toast:    70;
    --z-tooltip:  80;
  }
}
```

**需要注意的決策**：AI 懸浮鈕應在頁頭之上還是之下？它固定在右下角，與頁頭不重疊，兩者順序無功能差異；但**抽屜與模態必須在其上**，否則行動端打開抽屜時 AI 鈕會浮在遮罩之上（目前 z-40 < z-50，此點正確）。建議明確為 `--z-fab: 30`。

> 推測：`UHeader` / `UModal` / `USlideover` 內部有自己的 z 值（Nuxt UI 通常用 `z-50` 級別）。落地前需實測是否與本層級衝突（`node_modules` 未安裝，本次未能查證）。

### 4.3 Duration 與 Easing（P2）

現狀：約 11 種時長裸值，僅 1 個 easing 令牌。

```css
@theme static {
  --duration-instant: 100ms;
  --duration-fast:    150ms;
  --duration-base:    200ms;
  --duration-slow:    300ms;
  --duration-slower:  450ms;
  --duration-enter:   200ms;
  --duration-exit:    150ms;   /* 出場應快於入場 */

  --ease-out-expo:  cubic-bezier(0.22, 1, 0.36, 1);        /* 已有 */
  --ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1);     /* 回彈，既有 .animate-pop */
  --ease-in-out:    cubic-bezier(0.4, 0, 0.2, 1);
}
```
取代處：`app.vue`:114（側欄 200ms → `--duration-base`）、`app.vue`:123–126（200/150ms → `--duration-enter/exit`）、`main.css`:251–563 各動效時長。

### 4.4 圓角：復活死令牌（P1）

現狀：`--radius-card: 1rem` / `--radius-pill: 9999px` 零使用；實際用 `rounded-xl`(12) / `rounded-2xl`(16) / `rounded-lg`(8) / `rounded-full`。

```css
@theme static {
  --radius-sm:    0.5rem;   /* 8px   取代 rounded-lg */
  --radius-card:  0.75rem;  /* 12px  取代 rounded-xl —— 注意：改為 12px 而非原 1rem */
  --radius-panel: 1rem;     /* 16px  取代 rounded-2xl */
  --radius-pill:  9999px;   /* 取代 rounded-full */
}
```
然後全站替換：`rounded-lg → rounded-sm`、`rounded-xl → rounded-card`、`rounded-2xl → rounded-panel`、`rounded-full → rounded-pill`。

### 4.5 間距語義層（P2）

Tailwind 默認刻度本身符合 4px 網格，問題在**沒有語義層**。加一層別名，不動刻度值：

```css
@theme static {
  --space-inline:  0.5rem;  /* 8px   標籤間距 */
  --space-stack:   0.75rem; /* 12px  表單元素間 */
  --space-card:    1.25rem; /* 20px  卡片內距（現 p-5） */
  --space-block:   1.5rem;  /* 24px  卡片之間 */
  --space-section: 4rem;    /* 64px  區塊之間（取代 mt-16，AppFooter.vue:15） */
}
```

### 4.6 佈局令牌（P2）

```css
@layer base {
  :root {
    --layout-header-h:            4rem;   /* 64px，AppHeader.vue:63 h-16 */
    --layout-sidebar-expanded:    16rem;  /* 256px，app.vue:114 w-64 */
    --layout-sidebar-collapsed:   5rem;   /* 80px，app.vue:115 w-20 */
    --layout-content-max:         75rem;  /* 1200px，需在 app.vue:144 新增 */
    --fab-size:                   3rem;   /* 48px，AiAssistant.vue:149 */
    --fab-inset:                  1.5rem; /* 24px，bottom-6 right-6 */
    --blur-glass:                 24px;   /* 對應 backdrop-blur-xl，AppHeader.vue:63 */
  }
}
```

**`--layout-content-max` 是新增建議**：`app.vue`:144 的 `main` 目前無 `max-w-*`，各頁面自行決定內容寬度，對標 Notion/Linear 的「可預測內容寬度」原則存在一致性風險。建議在殼層統一約束為 `mx-auto w-full max-w-[var(--layout-content-max)]`，頁面有特殊需求時再覆寫。

### 4.7 圖標尺寸約定（P2）

現狀：`Sparkles :size="18"`（`AppHeader.vue`:92）、`:size="20"`（`AiAssistant.vue`:153）、`:size="14"`（`AiAssistant.vue`:175）、`BookOpen :size="14"`（`AppFooter.vue`:27）—— 硬編碼 4 種。

```css
@layer base {
  :root {
    --icon-xs: 12px;
    --icon-sm: 14px;
    --icon-md: 16px;
    --icon-lg: 20px;
    --icon-xl: 24px;
  }
}
```
並統一圖標引入方式：**優先 `i-lucide-*` 字符串**（Nuxt UI 原生、可走 `UIcon` 的 size prop），僅在需要傳遞複雜 props 時才用組件導入。消除 `Sparkles` 的雙路徑（C4）。

---

## 5. 裝飾層收斂：與主風格和解

這是本專案最需要「做減法」的一塊。衝突 C1 已判定：**企業級克制骨幹為主風格**，裝飾層應降級。

### 5.1 原則

| 原則 | 說明 |
|---|---|
| **空間隔離** | 裝飾動效只出現在首頁 Hero 與歡迎區，**不進入內頁與常駐殼層** |
| **時間隔離** | 持續性無限動效（infinite）總量控制：全頁同時運行的 infinite 動效 ≤ 2 組 |
| **語義隔離** | 裝飾不得承載資訊。呼吸光環若用於標示「在線/有新內容」，必須同時提供非動效提示（文字 / 圖標 / 顏色） |
| **可關閉** | 所有非必要動效必須受 `prefers-reduced-motion` 約束（目前已做，保持） |

### 5.2 具體建議

| 動效 | 現狀 | 建議 | 理由 |
|---|---|---|---|
| `aurora-drift`（20–34s × 3 blob） | 首頁背景常駐 | ✅ 保留，但**僅限首頁** | 是品牌記憶點，且 drift 極慢（20s+），注意力殘留低 |
| `ring-breathe`（5.5s infinite） | 頭像光環 | ⚠️ **降級**：改為「有新內容時才呼吸」，或縮到 opacity .35↔.55 並把週期拉長到 8s | 5.5s 週期在閱讀場景下是可感知的持續閃爍，且無限運行 |
| `gradient-pan`（9s infinite） | `.gradient-frame` | ⚠️ 改為「hover 時才流動」，靜止時停在漸變中段 | 靜止介面不應有持續位移 |
| `tilt` / `tilt-spot` | 卡片指針跟隨 | ✅ 保留（已有 `@media (hover:none)` 與 reduced-motion 雙重降級） | 是主動互動反饋，非被動干擾 |
| `.glass-card` 的 backdrop blur | 卡片 | ⚠️ 若卡片層級多、捲動時有卡頓，考慮降為純色 + 1px 邊框 | Glassmorphism 風格庫標註 accessibility risk: conditional |

### 5.3 決策記錄模板

新增裝飾動效前，建議在 PR 中回答：
1. 它承載資訊嗎？（是 → 必須有非動效替代）
2. 它無限運行嗎？（是 → 全頁同類動效是否 ≤ 2？）
3. `prefers-reduced-motion` 下會正確關閉嗎？
4. 它在內頁也會出現嗎？（是 → 重新考慮）

---

## 6. 暗色模式擴展路徑

### 6.1 現狀評價

殼層零手寫 `dark:` 是**正確的架構**（`nuxt.config.ts`:58–61 設定 `preference: 'light'` / `fallback: 'light'`）。但存在兩個未驗證點：

1. **自訂組件類沒有 dark 覆蓋**：`.glass-card`（`main.css`:396）、`.card-surface`（L458）、`.gradient-frame`（L475）、`.tilt-spot`（L553）裡的 `rgb(255 255 255 / .14)` 等高光值是**為亮色設計的**，在暗色下白色的高光會過曝。
2. **暗色對比度未實測**：`node_modules` 未安裝，無法查證 `--ui-*` 在 dark 下的綁定。

### 6.2 建議：裝飾色走 CSS 變數 + `.dark` 覆蓋

```css
@layer base {
  :root {
    --glass-highlight: rgb(255 255 255 / 0.14);
    --glass-ambient:   rgb(15 23 42 / 0.18);
    --spot-highlight:  rgb(255 255 255 / 0.12);
  }
  .dark {
    --glass-highlight: rgb(255 255 255 / 0.06);  /* 暗色下降低高光強度 */
    --glass-ambient:   rgb(0 0 0 / 0.40);        /* 暗色下投影需更深 */
    --spot-highlight:  rgb(255 255 255 / 0.05);
  }
}
```
`main.css`:397–398 / :557 改引用這些變數。

### 6.3 暗色對比度預測（已計算，供參考）

| 組合 | 對比度 | 判定 |
|---|---|---|
| `brand-500 #06b6d4` 文字 / 圖標 on `stone-950 #0c0a09` | **8.14:1** | ✅ 暗色下主色充足 |
| `brand-400 #22d3ee` on `stone-950` | **10.93:1** | ✅ |

**結論：暗色模式的品牌色對比度是安全的，問題只在亮色模式**。這進一步支持「亮色下把主色加深到 700」的方案——可以透過 `:root` / `.dark` 分別指定 `--color-primary-text` 來兼顧兩種模式：

```css
:root { --color-primary-text: var(--color-brand-700); }  /* 亮色：5.36:1 */
.dark { --color-primary-text: var(--color-brand-400); }  /* 暗色：10.93:1 */
```

### 6.4 實心按鈕的雙模式

白字 on `brand-700` = 5.36:1（亮色）✅。暗色下建議實底改 `brand-600` + 白字 = 3.68:1 ❌，或 `brand-700` + 白字 = 5.36:1 ✅ —— **暗色下繼續用 brand-700 即可**，不需要額外分支。

---

## 7. 組件規格建議

### 7.1 Button（主按鈕）

| 屬性 | Default | Hover | Active | Disabled |
|---|---|---|---|---|
| Background | `--color-primary-solid` (brand-700) | `--color-primary-solid-hover` (brand-800) | brand-800 | `bg-muted` |
| Text | `#fff` | `#fff` | `#fff` | `text-dimmed` |
| Border | 無 | 無 | 無 | 無 |
| Shadow | `--shadow-xs` | `--shadow-sm` | 無 | 無 |
| Radius | `--radius-card` | — | — | — |
| Transition | `--duration-fast` + `--ease-out-expo` | | | |

### 7.2 Card

| 屬性 | 值 |
|---|---|
| Padding | `--space-card`（20px） |
| Radius | `--radius-card`（12px） |
| Border | 1px `border-default` |
| Shadow | `--elevation-card` → hover `--elevation-card-hover` |
| Shadow transition | `--duration-slow` |
| Background | `bg-default`（語義） |

### 7.3 Sidebar 導航項

| 狀態 | Background | Text | Icon |
|---|---|---|---|
| Default (ghost) | transparent | `text-toned` | `text-dimmed` → 應改 `text-toned`（見 03-P1） |
| Hover | `bg-elevated` | `text-highlighted` | `text-toned` |
| Active (solid) | `--color-primary-solid` | `#fff` | `#fff` |
| Focus | 上述 + `:focus-visible` outline | | |

### 7.4 Tag / Chip（標籤篩選）

UX 基準要求「Chip Collection Reflow」：篩選標籤必須能換行，不能強制單行裁剪。建議：
- 容器 `flex-wrap`，不做 `overflow: hidden`
- 溢出時提供可操作的 `+n` 披露
- 選中態不能只靠顏色（需有邊框粗細或填充差異）

---

## 8. 落地順序建議

| 階段 | 內容 | 風險 | 依賴 |
|---|---|---|---|
| **S1** | 補齊 `ai` 色階（2.1） | 無 | 無 |
| **S2** | 分離實底/文字主色（2.2）+ 焦點環改色（03-P0） | 中：全站強調色變深，需全量視覺回歸 | 需先確認 `bg-primary` 實際解析值 |
| **S3** | Elevation + Z-index + 圓角令牌（4.1/4.2/4.4） | 低 | 無 |
| **S4** | 字階模數化（3.2/3.3） | **高**：正文 13.5→16px 影響所有版面 | 建議先單頁試點 |
| **S5** | Duration / spacing / 佈局 / 圖標令牌（4.3/4.5/4.6/4.7） | 低 | S3 |
| **S6** | 裝飾層收斂（5.2） | 低，但是主觀決策 | 需產品方確認 |
| **S7** | 暗色模式驗證與覆蓋（§6） | 中 | S2 |

**前置條件**：`pnpm install` 後實測 Nuxt UI v4 的 `--ui-*` 綁定值（`node_modules` 目前未安裝，本報告中相關結論標註為「推測」）。

---

## 9. 建議的工程配套

1. **建立 `design-system/MASTER.md`**：用 `ui-ux-pro-max` 的 `--persist` 生成設計系統主檔，後續會話可階層式檢索（Master + 頁面覆寫）。
2. **新增令牌時同步寫註解**：延續專案既有的「踩坑即寫註解」習慣（`main.css`:15–23 / 30–39）。每組令牌註明「為什麼是這個值」。
3. **死令牌定期清理**：`--radius-card` / `--radius-pill` 是已發生的案例。建議每季 grep 一次令牌使用率。
4. **對比度納入 CI**：可用 `design-system` 技能的 `validate-tokens.cjs` 或自建腳本，檢查是否有 `#hex` / `rgba()` 字面量混入組件層。
