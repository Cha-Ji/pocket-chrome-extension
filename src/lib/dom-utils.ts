/**
 * Advanced DOM interaction utilities for bypassing SPA event handling
 */

/**
 * Find internal React props for a DOM element
 */
export function getReactProps(element: HTMLElement): any {
  const key = Object.keys(element).find(k => 
    k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
  )
  return key ? (element as any)[key] : null
}

/**
 * Force a click on an element using React internal handlers or coordinate-based dispatching
 */
export async function forceClick(element: HTMLElement): Promise<boolean> {
  if (!element) return false

  console.log('[DOMUtils] Attempting force click on:', element)

  // 1. Try React Hack
  const props = getReactProps(element)
  if (props && typeof props.onClick === 'function') {
    console.log('[DOMUtils] React onClick handler found, calling directly...')
    try {
      props.onClick({
        nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true }),
        currentTarget: element,
        target: element,
        preventDefault: () => {},
        stopPropagation: () => {}
      })
      return true
    } catch (e) {
      console.warn('[DOMUtils] Failed to call React onClick directly:', e)
    }
  }

  // 2. Try coordinate-based click (Simulation)
  const rect = element.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    
    console.log(`[DOMUtils] Attempting coordinate click at (${x}, ${y})...`)
    
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y
    })
    
    // Dispatch to both the target and whatever is at that point
    element.dispatchEvent(clickEvent)
    
    const elementAtPoint = document.elementFromPoint(x, y)
    if (elementAtPoint && elementAtPoint !== element) {
      elementAtPoint.dispatchEvent(clickEvent)
    }
    
    return true
  }

  // 3. Last resort: Standard click
  element.click()
  return true
}

/**
 * Simulation of human-like interaction sequence: Focus -> MouseDown -> MouseUp -> Click
 */
export async function simulateHumanClick(element: HTMLElement): Promise<void> {
  const rect = element.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2

  const events = ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click']
  
  for (const type of events) {
    element.dispatchEvent(new MouseEvent(type, {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    }))
    await new Promise(r => setTimeout(r, 50))
  }
}
