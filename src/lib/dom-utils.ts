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

  const tag = element.tagName;
  const cls = element.className;
  console.log(`[DOMUtils] 🎯 Starting Multi-Phase Click on: <${tag} class="${cls}">`);

  // Phase 1: React Hack (Standard & Parent check)
  let props = getReactProps(element);
  
  // If target has no onClick, try parent (e.g., LI might hold the handler for the whole row)
  if (!props?.onClick && element.parentElement) {
       const parentProps = getReactProps(element.parentElement);
       if (parentProps?.onClick) {
         props = parentProps;
         console.log('[DOMUtils] Using React handler from parent element');
       }
  }

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
      console.log('[DOMUtils] ✅ Phase 1 (React) Success');
    } catch (e) {
      console.warn('[DOMUtils] ❌ Phase 1 Error:', e);
    }
  } else {
    console.log('[DOMUtils] ℹ️ Phase 1 Skipped: No React handler found');
  }

  // Phase 2: Native Sequence with Focus
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const mouseConfig = { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 1 };

  try {
    element.focus();
    ['mousedown', 'mouseup', 'click'].forEach(type => element.dispatchEvent(new MouseEvent(type, mouseConfig)));
    console.log('[DOMUtils] ✅ Phase 2 (Native) Success');
  } catch (e) {
    console.warn('[DOMUtils] ❌ Phase 2 Error:', e);
  }

  // Phase 3: Deep Dispatch
  const deepTarget = element.querySelector('.alist__link, .alist__label, span, a') as HTMLElement;
  if (deepTarget && deepTarget !== element) {
    try {
      ['mousedown', 'mouseup', 'click'].forEach(type => deepTarget.dispatchEvent(new MouseEvent(type, mouseConfig)));
      console.log(`[DOMUtils] ✅ Phase 3 (Deep: <${deepTarget.tagName}>) Success`);
    } catch (e) {}
  }

  // Phase 4: Pointer & Native Click
  try {
    element.dispatchEvent(new PointerEvent('pointerdown', { ...mouseConfig, pointerId: 1, isPrimary: true }));
    element.dispatchEvent(new PointerEvent('pointerup', { ...mouseConfig, pointerId: 1, isPrimary: true }));
    element.click();
    console.log('[DOMUtils] ✅ Phase 4 (Pointer/Native) Success');
  } catch (e) {}

  return true;
}
