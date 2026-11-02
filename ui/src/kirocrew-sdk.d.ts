/**
 * Types for the two host modules this bundle imports. They are not on npm: the
 * dashboard's import map serves them at runtime (`/vendor/*.mjs`), so only the
 * names this page uses are declared, with the shapes the App Kit documents.
 *
 * Every name below exists on a host before App Kit level 1, so each is a plain
 * named import; `tests/test_manifest_contract.py` checks the built bundle for
 * that.
 */

declare module '@kirocrew/app-sdk' {
  export interface AppApi {
    request<T = unknown>(path: string, init?: RequestInit): Promise<T>
    get<T = unknown>(path: string, init?: RequestInit): Promise<T>
  }

  /** A scoped non-2xx: `body` is the raw response text. */
  export interface AppApiError extends Error {
    readonly status: number
    readonly body: string
  }

  export interface ChatLaunchOptions {
    agent?: string
    message?: string
    slotKey?: string
    autoSend?: boolean
  }

  type KeyEvent = import('react').KeyboardEvent
  type Handlers<T extends HTMLElement> = Pick<
    import('react').InputHTMLAttributes<T>,
    'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd' | 'onFocus' | 'onBlur'
  >

  export interface ImeGuard {
    /** True when this Enter is the user's (not an IME commit); consumes it. */
    claimEnter(e: KeyEvent): boolean
    /** Same, for a choose-class key (Tab); leaves its default to the caller. */
    claimKey(e: KeyEvent): boolean
    bindComposition<T extends HTMLElement = HTMLInputElement>(opts?: {
      onFocus?: () => void
      onBlur?: () => void
    }): Omit<Handlers<T>, 'onKeyDown'>
    bindEnter<T extends HTMLElement = HTMLInputElement>(opts: {
      onEnter?: () => void
      onEscape?: () => void
      onFocus?: () => void
      onBlur?: () => void
    }): Handlers<T>
  }

  export type NumberOptions = Omit<Intl.NumberFormatOptions, 'localeMatcher'>

  export function useAppApi(): AppApi
  export function useNavigate(): (path: string) => void
  export function useChatLauncher(): { openChat: (opts?: ChatLaunchOptions) => void }
  export function useImeGuard(): ImeGuard
  export function useLanguageGeneration(): number
  export function activeLocale(): string
  export function fmtNumber(value: number, options?: NumberOptions): string
}

declare module '@kirocrew/app-sdk/ui' {
  import type {
    ButtonHTMLAttributes,
    ComponentType,
    ForwardRefExoticComponent,
    HTMLAttributes,
    MouseEvent,
    KeyboardEvent,
    ReactNode,
    RefAttributes,
  } from 'react'

  export const Btn: ForwardRefExoticComponent<
    ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; primary?: boolean } & RefAttributes<HTMLButtonElement>
  >
  export const Skeleton: ComponentType<{ className?: string }>
  export const EmptyState: ComponentType<{
    icon: ReactNode
    title: string
    subtitle?: string
    action?: ReactNode
  }>
  export const Clickable: ForwardRefExoticComponent<
    Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'onClick'> & {
      onClick: (e?: MouseEvent | KeyboardEvent) => void
      disabled?: boolean
    } & RefAttributes<HTMLDivElement>
  >
  export const MarkdownRenderer: ComponentType<{ content: string }>
  export const ErrorNotice: ComponentType<{
    message?: string | null
    title?: string
    variant?: 'block' | 'inline'
    messagePlacement?: 'beside' | 'below'
    onDismiss?: () => void
    footer?: ReactNode
    className?: string
    testId?: string
    /** Offer the "ask the agent" hand-off (only where no typed text is unsaved). */
    askAgent?: boolean
  }>
}
