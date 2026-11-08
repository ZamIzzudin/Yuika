// @yuika/core, diff baris sederhana (LCS DP) untuk viewer revisi file .
// Cukup untuk diff read-only di UI; cap 2000 baris per sisi agar DP tidak meledak.
export type DiffOp = { t: "=" | "+" | "-"; line: string };

const MAX_LINES = 2000;

export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = (oldText === "" ? [] : oldText.split(/\r?\n/)).slice(0, MAX_LINES);
  const b = (newText === "" ? [] : newText.split(/\r?\n/)).slice(0, MAX_LINES);
  // DP LCS: dp[i][j] = panjang LCS dari a[i..], b[j..]
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ t: "=", line: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ t: "-", line: a[i]! });
      i++;
    } else {
      out.push({ t: "+", line: b[j]! });
      j++;
    }
  }
  while (i < a.length) out.push({ t: "-", line: a[i++]! });
  while (j < b.length) out.push({ t: "+", line: b[j++]! });
  return out;
}

/** Ringkasan ± untuk badge UI. */
export function diffStat(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    if (o.t === "+") added++;
    else if (o.t === "-") removed++;
  }
  return { added, removed };
}
