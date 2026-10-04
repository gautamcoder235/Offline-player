/**
 * Native desktop WebView hardening module.
 * Ensures the application behaves like a controlled native desktop music player
 * rather than a standard web browser, without altering existing UI or application shortcuts.
 */

export function setupNativeHardening(): () => void {
  // Always prevent the native browser right-click context menu (Back, Reload, Save as, Print, Inspect)
  // so the application feels like a native desktop app at all times.
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  window.addEventListener('contextmenu', handleContextMenu, true);
  document.addEventListener('contextmenu', handleContextMenu, true);

  // In development, keep browser developer shortcuts (F12, etc.) available for debugging if needed
  if (!import.meta.env.PROD) {
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }

  // 2. Browser / WebView developer shortcuts interception (production only)
  const handleKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    const key = e.key;
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // F12 -> Developer Tools
    if (key === 'F12' || code === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Ctrl + Shift + I -> Developer Tools
    // Ctrl + Shift + J -> Console
    // Ctrl + Shift + C -> Element Inspector
    if (ctrlOrMeta && shift && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Ctrl + U -> View Source
    if (ctrlOrMeta && !shift && code === 'KeyU') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // F5 / Ctrl + R / Ctrl + F5 / Ctrl + Shift + R -> Browser Page Reload
    if (
      key === 'F5' ||
      code === 'F5' ||
      (ctrlOrMeta && code === 'KeyR' && !e.altKey)
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Ctrl + P -> Browser Print dialog
    if (ctrlOrMeta && !shift && code === 'KeyP') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Shift + F10 -> Windows default context menu key
    if (shift && (key === 'F10' || code === 'F10')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Alt + Left / Alt + Right -> Browser history navigation (can break SPA state)
    if (e.altKey && (code === 'ArrowLeft' || code === 'ArrowRight')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // All application-owned shortcuts (Space, Ctrl+K, M, L, Ctrl+B, seek/volume arrows,
    // Ctrl+ArrowLeft/Right, 1/2/3 visualizer, Ctrl+C/V/X/A, text typing)
    // flow normally to the application!
  };

  window.addEventListener('contextmenu', handleContextMenu, true);
  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    window.removeEventListener('contextmenu', handleContextMenu, true);
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}
