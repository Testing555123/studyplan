---
name: "m3.material.io Design System"
version: "alpha"
description: "Extracted visual reference. Tokens are measured samples; semantic roles require context. Unobserved values are omitted."
colors:
  primary: "rgb(28, 27, 29)"
  surface: "rgba(0, 0, 0, 0)"
typography:
  h1:
    fontFamily: "\"Google Sans\", sans-serif"
    fontSize: "96px"
    lineHeight: "96px"
    fontWeight: 475
  h2:
    fontFamily: "\"Google Sans\", sans-serif"
    fontSize: "57px"
    lineHeight: "64px"
    fontWeight: 475
  h3:
    fontFamily: "\"Google Sans\", sans-serif"
    fontSize: "28px"
    lineHeight: "36px"
    fontWeight: 475
  body:
    fontFamily: "\"Google Sans Text\", sans-serif"
    fontSize: "16px"
    lineHeight: "24px"
    fontWeight: 400
rounded:
  sample-1: "0px"
  sample-2: "24px"
  sample-3: "40px"
  sample-4: "4px"
  sample-5: "16px"
  sample-6: "18px"
  sample-7: "32px"
spacing:
  sample-1: "0px"
  sample-2: "16px"
  sample-3: "32px"
  sample-4: "8px"
  sample-5: "24px"
  sample-6: "64px"
  sample-7: "1px"
  sample-8: "2px"
  sample-9: "4px"
  sample-10: "14px"
  sample-11: "40px"
  sample-12: "20px"
components:
  sample-button:
    backgroundColor: "rgba(0, 0, 0, 0)"
    textColor: "rgb(77, 66, 86)"
    rounded: "4px"
    padding: "2px"
  sample-link:
    backgroundColor: "rgba(0, 0, 0, 0)"
    textColor: "rgb(100, 66, 214)"
    rounded: "4px"
    padding: "1px"
---

**How to use this file:** Read this extracted design system before building a new page. Preserve the observed visual identity while composing for the new reader's task and content. Keep supplied facts, the host framework, and accessibility requirements intact. This is a sampled reference, not an official brand specification or a fixed page template.

**Evidence priority:** The frontmatter contains conservative measured samples; its token values take precedence over visual estimates. Semantic roles are inferred from the sampled elements and must be checked against their context. Missing tokens, states, themes and breakpoints are unknown, not defaults. Existing host components remain the implementation foundation unless a verified public stylesheet/API is explicitly provided.

## Overview

原站是 Material Design 3 官方站（m3.material.io），Angular SPA，由门户首页、Styles 规范区（颜色、字体、形状、动效、高度、间距、图标）、Foundations/Develop/Get started/Components 总览与重点组件规格页构成。本文件合并覆盖 28 个页面、每个页面浅色与暗色双主题：首页；/styles 及 color 系统 7 页（system/overview、roles、static、dynamic、advanced、choosing-a-scheme、resources）；typography、shape、motion overview 与 motion/easing-and-duration、elevation、spacing、icons；/foundations、/develop、/get-started、/components；组件 buttons、cards、app-bars、button-groups 的 overview 与 specs 页。采集视口统一为桌面 1440x900，DOM 与计算样式共采样 9408 个元素，暗色均经 emulateMedia 切换并验证（body 获得 dark-mode 类、表面色实测反转）。证据按 output/m3.material.io/pages/<页面 slug>/{light,dark}/ 存放（collected.json 与 2 张滚动截图），首页既有浅色文档为 output/m3.material.io/design.md。受众与任务（推断）：设计师与工程师按规范页查阅 token 与原则、按组件页查阅规格与状态，因此"查得到、可对照"比视觉华丽更重要。

截图验证范围：已实际查看 17 张截图，覆盖 color/system/overview、typography、shape、motion overview、buttons/cards/app-bars/button-groups overview 的浅色与暗色首屏，以及 buttons specs 页的状态矩阵区；其余页面与滚动位置仅依据 DOM/CSS 证据，其视觉构图未经验证。局限：仅桌面视口，移动端断点未测试；hover/focus/disabled 状态未采集；动效仅有 CSS 声明（0.2s/0.3s），未观测运行效果；博客与其余组件子页不在本次范围；颜色规范页的调色板以色块图像渲染，具体令牌色值未测量。

