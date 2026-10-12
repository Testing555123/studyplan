import type { ComponentType, SVGProps } from "react"
import {
  ArrowDown,
  ChevronDown,
  X,
  CircleCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  ChevronUp,
  Menu,
  MoreHorizontal,
  Loader2,
  Minus,
  Search,
  TriangleAlert,
} from "lucide-react"

/*
 * M3E 组件内部使用的图标，统一改为 lucide-react（SPEC §9.4：图标一律 lucide-react，
 * 替代 Google Symbols / Iconify Material Symbols）。组件以 <IconName className=.../>
 * 形式使用，lucide 图标接受 className / size 等 props。
 */
type SymbolProps = SVGProps<SVGSVGElement> & { size?: number | string }

function symbol(Icon: ComponentType<SymbolProps>) {
  const Component = (props: SymbolProps) => (
    <Icon aria-hidden data-slot="icon" {...props} />
  )
  Component.displayName =
    (Icon as { displayName?: string }).displayName ??
    (Icon as { name?: string }).name
  return Component
}

export const ArrowDownwardIcon = symbol(ArrowDown)
export const ArrowDropDownIcon = symbol(ChevronDown)
export const CancelIcon = symbol(X)
export const CheckCircleIcon = symbol(CircleCheck)
export const CheckIcon = symbol(Check)
export const ChevronLeftIcon = symbol(ChevronLeft)
export const ChevronRightIcon = symbol(ChevronRight)
export const CloseIcon = symbol(X)
export const InfoIcon = symbol(Info)
export const KeyboardArrowDownIcon = symbol(ChevronDown)
export const KeyboardArrowUpIcon = symbol(ChevronUp)
export const MenuIcon = symbol(Menu)
export const MoreHorizIcon = symbol(MoreHorizontal)
export const ProgressActivityIcon = symbol(Loader2)
export const RemoveIcon = symbol(Minus)
export const SearchIcon = symbol(Search)
export const WarningIcon = symbol(TriangleAlert)
