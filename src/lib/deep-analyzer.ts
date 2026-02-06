/**
 * Deep DOM & Event Analyzer for Pocket Option (PO-15)
 */

export const DEEP_ANALYZER_SCRIPT = `
(function analyzeEvents() {
  console.log("%c[PO-15 Deep Event Analysis]", "color: #ff00ff; font-weight: bold; font-size: 16px;");
  
  const targetName = 'American Express OTC';
  const items = document.querySelectorAll('.alist__item');
  let item = null;
  for (const it of items) {
    if (it.textContent.includes(targetName)) {
      item = it;
      break;
    }
  }

  if (!item) {
    console.error("❌ Asset not found. Open the list first.");
    return;
  }

  const getEventData = (el) => {
    const data = {
      tag: el.tagName,
      class: el.className,
      rect: el.getBoundingClientRect(),
      react: {}
    };
    const rKey = Object.keys(el).find(k => k.startsWith('__reactProps'));
    if (rKey) {
      const props = el[rKey];
      data.react.key = rKey;
      data.react.handlers = Object.keys(props).filter(k => k.toLowerCase().includes('on'));
      data.react.onClickType = typeof props.onClick;
    }
    return data;
  };

  const tree = {
    li: getEventData(item),
    a: item.querySelector('a') ? getEventData(item.querySelector('a')) : null,
    span_label: item.querySelector('.alist__label') ? getEventData(item.querySelector('.alist__label')) : null,
    span_payout: item.querySelector('.alist__payout') ? getEventData(item.querySelector('.alist__payout')) : null
  };

  console.log("DOM Event Tree:", tree);

  // Trace Capture/Bubble test
  const events = ['mousedown', 'mouseup', 'click'];
  const logEvent = (e) => {
    console.log(\`[%c\${e.type}\u001b[0m] Target: \${e.target.tagName}.\${e.target.className} | Phase: \${e.eventPhase}\`);
  };

  events.forEach(type => {
    window.addEventListener(type, logEvent, true); // Capture
    window.addEventListener(type, logEvent, false); // Bubble
  });

  console.log("%c⚠️ Event Listeners attached. Now try clicking the asset MANUALLY and watch the log.", "color: orange;");
  
  // Clean up after 10 seconds
  setTimeout(() => {
    events.forEach(type => {
      window.removeEventListener(type, logEvent, true);
      window.removeEventListener(type, logEvent, false);
    });
    console.log("Analysis listeners detached.");
  }, 10000);
})();
`;

export async function logInteraction(type: string, details: any) {
  console.log(`[InteractionLog] ${type}:`, details);
}