可观察且可复用的设计决策（在首页五条基础上扩展为全站结论）：

1. 双主题镜像色板，全站零例外：28 个页面的浅色/暗色采样呈现一致映射——表面与卡片 #f8f1f6 对 #1c1b1d、主文字 #1c1b1d 对 #e6e1e3、次级文字 #4d4256 对 #cbc4cc、链接与强调 #6442d6 对 #9f86ff、导航搜索底 #f1d3f9 对 #553f5d、徽标/令牌按钮 #dcdaf5 对 #45455a、搜索输入 #ffffff 对 #0f0e0f、视频框 #f5eff1 对 #323032（证据：各页 digest 的 bg/text colors 计数）。规则：token 必须成对定义，禁止只写浅色值。
2. 排版驱动识别：Google Sans 承担 96/57/28/24px、字重 475 的展示层级，Google Sans Text 承担 16/14px 正文与标签，display 为 body 的 6 倍；该比例在全站每个页面重复（证据：各页 typography 行）。规则：展示与正文分族，层级只走实测档位。
3. 规范页统一模板：左文右图分屏 Hero（96px 标题加一句导语，右侧大幅品牌图形）加胶囊分段导航（Overview 等，激活项淡紫 pill）加星号要点列表加右侧 On this page 目录（截图验证 color/typography/shape/motion 四页）。规则：规范内容按"原则短句加子页导航"组织，不做长段落。
4. 组件页统一模板：Hero 加资源 chips（平台图标加 +N 计数）加设备演示图加 Overview/Specs/Guidelines/Accessibility 四 tab 加星号要点（截图验证 buttons/cards/app-bars/button-groups）；specs 页带编号状态矩阵（Enabled、Disabled、Hovered、Focused、Pressed）与 Tokens & specs、Anatomy、Measurements 分区（截图验证 buttons specs）。规则：组件文档按"变体-配置-令牌-解剖-状态-测量"固定顺序。
5. 扁平层级：全站唯一阴影是侧导航栏 pause 按钮的一级 elevation（rgba(0,0,0,0.3) 0 1px 2px 加 rgba(0,0,0,0.15) 0 1px 3px 1px），包括规格页在内的所有卡片与面板 shadow 均为 none。规则：层级靠色阶与反转深色块，不靠投影。

## Colors

语义角色与双主题实测值（designTokens 为本次提取文档的确定值，非官方品牌规范；色值为各页计算样式采样）：

- 页面/卡片表面：浅色 #f8f1f6（color.surface.base，用于 a.thumbnail 卡片与 overline 链接），暗色 #1c1b1d；两者在全站每个页面成对出现。
- 主文字：浅色 #1c1b1d（h1/h2 与卡片标题），暗色 #e6e1e3；body 默认文字 #1f1f1f 双主题不变。
- 次级文字：浅色 #4d4256（h3、正文描述、导航项），暗色 #cbc4cc；注意首页 designTokens.colors.primary 采样自 p 元素即此值，是前景文字色而非品牌强调色。
- 强调/链接：浅色 #6442d6（a 链接、平台链接、首页主 CTA 背景），暗色 #9f86ff；暗色首页主 CTA 反转为 #9f86ff 底加 #1a0056 字（唯一实心强调件的暗色形态）。
- 导航搜索底：浅色 #f1d3f9，暗色 #553f5d。
- 徽标与激活令牌按钮：浅色 #dcdaf5 底加 #21182b 字，暗色 #45455a 底加 #e2e0fb 字（specs 页 token 选择器）。
- 搜索输入：浅色 #ffffff，暗色 #0f0e0f。
- 视频/媒体框：浅色 #f5eff1，暗色 #323032。
- 规范文档令牌：app-bars specs 页出现复制按钮标签 copy #6750A4（M3 baseline primary 的文档引用，仅此一处文本证据）；颜色规范页（roles、static baseline 等）的调色板以色块图像渲染，各角色令牌色值未测量，文档中不编造。
- 图形用色：品牌插画（color 页的绿黄有机色块、typography 页的绿底蓝 G、shape 页的绿蓝天际线、motion 页的黄绿渐变球）在双主题下保持原色不反转（截图验证），即"图形不参与主题镜像，只有界面表面镜像"。
- 颜色规范页的信息架构（DOM 标题证据）：roles 页定义 Primary、Secondary、Tertiary、Error、Surface、Outline 与 Add-on 角色并含 Inverse colors 小节；static 页分 Baseline 与 Custom brand 两组并列出 Primary/Secondary/Tertiary/Error/Surface/Outline/Add-ons 颜色组；system overview 强调 26+ 颜色角色映射、三档对比、基于色调的表面色与内置暗色主题（截图星号要点验证）。

