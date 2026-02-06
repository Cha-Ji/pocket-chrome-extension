export async function forceClick(element: HTMLElement): Promise<boolean> {
  if (!element) return false
  const tag = element.tagName;
  const cls = element.className;
  const text = element.textContent?.trim().substring(0, 30);
  console.log(`[PO] [DOM] Requesting Remote Click on: <${tag} class="${cls}"> "${text}"`);
  const selector = `.${cls.split(' ').join('.')}`;
  window.postMessage({ source: 'pq-isolated', type: 'remote-click', payload: { selector: selector, text: text } }, '*');
  try { element.focus(); element.click(); } catch (e) {}
  return true;
}
export function getReactProps(element: HTMLElement): any { return null; }
