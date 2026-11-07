// Batch 7 (RS-1b) — Market: harga crypto (CoinGecko, gratis tanpa key) +
// saham/forex (Stooq CSV — delayed). Hasil = baris harga sintetis, bukan link:
// Scholar langsung dapat angka + tautan verifikasi.
import type { SearchProvider, SearchResult } from "../types.js";
import { httpJson, httpText } from "../util.js";

const COINS: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin", eth: "ethereum", ethereum: "ethereum", sol: "solana", solana: "solana",
  bnb: "binancecoin", xrp: "ripple", doge: "dogecoin", ada: "cardano", link: "chainlink", avax: "avalanche-2",
  dot: "polkadot", ltc: "litecoin", matic: "matic-network", usdt: "tether", usdc: "usd-coin",
};

interface CgPrice {
  [id: string]: { usd?: number; idr?: number; usd_24h_change?: number };
}

const idrFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

async function cryptoQuotes(query: string): Promise<SearchResult[]> {
  const tokens = query.toLowerCase().match(/[a-z]+/g) ?? [];
  const ids = [...new Set(tokens.map((t) => COINS[t]).filter(Boolean))].slice(0, 4);
  if (!ids.length) return [];
  const { data } = await httpJson<CgPrice>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,idr&include_24hr_change=true`,
    { timeoutMs: 10_000 },
  );
  return ids
    .filter((id): id is string => id !== undefined && data[id]?.usd !== undefined)
    .map((id) => {
      const p = data[id]!;
      const chg = p.usd_24h_change !== undefined ? ` (${p.usd_24h_change >= 0 ? "+" : ""}${p.usd_24h_change.toFixed(2)}% 24h)` : "";
      return {
        title: `${id.toUpperCase()}: $${p.usd!.toLocaleString("en-US")}${chg}`,
        url: `https://www.coingecko.com/en/coins/${id}`,
        snippet: `CoinGecko spot · Rp${idrFmt.format(p.idr ?? 0)}/unit — harga live, verifikasi di halaman coin`,
        source: "market:coingecko",
      };
    });
}

// Stooq symbol dari query: kurs "usd idr"/"eur usd" atau ticker eksplisit $AAPL / "aapl.us".
function stooqSymbols(query: string): string[] {
  const out: string[] = [];
  const fx = query.toLowerCase().match(/\b(usd|eur|jpy|gbp|sgd|aud)\s+(idr|usd|eur|jpy|gbp|sgd|aud)\b/);
  if (fx && fx[1] !== fx[2]) out.push(`${fx[1]}${fx[2]}`);
  for (const t of query.match(/\$([A-Za-z]{1,5})\b/g) ?? []) out.push(`${t.slice(1).toLowerCase()}.us`);
  return [...new Set(out)].slice(0, 3);
}

async function stooqQuotes(query: string): Promise<SearchResult[]> {
  const syms = stooqSymbols(query);
  if (!syms.length) return [];
  const out: SearchResult[] = [];
  for (const s of syms) {
    const { status, text } = await httpText(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=csv`, { timeoutMs: 10_000 });
    if (status !== 200) continue;
    const [header, row] = text.trim().split(/\r?\n/);
    const cols = header?.split(",") ?? [];
    const vals = row?.split(",") ?? [];
    const get = (k: string) => vals[cols.indexOf(k)] ?? "";
    const close = Number(get("Close"));
    if (!close) continue;
    out.push({
      title: `${s.toUpperCase()}: ${close.toLocaleString("en-US")} (${get("Date")} ${get("Time")})`,
      url: `https://stooq.com/q/?s=${s}`,
      snippet: `Stooq delayed quote · Open ${get("Open")} High ${get("High")} Low ${get("Low")} — bukan realtime`,
      source: "market:stooq",
    });
  }
  return out;
}

export const marketProvider: SearchProvider = {
  name: "market",
  matches: (q) => /\bharga\b|\bprice\b|\bkurs\b|nilai tukar|pergerakan|\bcrypto\b|\bsaham\b|\bstock\b|\busdt?\b|\bidr\b/i.test(q) || /\$[A-Za-z]{1,5}\b/.test(q) || Object.keys(COINS).some((c) => new RegExp(`\\b${c}\\b`, "i").test(q)),
  search: async (query) => {
    const [crypto, stooq] = await Promise.all([cryptoQuotes(query).catch(() => []), stooqQuotes(query).catch(() => [])]);
    return [...crypto, ...stooq];
  },
};