## Typography

双家族分工在全站 28 页完全一致，且双主题不改排版：

- Google Sans（展示族，可变字体，字重 475）：h1 96px/96px（首页与规范页主标题）、h2 57px/64px（章节标题）、h3 28px/36px（规格页小节标题）、h4 24px/32px（specs 页状态子标题）、24px/32px（组件页次级标题）；advanced 页 h1 为 72px/80px（长标题降档的实证）。
- Google Sans Text（正文族）：正文 16px/24px 字重 400；链接与导航 16px/24px 字重 500；h3 与标签 14px/20px 字重 400 或 500；大号链接 16px/44px 字重 500；章节导语 22px/30px 字重 400。
- 图标与回退：Google Symbols 24px/24px 字重 400（图标字体，全站导航与列表图标）；Arial 13.3333px/40px 字重 400（pause 等图标按钮的文字回退形态）。
- 字重 475 是可变字体中间字重（观察值）；color roles 页出现 14px/20px 字重 700 的列表强调，是全站唯一加粗场景。
- 层级关系：display 96px 为正文 16px 的 6 倍；规格页内部再用 57/28/24 三档区分页标题、小节、子标题。
- typography 规范页结构（标题与截图证据）：M3 类型比例含 30 种类型样式（15 baseline 加 15 emphasized）、可变字体、Material token 控制字体/字号/行高/字距/字重，并专题介绍 Google Sans Flex；不补造未测字号。

## Layout

- 桌面骨架：左侧 88px 固定图标导航栏（高约 582px），主内容自 left=88 起、宽约 1352px；页面滚动发生在 div.page-content 容器而非窗口（SPA 行为，各页 scrollHeight 1400-21000px 不等）。
- 规范页模板：Hero 分屏（左标题导语约 552-760px 栏宽，右侧品牌图形约占半屏）加通栏胶囊分段导航（如 Overview/Fonts/Type scale & tokens/Applying type/Editorial treatments）加双栏正文（左星号要点，右 On this page 目录）。
- 组件页模板：Hero 加资源 chips 加右侧设备演示图，之下四 tab 导航（Overview/Specs/Guidelines/Accessibility），specs 页内按 Variants、Configurations、Tokens & specs、Anatomy、Color、States、Measurements 分节并配编号状态矩阵。
- 间距体系：4px 基座；实测内边距档位 1px、2px、8px 16px、16px 24px、0px 24px、12px、6px 8px 6px 16px、2px 8px 2px 12px、1px 48px；章节容器 64px 40px。官方 dp 参考值（页面文本证据）：buttons 16/24/36/40dp，button-groups 32/18/48/2dp，app-bars 112/24dp，elevation 1/7/8dp，shape 20/32/48dp，spacing 8/12/24dp。
- 分组规则：卡片行双列（约 584px）或通栏 feature（约 1176px）；章节等于一个 h2 加一组同类卡片或要点。
- 响应式：仅采集 1440x900；组件页导航中虽含响应式演示视频引用（DOM 媒体清单），但实际断点行为未测试；实现时先重排（双列改单列）再缩字。

## Elevation & Depth

阴影在全站几乎不用：唯一的 box-shadow 是侧导航栏 pause 按钮（button#btnToggleVideo）的一级 elevation——rgba(0, 0, 0, 0.3) 0px 1px 2px 0px 叠加 rgba(0, 0, 0, 0.15) 0px 1px 3px 1px——在 28 页双主题中共出现且仅出现在该控件；主 CTA、卡片、面板、输入框的 shadow 均为 none。层级由三种手段建立：表面色阶（#f8f1f6 卡片相对于近白页面，暗色 #1c1b1d 相对于更深的内容块）、文字色阶（#1c1b1d/#4d4256，暗色 #e6e1e3/#cbc4cc）、反转深色块（motion 页的深色演示卡、buttons specs 的状态矩阵暗色衬底）。elevation 规范页的结构（标题与 dp 证据）为 resting elevation 默认值与 changing elevation，dp 参考 1/7/8；cards specs 页定义 elevated、filled、outlined 三种卡片变体及其颜色与状态，但其页面 chrome 本身不加阴影。规则：默认扁平；仅浮动控件用一级 elevation；不要用投影弥补分组混乱。

