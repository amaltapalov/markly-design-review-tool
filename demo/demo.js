// Shared boot for the demo host pages: Markly starts only when the reviewer asks (the button,
// Alt+Shift+M or ?review typed in the URL), or when Markly itself just opened this screen.
import { resume, toggle } from '../src/main.js';
import { createInjectedPlatform } from '../src/platform/injected.js';

const platform = createInjectedPlatform();
if (new URLSearchParams(location.search).has('test')) globalThis.__MARKLY_TEST__ = true;
document.getElementById('launch')?.addEventListener('click', () => toggle(platform));
addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && e.code === 'KeyM') toggle(platform);
});
if (new URLSearchParams(location.search).has('review')) toggle(platform);
else resume(platform);
