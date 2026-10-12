## Overview

原站是 Material Design 3（m3.material.io）首页，Google 开源设计系统的门户型落地页，Angular SPA，页面主体滚动发生在 div.page-content 容器内（clientHeight 900、scrollHeight 5988）。本次采集为桌面 1440x900 视口、浅色模式，并实际查看了顶部、35%、70% 三个滚动位置的共 3 张截图。受众与任务（推断）：为设计师和开发者提供进入 Get started、Develop、Foundations、Styles、Components 的入口，并集中发布 M3 Expressive 相关更新；读者以"发现更新、跳转子站"为主，阅读性长文不是本页重点。适用范围：单页落地页的视觉语言复用；局限：暗色模式开关存在于导航栏但暗色渲染未采集，移动端断点未测试，hover/focus/disabled 状态未采集。

可观察且可复用的设计决策：

1. 排版驱动识别：h1 为 96px/96px、字重 475 的 Google Sans，正文为 16px/24px 的 Google Sans Text，display 是 body 的 6.0 倍（证据：designTokens.typography 与 cssEvidence 的 font.size.display，usage 7）。理由（推断）：用极端字号对比建立设计系统的宣言感。规则：Hero 与章节标题用 Google Sans 475 字重，正文不超出 16px/24px，章节导语才允许 22px/30px。
2. 单一紫色强调色：实测强调色 #6442d6（color.accent，usage 49），唯一实心紫件是 Hero 主 CTA button.mio-button（224x80、白字、48px 圆角、无阴影）。规则：强调色只给主动作，每屏至多一个实心紫按钮，正文文字用 #1c1b1d 与 #4d4256。
3. 胶囊化交互语言：24px 圆角出现在 a.thumbnail 卡片与链接（radius.pill，usage 20），48px 用于大按钮，4px 用于导航小件（radius.sharp，usage 30）。规则：按组件尺寸选圆角档位，而不是全站一个值。
4. 近乎无阴影的扁平层级：整站阴影仅 1 例（pause 圆形按钮的一级 elevation），层级主要依靠 #f8f1f6 淡粉表面、文字色阶和深色对比块（证据：cssEvidence.shadow 为 rare accent，usage 1；三张截图中卡片均无投影）。规则：默认扁平，仅浮动控件使用一级 elevation。
5. 固定左侧图标导航 + 宽内容区：nav.nav-rail-content 宽 88px、高 582px，main#main_content 宽 1352px，卡片行宽 1264px，双列卡片 584px。规则：桌面端固定窄侧导航，内容最大宽度约 1264-1352px，左右留 88px 边距。

## Colors

语义角色与实测值（designTokens 为本次提取文档的确定值，不代表官方品牌规范）：

- 标题与主文字 #1c1b1d（rgb(28, 27, 29)）：h1、h2、卡片文字；body 默认文字为 #1f1f1f（rgb(31, 31, 31)）。
- 次级文字 #4d4256（rgb(77, 66, 86)）：卡片描述 p、h3 标题、导航项文字。注意 designTokens.colors.primary 采样自 p 元素，是前景文字色而非品牌强调色；边框与焦点环也用同值（color.border.default、color.focus.ring 均为 #4d4256）。
- 强调色 #6442d6：主 CTA 背景（button.mio-button 实测 rgb(100, 66, 214)、白字），以及页面点缀；截图中的紫色图形媒体同属该色系家族，但具体 HEX 未逐一测量。
- 表面色 #f8f1f6（rgb(248, 241, 246)）：a.thumbnail 卡片背景（color.surface.base，usage 20）。
- 页面底色：body 背景实测为透明 rgba(0, 0, 0, 0)（designTokens.colors.surface），截图呈极浅的暖白/淡粉，html 层背景值未直接测量。
- 点缀浅粉 #f1d3f9（rgb(241, 211, 249)）：pause 圆形按钮背景。
- 深色对比卡：70% 位置截图中的近黑卡片配紫粉渐变媒体，其深色来自图片/渐变，采样到的 backgroundColor 中没有深色值，具体色值未测量。
- 文字对比组合已观察到：#1c1b1d/#4d4256 文字置于 #f8f1f6 或近白表面，白字置于 #6442d6。

## Typography

双字体家族，分工明确：

- Google Sans（display 族）：h1 96px/96px 字重 475（552x192，两行）；h2 57px/64px 字重 475（章节标题，宽 1126）；主 CTA 24px/32px 字重 475。
- Google Sans Text（正文族）：正文与卡片描述 16px/24px 字重 400；h3 14px/20px 字重 500（卡片标题、页脚组标题）；导航项 16px/24px 字重 500；章节导语 22px/30px 字重 400。
- 其他实测样本：pause 图标按钮文字 13.33px/40px，家族回退为 Arial（图标按钮场景）。
- 层级关系：display 96px 是正文 16px 的 6.0 倍；字重 475 是可变字体的中间字重（观察值，非 400/500/700 常规档）。不为凑齐等级补造未测字号，移动端字号未观测。

