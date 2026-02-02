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

    // 1. Try native .click() first - some environments prefer this if listeners are native
    try {
      element.click();
      // 약간 대기하여 네이티브 클릭이 처리될 시간을 줌
      await new Promise(r => setTimeout(r, 50));
    } catch (e) {}

    // 2. React Hack (Enhanced Event Object)
    const props = getReactProps(element)
    if (props && typeof props.onClick === 'function') {
      console.log('[DOMUtils] React onClick found. Triggering with full synthetic event...');
      try {
        const mouseEvent = new MouseEvent('click', { 
          bubbles: true, 
          cancelable: true, 
          view: window,
          buttons: 1
        });
        
        // React 17+ Synthetic Event Simulation
        const syntheticEvent = {
          nativeEvent: mouseEvent,
          currentTarget: element,
          target: element,
          type: 'click',
          bubbles: true,
          cancelable: true,
          timeStamp: Date.now(),
          defaultPrevented: false,
          isTrusted: true,
          preventDefault: () => { (syntheticEvent as any).defaultPrevented = true; },
          stopPropagation: () => {},
          persist: () => {},
          isPropagationStopped: () => false,
          isDefaultPrevented: () => (syntheticEvent as any).defaultPrevented
        };
        
        props.onClick(syntheticEvent)
        await new Promise(r => setTimeout(r, 150));
      } catch (e) {
        console.warn('[DOMUtils] React onClick execution error:', e)
      }
    }

    // 3. Dispatch full mouse event sequence to the element and its first child
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    const eventConfig = {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      buttons: 1
    };

    const targetNodes = [element];
    if (element.firstElementChild) targetNodes.push(element.firstElementChild as HTMLElement);

    for (const node of targetNodes) {
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        node.dispatchEvent(new MouseEvent(type, eventConfig));
      });
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
