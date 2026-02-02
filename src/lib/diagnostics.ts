/**
 * Diagnostic tool to inspect event listeners and element properties
 */

export function diagnoseElement(element: HTMLElement) {
  if (!element) {
    console.error('[Diagnostics] Element not found')
    return
  }

  console.group(`[Diagnostics] Inspecting: ${element.className}`)
  
  // 1. Basic Info
  console.log('Tag:', element.tagName)
  console.log('Rect:', element.getBoundingClientRect())
  console.log('Visible:', element.offsetWidth > 0 && element.offsetHeight > 0)
  console.log('Pointer Events:', window.getComputedStyle(element).pointerEvents)

  // 2. React Props
  const reactKeys = Object.keys(element).filter(k => k.startsWith('__react'))
  console.log('React internal keys:', reactKeys)
  reactKeys.forEach(key => {
    console.log(`- ${key}:`, (element as any)[key])
  })

  // 3. Monitor Click Events
  const clickHandler = (e: MouseEvent) => {
    console.log(`[Diagnostics] 🔴 Native Click Event Captured!`, {
      target: e.target,
      currentTarget: e.currentTarget,
      isTrusted: e.isTrusted,
      bubbles: e.bubbles
    })
  }
  
  element.addEventListener('click', clickHandler, { capture: true })
  console.log('[Diagnostics] Click listener attached for monitoring.')

  console.groupEnd()

  return () => element.removeEventListener('click', clickHandler, { capture: true })
}

/**
 * Console snippet for manual trigger test
 */
export const DIAGNOSTIC_SNIPPET = `
(function() {
  const assetName = prompt('Enter asset name to test click:');
  const items = document.querySelectorAll('.alist__item');
  let target = null;
  for (const item of items) {
    if (item.textContent.includes(assetName)) {
      target = item;
      break;
    }
  }
  
  if (!target) {
    console.error('Asset not found');
    return;
  }
  
  console.log('Target found:', target);
  const reactKey = Object.keys(target).find(k => k.startsWith('__reactProps'));
  if (reactKey && target[reactKey].onClick) {
    console.log('Triggering React onClick...');
    target[reactKey].onClick({ nativeEvent: new MouseEvent('click'), preventDefault: () => {}, stopPropagation: () => {} });
  } else {
    console.log('No React onClick found, trying coordinate click...');
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    document.elementFromPoint(x, y).click();
  }
})();
`