## Layout

- 桌面结构：左侧固定图标导航栏 88px；main#main_content 自 left=88 起、宽 1352px；章节区块 div.block.is-card-row 宽 1264px；feature 卡片 a.thumbnail 宽 1176px（left 176）；常规双列卡片 584px；页脚 footer 宽 1280px（left 124）。
- 间距体系：4px 基座（cssEvidence.spacing.baseUnit），实测刻度 1/2/4/8/14/16/20/24/40/48/64px；designTokens.spacing 样本含 0/16/8/24/64/1/2/4/14/48/40/20。章节之间 48-64px 量级，卡片内部 24px 量级，导航项尺寸 80x60。
- 分组规则：一个 H2 章节标题带一组卡片行；卡片行 2 列（部分 feature 行单列通栏 1176px）；每行 2-3 张卡，卡片即整块链接。
- 滚动行为：原站滚动容器是 div.page-content 而非窗口（SPA 行为），复用时不一定要照搬，但要注意导航栏在截图三态中始终固定可见。
- 响应式：仅采集 1440x900 桌面视口，移动端断点与重排行为未观测；建议实现时先重排（双列改单列、侧导航改顶栏）再缩字，长内容区可局部滚动而非整体压缩。

## Elevation & Depth

阴影在原站几乎不用：cssEvidence.shadow 为 rare accent、usage 1，唯一实测阴影是 pause 圆形按钮的 rgba(0, 0, 0, 0.3) 0px 1px 2px 0px 叠加 rgba(0, 0, 0, 0.15) 0px 1px 3px 1px（一级 elevation 量级），主 CTA 与卡片的 box-shadow 均为 none。层级实际由三种手段建立：表面色阶（#f8f1f6 卡片相对于近白页面）、文字色阶（#1c1b1d 主文字与 #4d4256 次级文字）、以及深色对比块（70% 截图中的近黑渐变卡与浅色页面形成反转）。复用规则：默认完全扁平；仅对浮动控件（播放、暂停、悬浮操作）使用一级 elevation；不要用投影或描边给卡片"制造层次"，那会制造噪声并偏离原站语言。

## Shapes

- 圆角档位（实测 usage）：4px sharp（30 次，导航项、小控件）、24px pill（20 次，a.thumbnail 卡片与链接）、16px medium（1 次）、0px（章节区块容器 div.block）；大件另有 48px（button.mio-button 主 CTA）与 designTokens 样本中的 32px/48px。规则：圆角随组件尺寸放大，小件 4px、卡片 24px、大按钮 48px，不统一取值。
- 图标：使用 Material Symbols 图标字体，DOM 中以连字文本出现（material_design、play_arrow、dark_mode、search、add_circle 等），导航项为图标加竖排标签（80x60）。
- 媒体处理：卡片媒体为顶部通栏图像或渐变图形（shot2 的紫色插画卡、shot3 的近黑渐变卡），圆角由卡片容器 24px 裁切；feature 卡为 1176px 通栏。
- 圆形件：pause 按钮 50% 圆角、40x40。

## Components

### 导航栏（左侧图标导航）

用途：全局站点导航。组成：顶部 search 入口（指向 /search.html）、7 个图标加标签项（Home、Get started、Develop、Foundations、Styles、Components、Blog）、底部两个 mio-toggle-switch（视频播放/暂停、暗色模式）。实测默认态 a.section-link.section-menu：透明背景、#4d4256 文字、4px 圆角、16px/24px 字重 500、尺寸 80x60；当前项 Home 在截图中带淡色底 pill 高亮。hover/focus 态未采集。复用规则：图标配竖排标签、当前项淡色高亮；不要把导航项做成实心按钮。误用：给每个导航项加投影或边框。

### 主 CTA 按钮

button.mio-button "Get started"：背景 #6442d6、白字、48px 圆角、左右内边距 48px、文字 24px/32px 字重 475 Google Sans、尺寸 224x80、无阴影。这是全页唯一实心强调按钮（推断：刻意保持单一主动作）。复用规则：每屏至多一个，用于首要转化路径。误用：用于次要操作；缩放到小尺寸（48px 圆角在小按钮上会退化为形状异常）；改配色（强调色只有 #6442d6 一个）。

### 内容卡片

