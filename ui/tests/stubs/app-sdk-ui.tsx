/**
 * A light stand-in for the host's `@kirocrew/app-sdk/ui`: plain elements with
 * the roles and labels the host components render, so a test can find them the
 * way a user would.
 */

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

export const Btn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; primary?: boolean }
>(function Btn({ danger: _danger, primary: _primary, ...rest }, ref) {
  return <button ref={ref} {...rest} />
})

export function Skeleton({ className }: { className?: string }) {
  return <div data-testid="skeleton" className={className} />
}

export function EmptyState({ title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div>{title}</div>
      {subtitle ? <div>{subtitle}</div> : null}
    </div>
  )
}

type ClickableProps = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'onClick'> & {
  onClick: (e?: React.MouseEvent | React.KeyboardEvent) => void
  disabled?: boolean
}

/** The host's accessible clickable div: role=button, Enter/Space on itself only. */
export const Clickable = forwardRef<HTMLDivElement, ClickableProps>(function Clickable(
  { onClick, disabled, onKeyDown, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.target !== e.currentTarget || disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e)
        }
      }}
      {...rest}
    >
      {children}
    </div>
  )
})

export function MarkdownRenderer({ content }: { content: string }) {
  return <pre data-testid="md-renderer">{content}</pre>
}

export function ErrorNotice({
  message,
  title,
  onDismiss,
  footer,
  testId,
}: {
  message?: string | null
  title?: string
  variant?: 'block' | 'inline'
  messagePlacement?: 'beside' | 'below'
  onDismiss?: () => void
  footer?: ReactNode
  className?: string
  testId?: string
  askAgent?: boolean
}) {
  if (!message && !title) return null
  return (
    <div role="alert" data-testid={testId}>
      {title ? <strong>{title}</strong> : null}
      {message ? <span>{message}</span> : null}
      {onDismiss ? (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
      {footer}
    </div>
  )
}