## Shapes

- 圆角档位（全站实测 usage 聚合）：4px 主导（导航项、小控件、链接），24px（卡片与 thumbnail），40px（组件页资源 chips 等中件），50%（圆形图标按钮），18px、32px、16px、8px、28px（规格页与特殊件），48px（首页主 CTA 与同级大按钮），0px（章节区块容器）。
- 规则：圆角随组件尺寸分档，小件 4px、卡片 24px、中大按钮 48px、chips 40px、圆形 50%；不统一取值，也不给容器加圆角。
- 图标：Google Symbols 图标字体以连字文本使用（search、material_design、play_arrow、dark_mode、add_circle 等），24px 网格；icons 规范页提供 Material Symbols、可调 axes 与 Figma 插件（标题证据）。
- 形状规范页（截图与标题证据）：M3 形状系统含原创形状、圆角比例尺与内置形变；原则包括抽象形状克制使用、矩形默认全圆角、单角可调制造不对称、形状可与文字调和、可 2.5D；dp 参考 20/32/48；形状库含 35 个形状并内置 shape morph 动效（首页卡片文字佐证）。

## Components

### 全局框架组件

- 侧导航栏（nav.nav-rail-content，88px 宽）：顶部 search 入口（浅 #f1d3f9 圆形底，暗 #553f5d），7 个图标加标签项（Home、Get started、Develop、Foundations、Styles、Components、Blog；当前项淡色 pill 高亮，默认态透明底、#4d4256 文字、4px 圆角、16px/24px 字重 500、80x60），底部两个 mio-toggle-switch（视频暂停、暗色模式；暗色切换由 prefers-color-scheme 驱动，body 加 dark-mode 类）。截图验证双主题形态。
- 分段导航与 tab：规范页用胶囊分段导航（激活项淡紫 pill），组件页用四 tab（Overview/Specs/Guidelines/Accessibility，带 info/specs/guidelines/accessibility 图标）；transition 声明 0.3s（门户页）或 0.2s（规范与组件详情页）。
- 资源 chips：组件页 Hero 下的平台资源计数 chips（ Resources 文字加平台图标加 +N，40px 圆角）。
- 复制链接按钮：区块标题旁 link 图标按钮，点击显示 Copy link/Link copied；specs 页令牌复制按钮标签为 copy #6750A4。
- 搜索输入：input 背景浅 #ffffff、暗 #0f0e0f；激活的令牌集选择按钮 #dcdaf5/#21182b（浅）与 #45455a/#e2e0fb（暗）。
- 跳转与页脚：body 首链接 Skip to main content；页脚含 about 段落、四组 h3 链接列（Social、Libraries、More Google sites、Archived versions）与法律行。

### 规范页模板组件

分屏 Hero（96px Google Sans 标题加一句导语加右侧品牌图形）加胶囊分段导航加星号要点列表加右侧 On this page 目录；正文双栏，要点以星号或菱形符号引导，链接 16px/24px 字重 500。该模板在 color、typography、shape、motion、elevation、spacing、icons 页重复（截图验证前四页）。

### 重点组件（overview 加 specs）

- 按钮：两个变体（default、toggle），可选前置图标，五个颜色选项（elevated、filled、tonal、outlined、text），五个尺寸（XS、S、M、L、XL）；dp 参考 16/24/36/40；specs 页含编号状态矩阵（Enabled、Disabled、Hovered、Focused、Pressed，截图验证）、Tokens & specs、Anatomy、Color、Shape morph 与 Baseline tokens 分区；演示为支付卡片中的 Make payment 紫色 pill 按钮。
- 卡片：三个变体（elevated、filled、outlined）；specs 页按 Elevated card、Filled card、Outlined card 分节，各含颜色与状态子节；用于聚合相关元素，内容可含图片、标题、正文、按钮与列表。
- App bars：四个变体（Search app bar、small、medium flexible、large flexible）；dp 参考 112/24；职责为页面导航与 1-2 个 essential 动作，可用 toolbar 展示页面动作；specs 页含 Variants、Configurations、Tokens & specs、Anatomy 与 Color 分区。
- Button groups：两个变体（standard、connected）；按压与选中时应用 shape morph，相邻按钮联动；替代 segmented button；dp 参考 32/18/48/2；演示为视频通话图标按钮组。

