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
  let props = key ? (element as any)[key] : null

  // If no props on element, check immediate children (common in nested React components)
  if (!props || !props.onClick) {
    const linkChild = element.querySelector('a, .alist__link') as HTMLElement
    if (linkChild) {
      const childKey = Object.keys(linkChild).find(k => 
        k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
      )
      if (childKey) props = (linkChild as any)[childKey]
    }
  }

  return props
}

/**
 * Force a click on an element using React internal handlers or coordinate-based dispatching
 */
export async function forceClick(element: HTMLElement): Promise<boolean> {
  if (!element) return false

  console.log('[DOMUtils] Attempting brute force click on:', element)

  // 1. React Hack (Enhanced Event Object)
  const props = getReactProps(element)
  if (props && typeof props.onClick === 'function') {
    console.log('[DOMUtils] React onClick found. Triggering with enhanced event...');
    try {
      const mouseEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      props.onClick({
        nativeEvent: mouseEvent,
        currentTarget: element,
        target: element,
        type: 'click',
        bubbles: true,
        cancelable: true,
        preventDefault: () => {},
        stopPropagation: () => {},
        persist: () => {},
        isPropagationStopped: () => false,
        isDefaultPrevented: () => false
      })
      // React 핸들러 호출 후 상태 반영을 위해 약간 대기
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.warn('[DOMUtils] React onClick error:', e)
    }
  }

  // 2. Human-like Event Sequence
  const rect = element.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2

  const events = ['mousedown', 'mouseup', 'click']
  for (const type of events) {
    element.dispatchEvent(new MouseEvent(type, {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      buttons: 1
    }))
  }

  // 3. Coordinate-based click on the actual point
  const elAtPoint = document.elementFromPoint(x, y) as HTMLElement
  if (elAtPoint && elAtPoint !== element) {
    elAtPoint.click()
  }

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
