// D48: deteksi shell desktop Tauri. Shell meng-inject window.__TAURI__
// (withGlobalTauri) di semua halaman; dipakai untuk menampilkan kontrol
// khusus desktop (mis. "Switch mode" kembali ke welcome.html onboarding).
export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/** Kembali ke halaman onboarding shell (host/remote picker). */
export function backToDesktopWelcome(): void {
  window.location.assign("/welcome.html");
}
