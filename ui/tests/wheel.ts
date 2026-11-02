import { expect } from 'vitest'

/**
 * A vertical wheel over a horizontally clipped row scrolls it sideways, and only
 * while it is clipped: at the end, or when everything fits, the event passes on
 * to the page. Ported from Kiro Crew's shared test helper.
 */
export function expectWheelToScrollRow(row: HTMLElement): void {
  let left = 0
  const stub = (scrollWidth: number) => {
    Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => 100 })
    Object.defineProperty(row, 'scrollWidth', { configurable: true, get: () => scrollWidth })
    Object.defineProperty(row, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v } })
  }
  const wheel = () => {
    const e = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true })
    row.dispatchEvent(e)
    return e
  }
  stub(400)
  const clipped = wheel()
  expect(left).toBe(40)
  expect(clipped.defaultPrevented).toBe(true)
  left = 300
  const atEnd = wheel()
  expect(left).toBe(300)
  expect(atEnd.defaultPrevented).toBe(false)
  stub(100)
  left = 0
  const fits = wheel()
  expect(left).toBe(0)
  expect(fits.defaultPrevented).toBe(false)
}
