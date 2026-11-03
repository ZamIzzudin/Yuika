import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import YAML from "yaml";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbg-"));
const skillMd = (name, description, body, status, source) => {
  const fm = ["---",`name: ${name}`,`description: ${description.replace(/\n/g," ")}`,"metadata:","  yui:",`    status: ${status}`,...(source? [`    source: "${source.replace(/"/g,"'").slice(0,120)}"`]:[]),"---",""].join("\n");
  return fm + body.trim() + "\n";
};
const d2 = path.join(dir,"drafts","flow-b"); fs.mkdirSync(d2,{recursive:true});
fs.writeFileSync(path.join(d2,"SKILL.md"), skillMd("Flow B","Prosedur valid","1. langkah\n2. langkah","draft"), "utf-8");
const text = fs.readFileSync(path.join(d2,"SKILL.md"),"utf-8");
console.log(JSON.stringify(text));
const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
console.log("fm:", JSON.stringify(m?.[1]));
console.log("parsed:", YAML.parse(m[1]));