### Available foundations

已验证可引用的公开资源：Google Sans 与 Google Sans Text Web 字体（全站实测在用，475 中间字重）、Google Symbols 图标字体（24px 连字）、Material Symbols 与 Figma 插件（icons 规范页标题证据）。观察到的公开类名与结构名（仅作证据定位，不是官方组件 API）：nav-rail-content、section-link section-menu、section-fab、split-asset、block、is-card-row、snug、mio-card-set、mio-card、feature-block、thumbnail、overline、tab、display-group-item、mio-button、mio-toggle-switch、mat-mdc-menu-trigger、active-token-set-button、page-content。实现时应复用宿主项目现有组件与 token 落地上述规则，不编造 CSS URL 或库。

### Signature elements

1. 规范页分屏 Hero 与品牌图形（截图验证 color/typography/shape/motion 四页双主题）：左侧 96px 双行大标题加一句导语，右侧大幅有机品牌插画（绿黄蓝紫，双主题不反转），之下通栏胶囊分段导航。文字适配：左文右图对半，图形用高饱和品牌插画而非产品截图；主题镜像只作用于表面与文字。
2. 左侧图标导航栏（截图验证全站双主题）：88px 窄栏、图标加竖排标签、当前项淡色 pill、底部暂停与暗色双开关；搜索入口为浅粉/暗紫圆形底。文字适配：固定窄栏加线性图标加双开关，不做顶栏横排。

## Do's and Don'ts

1. Do：所有颜色 token 成对定义浅色与暗色（表面 #f8f1f6/#1c1b1d、文字 #1c1b1d/#4d4256 对 #e6e1e3/#cbc4cc、链接 #6442d6/#9f86ff）。Don't：只写浅色值或临时反色。验收：任一表面色在双主题下都有对应值，切换后无未定义落色。
2. Do：排版只用 Google Sans 与 Google Sans Text 两族，层级走 96/57/28/24 与 16/14 实测档位，展示字重 475。Don't：引入第三家或自造 18px、20px 正文。验收：全页字体家族不超过 2 个，正文 16px/24px。
3. Do：#6442d6（暗 #9f86ff）只用于链接与唯一主 CTA；主 CTA 48px 全圆角、左右 48px 内边距、24px/32px 白字（暗色为 #9f86ff 底加 #1a0056 字）。Don't：把紫色铺成大区块背景或给多个按钮同时上实心紫。验收：每屏实心强调件不超过 1 个。
4. Do：圆角按尺寸档位选择（小件 4px、卡片 24px、chips 40px、圆形 50%、大按钮 48px、章节容器 0px）。Don't：全站统一圆角或给容器加圆角。验收：圆角取值来自 0/4/8/16/18/24/28/32/40/48/50% 实测档位。
5. Do：间距走 4px 基座刻度（8/16/24/48/64 与实测的 1/2/12px），组件尺寸参考官方 dp 值（如按钮 16/24/36/40dp、app bar 112dp）。Don't：使用刻度外随手值。验收：间距值为刻度成员，规格引用标注 dp 来源页。
6. Do：默认扁平，阴影仅用于浮动控件（pause 按钮的一级 elevation）；分组用表面色阶与文字色阶。Don't：给卡片加投影或描边制造层次。验收：卡片与面板 box-shadow 为 none。
7. Do：保留 Skip to main content、图标按钮 aria-label、四 tab 与 On this page 目录等信息架构。Don't：为视觉效果删减跳转或文档分区。验收：键盘首站为跳转链接，specs 页保留状态矩阵分区。

### Verification