a.thumbnail 位于 mio-card-set 卡片行内：媒体区加可选日期行、H3 标题（14px/20px 字重 500）、描述 p（16px/24px 字重 400、#4d4256）；实测背景 #f8f1f6、24px 圆角、无阴影、文字 #1c1b1d；双列 584x450、feature 通栏 1176x298。整卡是一个 a 链接，标题旁带 link 图标按钮（Copy link）。复用规则：卡片即链接，列表用 2 列网格，一卡一事。误用：在卡片内叠放多个主动作；把卡片做成带投影的浮动面板。

### 章节区块

div.block 与 div.block.is-card-row（role=region）：一个 H2（57px/64px）加一组卡片行，容器透明、宽 1264、无圆角无阴影；部分区块带 snug 修饰类。复用规则：章节等于一个标题加一组同类卡片，标题旁可放 Copy link 锚点按钮。

### 其他已观察组件

- 复制链接按钮：div 承载的 link 图标按钮，出现在区块标题旁，点击后显示 Copy link/Link copied 文案（DOM 证据）。
- 切换开关：mio-toggle-switch（role=switch），用于视频暂停与暗色模式。
- 搜索与跳转：search 链接（/search.html）；body 首个链接为 Skip to main content（/#main_content），具备基本键盘可达性结构。
- 页脚：footer 宽 1280，含 about 段落、4 组 H3 链接列（Social、Libraries、More Google sites、Archived versions）与 legal 行（Privacy Policy 等）。

### Available foundations

已验证可引用的公开资源：Google Sans 与 Google Sans Text Web 字体（页面实测在用，h1/h2/CTA 与正文分别命中）；Material Symbols 图标字体（连字名在 DOM 中可观察）。观察到的公开类名与结构名（仅作证据定位，不是官方组件 API）：nav-rail-content、section-link section-menu、split-asset、block、is-card-row、snug、mio-card-set、mio-card、feature-block、thumbnail、mio-button、mio-toggle-switch。实现时应复用宿主项目现有组件与 token 来落地上述规则，不编造 CSS URL 或库。

### Signature elements

1. 左侧图标导航栏（nav.nav-rail-content，88px 宽，三张截图均固定可见）：辨识度来自图标加竖排标签的密排结构，以及底部暂停/暗色双开关。文字适配：固定窄栏、线性图标、当前项淡色 pill 底、无分割线。
2. 分屏 Hero（header.split-asset，顶部截图）：左侧 96px 双行大标题加 22px 导语加紫色 48px 圆角 CTA，右侧多台设备界面拼贴媒体。文字适配：左文右媒对半分工，媒体用真实产品界面截图拼贴而非装饰插画。

## Do's and Don'ts

1. Do：只用 Google Sans 与 Google Sans Text 两族，沿用实测等级（display 96/57、CTA 24、导语 22、正文 16、标签 14）。Don't：引入第三种字体或把正文做到 20px 以上。验收：全页字体家族不超过 2 个，正文为 16px/24px。
2. Do：#6442d6 只用于主 CTA 与强调点缀，文字用 #1c1b1d/#4d4256。Don't：把紫色铺成大区块背景或当作正文色。验收：每屏实心紫区域不超过 1 处。
3. Do：卡片用 #f8f1f6 表面加 24px 圆角、无阴影，层级靠色阶。Don't：给卡片加投影或描边制造层次。验收：卡片 box-shadow 为 none，背景为表面色或透明。
4. Do：圆角按尺寸档位选择（小件 4px、卡片与链接 24px、大按钮 48px、区块 0px）。Don't：全站统一同一圆角。验收：圆角取值来自 0/4/16/24/48 档位。
5. Do：间距走 4px 基座刻度（8/16/24/48/64 等实测值）。Don'：使用刻度外的随手值（14px 仅为原站既有特例）。验收：间距值均为刻度成员。
6. Do：保留 Skip to main content 跳转链接与图标按钮的 aria-label。Don't：为视觉效果移除跳转结构。验收：键盘 Tab 首站为跳转链接，图标按钮均有可读名称。

### Verification

观测事实（本次实测，1440x900 浅色模式）：上述色值、字号、圆角、阴影、间距与组件结构均来自计算样式采样与 3 张截图；暗色模式渲染、移动端断点、hover/focus/disabled 状态未采集；动效仅有 CSS 声明（200-300ms，cubic-bezier(0.2, 0, 0, 1)），未观测实际运行效果，不得声称已验证。实施建议（需实现后检查）：token 化使用情况、阅读层级是否被新内容破坏、键盘焦点可见性、文字对比度、窄屏重排。Agent 指令：实施前读取本文件；继承已验证风格（字体、色值、圆角档位、间距刻度）；围绕新读者任务组织内容，不照搬原站章节；复用宿主项目现有组件与 token，不引入未验证资源；报告未验证假设；重复任务用相同内容、模型与视口对比有规范与无规范的结果，记录修正，把反复出现且可测的问题转成规则或确定性检查，不编造提升百分比。
