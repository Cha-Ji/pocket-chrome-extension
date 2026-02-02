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

    console.log('[DOMUtils] Starting Multi-Phase Click Sequence on:', element)

    // 1. PHASE ONE: React Direct Execution (Synthetic Event)
    const props = getReactProps(element)
    if (props && typeof props.onClick === 'function') {
      try {
        const syntheticEvent = {
          nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
          currentTarget: element,
          target: element,
          type: 'click',
          bubbles: true,
          cancelable: true,
          persist: () => {},
          preventDefault: () => {},
          stopPropagation: () => {},
          isPropagationStopped: () => false,
          isDefaultPrevented: () => false
        };
        props.onClick(syntheticEvent)
        console.log('[DOMUtils] Phase 1: React onClick triggered');
      } catch (e) {
        console.warn('[DOMUtils] Phase 1 Error:', e);
      }
    }

    // 2. PHASE TWO: Native Event Sequence (Bubbling)
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    
    const mouseConfig = {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      buttons: 1
    };

    ['mousedown', 'mouseup', 'click'].forEach(type => {
      element.dispatchEvent(new MouseEvent(type, mouseConfig));
    });
    console.log('[DOMUtils] Phase 2: Native sequence dispatched');

    // 3. PHASE THREE: Deep Child Dispatch
    // If we clicked the LI, the A or SPAN might need the event directly
    const deepTarget = element.querySelector('.alist__link, .alist__label') as HTMLElement;
    if (deepTarget && deepTarget !== element) {
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        deepTarget.dispatchEvent(new MouseEvent(type, mouseConfig));
      });
      console.log('[DOMUtils] Phase 3: Deep target sequence dispatched');
    }

    // 4. PHASE FOUR: Pointer Simulation
    ['pointerdown', 'pointerup'].forEach(type => {
      element.dispatchEvent(new PointerEvent(type, { ...mouseConfig, pointerId: 1, isPrimary: true }));
    });

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
