export async function forceClick(element: HTMLElement): Promise<boolean> {
  if (!element) return false;
  const tag = element.tagName;
  const cls = element.className;
  const text = element.textContent?.trim().substring(0, 30);
  console.log(`[PO] [DOM] Requesting Remote Click on: <${tag} class="${cls}"> "${text}"`);
  const selector = `.${cls.split(' ').join('.')}`;
  // [#47] targetOrigin을 명시하여 같은 origin에서만 수신 가능하도록
  window.postMessage(
    { source: 'pq-isolated', type: 'remote-click', payload: { selector: selector, text: text } },
    window.location.origin,
  );
  try {
    element.focus();
    element.click();
  } catch (e) {}
  return true;
}
export function getReactProps(_element: HTMLElement): any {
  return null;
}
