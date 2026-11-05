// @yuika/core — util estimasi token (P0-CORE-4).
// Heuristik chars/4 (kira-kira 1 token ≈ 4 char untuk teks campuran EN/ID).
// Sengaja KONSERVATIF dan sederhana: dipakai hanya untuk keputusan "perlu
// kompresi atau tidak" — bukan untuk metering (metering memakai usage provider).
export function estimateTokens(messages: Array<{ content?: string; role: string }>): number {
  let chars = 0;
  for (const m of messages) chars += (m.content?.length ?? 0) + m.role.length + 8; // +overhead per pesan
  return Math.ceil(chars / 4);
}
