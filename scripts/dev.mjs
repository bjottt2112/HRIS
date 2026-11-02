import { spawn } from "node:child_process";
import net from "node:net";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const PORTS = [
  { name: "web", port: 3000 },
  { name: "api", port: 5000 },
];

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function portInUse(port) {
  const [ipv4, ipv6] = await Promise.all([
    probe("127.0.0.1", port),
    probe("::1", port),
  ]);
  return ipv4 || ipv6;
}

const conflicts = [];
for (const target of PORTS) {
  if (await portInUse(target.port)) conflicts.push(target);
}

if (conflicts.length > 0) {
  console.error(
    `❌ Port berikut sudah dipakai: ${conflicts
      .map((target) => `${target.port} (${target.name})`)
      .join(", ")}.`,
  );
  console.error(
    "   Kemungkinan masih ada instance `npm run dev` lain. Hentikan dulu prosesnya, lalu jalankan ulang.",
  );
  if (process.platform === "win32") {
    console.error(
      "   Windows: Get-NetTCPConnection -LocalPort 3000,5000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }",
    );
  } else {
    console.error("   Linux/macOS: lsof -ti:3000,5000 | xargs kill -9");
  }
  process.exit(1);
}

const targets = [
  { name: "api", args: ["run", "dev", "--workspace", "api"] },
  { name: "web", args: ["run", "dev", "--workspace", "web"] },
];

const children = targets.map(({ name, args }) => {
  const child = spawn(npm, args, { stdio: "inherit", shell: true });
  child.on("error", (error) => {
    console.error(`[${name}] gagal dijalankan:`, error);
  });
  return { name, child };
});

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const { child } of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  setTimeout(() => process.exit(exitCode), 200);
}

for (const { name, child } of children) {
  child.on("exit", (code) => {
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`[${name}] berhenti dengan kode ${code}. Mematikan proses lain...`);
    }
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
