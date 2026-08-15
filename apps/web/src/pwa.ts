/**
 * Install-only PWA wiring for the thin web entry. Registers the network-only
 * service worker so a supporting browser can offer Add to Home Screen. No
 * offline cache.
 */
export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Registration failure is non-fatal: the page still works as a tab.
  })
}
