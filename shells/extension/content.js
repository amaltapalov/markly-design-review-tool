// Classic content script injected on action click. Content scripts can't be ES modules,
// so it imports the shared modules dynamically; they stay cached, so a second click toggles off.
(async () => {
  const [{ toggle }, { createExtensionPlatform }] = await Promise.all([
    import(chrome.runtime.getURL('src/main.js')),
    import(chrome.runtime.getURL('src/platform/extension.js')),
  ]);
  toggle(createExtensionPlatform());
})();
