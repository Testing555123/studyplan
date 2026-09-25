/**
 * Nuxt UI 的运行时外观配置，负责两件事：
 *
 * 1. 色板别名：把组件库里 `primary` / `neutral` 的引用，
 *    映射到本项目 `@theme` 里定义的色板名。
 * 2. 表面层级：把组件库**内部**默认的背景令牌重新指派到正确的层级。
 *
 * ⚠️ 真正的**色值不在这里**，而在 `assets/css/main.css`：
 *    · 色阶 → `@theme` 的 `--color-brand-*` / `--color-ai-*`
 *    · 四层表面 → `@layer base` 的 `--ui-bg*`
 *    此处的职责是"把这些内部结构指到正确的层级"，不是再定义一次颜色。
 *
 * ⚠️ 下面所有组件键必须写在 `ui` 内部 ——
 *    写在顶层会被静默忽略（不报错、不生效，极难发现）。
 */
export default defineAppConfig({
  ui: {
    colors: {
      /**
       * 主色 → `brand` 色板（科技青蓝 #06b6d4）。
       *
       * 这里**曾经是 `indigo`**（Tailwind 内置色），那是个 bug：
       * 它让 Nuxt UI 组件用 Tailwind 的靛蓝，而手写样式用 @theme 的 brand 色，
       * 全站出现两套"品牌色"。指向 `brand` 之后二者才真正统一。
       */
      primary: 'brand',

      /**
       * 中性色 → stone（暖灰）。
       *
       * 原先用 slate（冷灰）；改为 stone 后页面背景、边框、次要文字
       * 都带上一点暖调，更接近"护眼舒适"的暖灰中性，也和 indigo 主色更搭。
       *
       * 注意：背景 / 边框 / 文字的主力取值已在 main.css 里显式写成冷调中性，
       * 这个色板现在主要影响未被覆写的边角（如部分渐变与 inverted 层）。
       */
      neutral: 'stone',

      /**
       * AI 强调色 → `ai` 色板（紫罗兰 #8b5cf6，对应 v0 的 accent）。
       *
       * 注册后组件上就能用 `color="ai"`（如电子书按钮、AI 摘要图标），
       * 与青蓝主色形成冷暖对比。色值同样只定义在 main.css 的 `--color-ai-*`。
       */
      ai: 'ai',
    },

    /* ──────────────────────────────────────────────────────────
       表面层级：把 Nuxt UI 内部的「承载面」重新指派到正确的层级
       ──────────────────────────────────────────────────────────

       为什么必须改这里（而不是逐个组件去写 class）：
         main.css 把画布下沉成冷调灰之后，`bg-default` 就成了 L0 画布色。
         但 Nuxt UI 有**一批组件内部默认就是 bg-default** —— 它们在设计上
         属于「抬起的内容面」，跟着变灰会直接沉进背景；反过来，
         一批依赖 bg-elevated（原 neutral-100 浅灰）的组件会变成纯白，
         在白卡上整块消失。

       两类 Bridging，规则各一条：
         · 内容面 / 浮层面        → bg-elevated（L1 白）
         · 需要"看得见是灰"的装饰面 → bg-muted（L2 凹槽灰）

       ⚠️ 这是"画布下沉"唯一逃不掉的后勤工作：改了全局背景令牌，
          就得把组件库内部的默认值一并重新指派，否则表现是
          "某个组件在某种状态下突然没了"，且极难定位。
       ────────────────────────────────────────────────────────── */

    /** UCard 默认 outline 变体：承载面必须是白，不能跟着变成画布灰 */
    card: {
      variants: { variant: { outline: { root: 'bg-elevated' } } },
    },

    /**
     * 浮层类：modal / popover / dropdown / slideover / tooltip / toast。
     * 它们都整块压在内容之上，属于**抬起**的面 —— 统一指到 L1 白。
     */
    modal: { slots: { content: 'bg-elevated' } },
    popover: { slots: { content: 'bg-elevated' } },
    dropdownMenu: { slots: { content: 'bg-elevated' } },
    slideover: { slots: { content: 'bg-elevated' } },
    tooltip: { slots: { content: 'bg-elevated' } },
    toast: { slots: { root: 'bg-elevated' } },

    /*
     * 以下三项原本靠 bg-elevated 的"浅灰"让自己可见，
     * 而 bg-elevated 现在是纯白 —— 不换会在白卡上彻底消失。
     */
    /** USkeleton：加载占位，全站用量最大的一处，必须保持可见的灰 */
    skeleton: { slots: { base: 'bg-muted' } },
    /** UAvatar（neutral）：头像圆盘底色 */
    avatar: { variants: { color: { neutral: { root: 'bg-muted' } } } },
    /** UTimeline 分隔线：白色卡片上的白色线条会看不见 */
    timeline: { slots: { separator: 'bg-muted' } },

    /*
     * UButton 的 neutral + outline 是 **compoundVariant**，不是 variants.variant，
     * 所以只能整条重写。
     *
     * ⚠️ 不改会反向：原本是「静止白 → hover 灰」，画布下沉后会变成
     *    「静止灰 → hover 白」，按下去反而变亮 —— 交互反馈方向整个反了。
     *    这里恢复原方向：静止停在白面，hover / active 走到 L3 交互灰。
     */
    button: {
      compoundVariants: [
        {
          color: 'neutral' as const,
          variant: 'outline' as const,
          class:
            'bg-elevated hover:bg-accented/75 active:bg-accented/75 disabled:bg-elevated aria-disabled:bg-elevated',
        },
      ],
    },
  },
})
