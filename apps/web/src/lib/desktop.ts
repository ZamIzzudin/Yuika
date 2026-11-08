// Tauri desktop shell detection. The shell injects window.__TAURI__
// (withGlobalTauri) into every page; used to show desktop-only controls
// (e.g. "Switch mode" back to the welcome.html onboarding).
export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/** Kembali ke halaman onboarding shell (host/remote picker).
 *  ?reset menahan auto-resume setup terakhir & menghapusnya, jadi tombol
 *  "Switch mode" selalu membawa user ke pilihan penuh. */
export function backToDesktopWelcome(): void {
  window.location.assign("/welcome.html?reset=1");
}
