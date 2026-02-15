/**
 * Comprehensive verification tool for Auto Miner and Payout Monitor (PO-15)
 */

export async function runFullVerification() {
  console.log('--- 🛡️ Auto Miner Logic Verification Start ---');
  const results: any = {
    timestamp: new Date().toISOString(),
    selectors: {},
    interactions: {},
    reactContext: {},
  };

  const SELECTORS = {
    pairTrigger: '.current-symbol',
    pairWrap: '.pair-number-wrap',
    assetList: '.assets-block__alist.alist',
    assetItem: '.alist__item',
    assetLabel: '.alist__label',
    assetPayout: '.alist__payout',
  };

  // 1. Selector Verification
  console.log('[PO] [Step 1] Verifying DOM Selectors...');
  for (const [key, selector] of Object.entries(SELECTORS)) {
    const el = document.querySelector(selector);
    const count = document.querySelectorAll(selector).length;
    results.selectors[key] = {
      found: !!el,
      count,
      className: el?.className,
      isVisible: el ? (el as HTMLElement).offsetWidth > 0 : false,
    };
    console.log(
      `- ${key}: ${count} elements found (${results.selectors[key].isVisible ? 'VISIBLE' : 'HIDDEN'})`,
    );
  }

  // 2. React Internal Props Verification
  console.log('[PO] [Step 2] Verifying React Event Handlers...');
  const trigger = document.querySelector(SELECTORS.pairWrap) as HTMLElement;
  if (trigger) {
    const props = Object.keys(trigger).filter((k) => k.startsWith('__reactProps'));
    results.reactContext.trigger = {
      keys: props,
      hasOnClick: props.some((k) => typeof (trigger as any)[k]?.onClick === 'function'),
    };
    console.log(
      `- Trigger (${SELECTORS.pairWrap}) has React onClick: ${results.reactContext.trigger.hasOnClick}`,
    );
  }

  const firstItem = document.querySelector('.alist__link') as HTMLElement;
  if (firstItem) {
    const props = Object.keys(firstItem).filter((k) => k.startsWith('__reactProps'));
    results.reactContext.assetItem = {
      keys: props,
      hasOnClick: props.some((k) => typeof (firstItem as any)[k]?.onClick === 'function'),
    };
    console.log(
      `- Asset Link (.alist__link) has React onClick: ${results.reactContext.assetItem.hasOnClick}`,
    );
  }

  // 3. Data Integrity Verification
  console.log('[PO] [Step 3] Verifying Data Scraping Logic...');
  const items = document.querySelectorAll(SELECTORS.assetItem);
  if (items.length > 0) {
    const samples = Array.from(items)
      .slice(0, 3)
      .map((item) => {
        const label = item.querySelector(SELECTORS.assetLabel)?.textContent?.trim();
        const payout = item.querySelector(SELECTORS.assetPayout)?.textContent?.trim();
        return { label, payout };
      });
    results.data = { samples, total: items.length };
    console.log(`- Data Sample:`, samples);
  } else {
    console.warn('- No assets found to verify data scraping.');
  }

  console.log('--- 🛡️ Verification Complete ---');
  console.table(results.selectors);
  return results;
}

/**
 * Portable script for manual console verification
 */
export const VERIFICATION_SCRIPT = `
(async function verify() {
  console.log("%c[PO-15 Diagnostic Mode]", "color: #00ff00; font-weight: bold; font-size: 14px;");
  
  const check = (label, sel) => {
    const el = document.querySelector(sel);
    console.log(\`[\${label}] \${sel} -> \${el ? '✅ Found' : '❌ Missing'} (\${document.querySelectorAll(sel).length})\`);
    if (el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        console.log(\`   Visibility: display=\${style.display}, height=\${rect.height}, top=\${rect.top}\`);
    }
  };

  check('Trigger', '.pair-number-wrap');
  check('List', '.assets-block__alist.alist');
  check('Item', '.alist__item');
  check('Label', '.alist__label');
  check('Payout', '.alist__payout');

  const item = document.querySelector('.alist__link');
  if (item) {
    const rKey = Object.keys(item).find(k => k.startsWith('__reactProps'));
    console.log(\`[React] .alist__link React Props: \${rKey ? '✅' : '❌'}\`);
    if (rKey) console.log(\`[React] .alist__link onClick: \${typeof item[rKey].onClick === 'function' ? '✅' : '❌'}\`);
  }
})();
`;
