// @yui/core — web tools (demo): web_fetch sederhana. TODO(P0): ekstraksi proper,
// redirect policy, robots, cache (pola web_tools Hermes).
import { z } from "zod";
import { registry } from "../registry.js";

const fetchSchema = z.object({
  url: z.string().url(),
  maxChars: z.number().int().positive().max(20_000).default(8_000),
});

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function registerWebTools(): void {
  registry.register({
    name: "web_fetch",
    description: "Fetch URL dan ekstrak teksnya (HTML dipangkas). Untuk riset web.",
    parameters: fetchSchema,
    handler: async (args: z.infer<typeof fetchSchema>) => {
      const res = await fetch(args.url, {
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "YourYui/0.1 (demo)" },
      });
      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const text = contentType.includes("html") ? htmlToText(raw) : raw;
      return {
        result: { url: args.url, status: res.status, text: text.slice(0, args.maxChars) },
      };
    },
  });
}
