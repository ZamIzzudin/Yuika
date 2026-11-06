// fixture shell utk test TerminalManager: echo tiap baris stdin + prompt "OK".
process.stdout.write("ready> ");
process.stdin.setEncoding("utf8");
let acc = "";
process.stdin.on("data", (d) => {
  acc += d;
  let i;
  while ((i = acc.indexOf("\n")) >= 0) {
    const line = acc.slice(0, i);
    acc = acc.slice(i + 1);
    if (line === "exit") {
      process.stdout.write("bye\n");
      process.exit(0);
    }
    process.stdout.write(`ECHO:${line}\nOK> `);
  }
});