观测事实（本次实测，1440x900，浅色经默认加载、暗色经 emulateMedia 并验证 body.dark-mode 与表面色反转）：上述色值、字号、圆角、阴影、间距、dp 参考与页面结构来自 28 页双主题的计算样式采样；17 张重点页截图已实际查看并用于模板与图形描述；调色板令牌色值、hover/focus/disabled 状态、移动端断点、动效运行效果未验证，不得声称已通过。实施建议（需实现后检查）：双主题 token 化完整性、阅读层级、键盘焦点可见性、文字对比度、窄屏重排。Agent 指令：实施前读取本文件；继承已验证的双主题色板、字体族与等级、圆角与间距档位；围绕新读者任务组织内容，不照搬原站章节；复用宿主项目现有组件与 token，不引入未验证资源；报告未验证假设；重复任务用相同内容、模型与视口对比有规范与无规范的结果，记录修正，把反复出现且可测的问题转成规则或确定性检查，不编造提升百分比。

### Implementation checks
- Preserve the observed font families and palette, including common fonts or gradients when they belong to the source. Do not substitute a new aesthetic.
- Preserve supplied facts and units. Give each section a reader task; adapt composition without losing the documented style relationships.
- Verify keyboard focus, text contrast, meaningful source order and narrow-screen reflow. Treat these as implementation requirements, not claims that the source was tested.
- Load only needed assets, preserve their aspect ratios, and respect reduced-motion preferences when adding observed motion.
- For repeat work, save the content, model, viewport and first render. Compare with/without this file under matching conditions; turn recurring corrections into scoped prose rules, shared CSS or deterministic checks.

### Token evidence
- colors.primary: {"selector": "p", "role": "sampled foreground; not necessarily brand accent"}
- colors.surface: {"selector": "body.ng-tns-0-1", "role": "body background; may be transparent"}
- typography.h1: {"selector": "h1", "role": "sampled h1"}
- typography.h2: {"selector": "h2", "role": "sampled h2"}
- typography.h3: {"selector": "h3", "role": "sampled h3"}
- typography.body: {"selector": "p", "role": "sampled p"}
- components.sample-button: {"selector": "a.section-link.section-menu.ng-star-inserted", "role": "observed default state; variants unverified"}
- components.sample-link: {"selector": "a", "role": "observed default state; variants unverified"}

## Evidence Appendix

Sampling summary only. Heuristic roles and flattened color summaries below are not normative tokens; retain the exact values and alpha in the frontmatter. This snapshot does not establish unobserved states, themes or viewport behavior.

### 工程 CSS 证据

由实时 DOM computed styles 压缩生成。这里只保留高频 token 与设计意图，不输出原始 CSS 清单。

#### 压缩设计 Token

**Mode:** light

##### 色彩角色
- **color.text.primary:** #1c1b1d (104)
- **color.text.secondary:** #1c1b1d (77)
- **color.surface.base:** #f8f1f6 (7)
- **color.accent:** #6442d6 (56)
- **color.border.default:** #1c1b1d (91)
- **color.focus.ring:** #1c1b1d (104)

##### 字体角色
- **font.family.primary:** Google Sans Text (192)
- **font.family.secondary:** Google Sans (9)
- **font.size.display:** 96px (9)
- **font.size.body:** 16px (100)
- **font.size.label:** 13.33px (1)
- **ratio:** display is 6.0x body

##### 间距节奏
- **base unit:** 4px
- **space.1:** 16px (222)
- **space.2:** 1px (140)
- **space.3:** 24px (58)
- **space.4:** 2px (40)
- **space.5:** 4px (26)

##### 圆角角色
- **radius.sharp:** 4px (37)
- **radius.medium:** 16px (1)
- **radius.pill:** 18px (2)

##### 阴影意图
- **level:** rare accent
- **usage:** 1
- **note:** single recurring elevation treatment

##### 动效意图
- **level:** moderate
- **range:** 200-300ms
- **common durations:** 300ms (5), 200ms (1)
- **easing style:** cubic-bezier(0.2, 0, 0, 1) (3), cubic-bezier(0.2, 0, 0, 1), cubic-bezier(0.2, 0, 0, 1) (2), linear (1)

#### 差异化实现信号

- Frequent pill radius (18px) creates a soft/capsule interaction language.
- Motion is moderate, centered around 200-300ms.
- Type hierarchy is ratio-driven: display is 6.0x body.

#### 采集诊断

- 从 784 个 DOM 元素中采样了 216 个可见元素。
- 置信度: high.
- No extraction warnings.