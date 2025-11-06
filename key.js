import axios from "axios";
import chalk from "chalk";
import { exec } from "child_process";
import settings from "./setting.js";

const STORE_NAME = "YAMZZ OFFICIAL";

const CONTROL_URL = "https://raw.githubusercontent.com/yamzzreal/dbprotect/refs/heads/main/control.txt";
const TOKEN_URL = "https://raw.githubusercontent.com/yamzzreal/dbprotect/refs/heads/main/tokens.json";

const BOT_TOKEN = settings.BOT_TOKEN;

async function isScriptAllowed() {
  try {
    const res = await axios.get(CONTROL_URL, { timeout: 5000 });
   
    return String(res.data).trim().toLowerCase() === "on";
  } catch (err) {
    console.error(chalk.red("✖ Gagal mengambil status kontrol:"), err.message);
    
    return false;
  }
}

async function fetchValidTokens() {
  try {
    const res = await axios.get(TOKEN_URL, { timeout: 5000 });

    return (res.data && Array.isArray(res.data.tokens)) ? res.data.tokens : [];
  } catch (err) {
    console.error(chalk.red("❌ Gagal mengambil daftar token:"), err.message);
    return [];
  }
}

async function validateTokenAndStart() {
  console.log(chalk.blue("Please Wait... Checking Tokens 😁"));
  const validTokens = await fetchValidTokens();

  if (!validTokens.includes(BOT_TOKEN)) {
    console.log(chalk.red("🚫 TOKEN BELUM TERDAFTAR DI DATABASE."));
    console.log(chalk.yellow(`PROTECT BY ${STORE_NAME}`));
    // Hentikan proses dengan error code
    process.exit(1);
  }

  console.log(chalk.green("✅ TOKEN TERDAFTAR..."));
  startMainBot();
}

function startMainBot() {
  console.log(chalk.blue("🔓 Security Check Passed! Starting index.js..."));

  exec("RUN_FROM_KEY=1 node index.js", (error, stdout, stderr) => {
    if (error) {
      console.error(chalk.red("❌ Error menjalankan bot:"), error.message);
      return;
    }
    if (stderr) {
      
      console.error(chalk.yellow(stderr));
    }
    if (stdout) {
      console.log(stdout);
    }
  });
}

(async function main() {
  const allowed = await isScriptAllowed();

  if (!allowed) {
    console.log();
    console.log(chalk.red("❌ Script dimatikan oleh developer (control.txt = off)"));
    console.log(chalk.yellow(`🔒 Silakan hubungi @yamzzzx untuk aktivasi kembali.`));
    console.log(chalk.cyan(`PROTECT BY ${STORE_NAME}`));
    process.exit(1);
  }

  await validateTokenAndStart();
})();
