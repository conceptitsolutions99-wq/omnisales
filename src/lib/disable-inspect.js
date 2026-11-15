// Keeps the right-click menu and the usual developer-tool shortcuts from opening the page's
// inspector. This is deterrence, not security: nothing on a web page can stop a determined
// visitor from reading the JavaScript it already downloaded, and none of the app's data is
// protected by this — every screen it hides is still guarded by the server's session check.
// Left off during local development so the team keeps F12.
const TOOL_SHORTCUTS = new Set(['I', 'J', 'C', 'K']);

export function blockInspection() {
  if (import.meta.env.DEV) return;

  document.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault();
    },
    { capture: true }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const key = String(event.key || '').toUpperCase();
      const modifier = event.ctrlKey || event.metaKey;
      const devtools = modifier && event.shiftKey && TOOL_SHORTCUTS.has(key);
      const viewSource = modifier && !event.shiftKey && key === 'U';
      const devtoolsKey = key === 'F12';

      if (devtools || viewSource || devtoolsKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true }
  );
}
