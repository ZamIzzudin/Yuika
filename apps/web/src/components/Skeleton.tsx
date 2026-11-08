// "use client" tidak perlu, komponen murni presentational.
// Skeleton loader (feedback user: "skeleton lebih profesional dibanding loader"):
// placeholder shimmer saat data masih di-fetch, satu bahasa visual di seluruh app.

// Bar monokrom halus + sapuan cahaya (shimmer), tanpa spinner.
export function Skeleton({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  // Lebar bar divariasi supaya tampak seperti konten asli, bukan garis seragam.
  const widths = ["72%", "100%", "88%", "60%", "94%", "80%"];
  return (
    <div
      className={"skeleton " + className}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="sk"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

/** Skeleton baris daftar (sidebar proyek, katalog MCP, roster). */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton rows" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="sk row">
          <i />
          <span
            className="sk-line"
            style={{ width: i % 3 === 0 ? "58%" : "38%" }}
          />
        </span>
      ))}
    </div>
  );
}
