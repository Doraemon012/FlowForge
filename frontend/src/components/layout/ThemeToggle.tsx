import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/theme-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ThemeOption {
  value: Theme
  label: string
  hint: string
  icon: LucideIcon
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light', hint: 'Always light', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Always dark', icon: Moon },
  { value: 'system', label: 'System', hint: 'Match this device', icon: Monitor },
]

interface ThemeToggleProps {
  /** `icon` renders a bare icon button (app chrome); `menu` adds a label. */
  variant?: 'icon' | 'menu'
  className?: string
}

/**
 * The single theme switch, shared by the marketing nav, the docs chrome, and
 * the authenticated app shell so the control is identical everywhere. The
 * choice persists through `themeStore` (localStorage) and light is the default
 * for a visitor who has never chosen.
 */
export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const current = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'menu' ? (
          <Button variant="outline" size="sm" className={className}>
            <CurrentIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {current.label}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={`Theme: ${current.label}. Change theme`}
            title={`Theme: ${current.label}`}
          >
            <CurrentIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((option) => {
          const OptionIcon = option.icon
          const selected = option.value === theme
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              aria-checked={selected}
              role="menuitemradio"
            >
              <OptionIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              <span className="grow">{option.label}</span>
              <Check
                className={cn('h-4 w-4', selected ? 'opacity-100' : 'opacity-0')}
                aria-hidden="true"
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
