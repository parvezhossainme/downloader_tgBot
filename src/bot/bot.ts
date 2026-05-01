import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { finished } from 'stream/promises';
import { config } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = __dirname.includes('src');

const bot = new Telegraf(config.BOT_TOKEN);
const VPS_API_URL = config.VPS_API_URL;
const ADMINS = config.ADMINS;

const usersFilePath = isDev
  ? path.join(__dirname, '..', 'config', 'users.json')
  : path.join(__dirname, '..', '..', 'src', 'config', 'users.json');

const activeUsers = new Set<number>();
const lastAction = new Map<number, any>();
const lastBotMessage = new Map<number, number>();
const pendingBroadcast = new Map<number, any>();
const userState = new Map<number, string>();

if (fs.existsSync(usersFilePath)) {
  try {
    const rawData = fs.readFileSync(usersFilePath, 'utf-8');
    const userIds: number[] = JSON.parse(rawData);
    userIds.forEach(id => activeUsers.add(id));
    console.log(`✅ Loaded ${userIds.length} active users from users.json`);
  } catch (e) {
    console.error('❌ Failed to load users.json:', (e as Error).message);
  }
}

function saveUsers(): void {
  const userIds = Array.from(activeUsers);
  fs.writeFileSync(usersFilePath, JSON.stringify(userIds, null, 2));
}

let botInfo: any = null;
bot.telegram.getMe().then((info) => {
  botInfo = info;
  console.log(`🤖 Bot running as @${info.username}`);
});

bot.start(async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'User';

  if (!activeUsers.has(ctx.from!.id)) {
    activeUsers.add(ctx.from!.id);
    saveUsers();
  }

  await sendMainMenu(ctx, fullName);
});

bot.action(/select_(.+)/, async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  const type = ctx.match![1];
  userState.set(ctx.from!.id, type);

  const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'User';
  const msg = await ctx.reply(`📥 ${type.toUpperCase()} বেছে নেওয়া হয়েছে\n\n${fullName}, এখন আপনার লিংক পাঠান।`);
  lastBotMessage.set(ctx.from!.id, msg.message_id);

  await ctx.answerCbQuery();
});

bot.action('select_auto', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  userState.set(ctx.from!.id, 'auto');

  const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'User';
  const msg = await ctx.reply(`🤖 Auto detect on\n\n${fullName}, send any supported link and I will detect it automatically.`);
  lastBotMessage.set(ctx.from!.id, msg.message_id);

  await ctx.answerCbQuery();
});

bot.action('select_doodstream', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  await ctx.answerCbQuery('❌ ফিচারটি এখনো প্রস্তুত নয়, আপডেটের জন্য অপেক্ষা করুন!', { show_alert: true });
});

bot.action('admin_broadcast', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  if (!ADMINS.includes(ctx.from!.id)) {
    return ctx.answerCbQuery('❌ আপনার ব্রডকাস্টের অনুমতি নেই।', { show_alert: true });
  }
  const sent = await ctx.reply('🚀 ব্রডকাস্ট করার জন্য টেক্সট, ছবি বা ভিডিও পাঠান।');
  pendingBroadcast.set(ctx.from!.id, { waiting: true, messageId: sent.message_id });
  await ctx.answerCbQuery();
});

bot.command('help', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  await ctx.reply(buildHelpMessage(), { parse_mode: 'HTML' });
});

bot.command('about', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  await ctx.reply(buildAboutMessage(), { parse_mode: 'HTML' });
});

bot.command('menu', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'User';
  await sendMainMenu(ctx, fullName);
});

bot.command('settings', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  await ctx.reply('⚙️ Settings is not available yet. Use /start for the main menu.\n⚙️ সেটিংস এখনো পাওয়া যায়নি। মেইন মেনুর জন্য /start ব্যবহার করুন।');
});

function detectPlatform(text: string): string | null {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  if (lowerText.includes('tiktok.com') || lowerText.includes('vm.tiktok.com') || lowerText.includes('vt.tiktok.com')) {
    return 'tiktok';
  }
  if (lowerText.includes('instagram.com') || lowerText.includes('instagr.am')) {
    return 'instagram';
  }
  if (lowerText.includes('facebook.com') || lowerText.includes('fb.com') || lowerText.includes('fb.watch')) {
    return 'facebook';
  }
  if (lowerText.includes('twitter.com') || lowerText.includes('x.com') || lowerText.includes('t.co')) {
    return 'twitter';
  }
  return null;
}

function extractUrl(text: string): string | null {
  if (!text) return null;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : text.trim();
}

function buildHelpMessage(): string {
  return [
    '📚 <b>Help</b>',
    '',
    '/start - menu',
    '/help - help',
    '/about - info',
    '/menu - menu',
    '',
    'TikTok, Facebook, Instagram, Twitter/X',
    'প্ল্যাটফর্ম বেছে নিয়ে লিংক পাঠান।'
  ].join('\n');
}

function buildAboutMessage(): string {
  return [
    'ℹ️ <b>About</b>',
    '',
    'Social video downloader for Telegram.',
    'Telegram-এর জন্য সোশ্যাল ভিডিও ডাউনলোডার।'
  ].join('\n');
}

function getQuickReply(text: string): string | null {
  const normalizedText = text.trim().toLowerCase();

  if (['hi', 'hello', 'hey', 'হাই', 'হ্যালো'].includes(normalizedText)) {
    return '👋 Hello! / হ্যালো!';
  }

  if (['help', '/help', 'সাহায্য', 'help me'].includes(normalizedText)) {
    return buildHelpMessage();
  }

  if (['about', '/about', 'info', 'তথ্য'].includes(normalizedText)) {
    return buildAboutMessage();
  }

  if (['menu', 'settings', '/menu', '/settings', 'মেনু', 'সেটিংস'].includes(normalizedText)) {
    return '📌 Use /start. / মেনুর জন্য /start';
  }

  if (['thanks', 'thank you', 'ধন্যবাদ', 'thx'].includes(normalizedText)) {
    return '🙏 Welcome! / স্বাগতম!';
  }

  return null;
}

async function sendMainMenu(ctx: any, fullName: string) {
  const baseButtons = [
    [{ text: '🤖 Auto Detect — লিংক দেখে টাইপ ধরবে', callback_data: 'select_auto' }],
    [{ text: '🎵 TikTok — ওয়াটারমার্ক ছাড়া ভিডিও ও স্লাইড ডাউনলোড', callback_data: 'select_tiktok' }],
    [{ text: '📘 Facebook — রিলস ও ভিডিও ডাউনলোড', callback_data: 'select_facebook' }],
    [{ text: '📸 Instagram — রিলস, স্টোরি, ফিড ডাউনলোড', callback_data: 'select_instagram' }],
    [{ text: '🐦 Twitter/X — টুইটার ভিডিও ডাউনলোড', callback_data: 'select_twitter' }],
    [{ text: '🚧 Doodstream — শিগগিরই আসছে', callback_data: 'select_doodstream' }]
  ];

  if (ADMINS.includes(ctx.from!.id)) {
    baseButtons.push([{ text: '🚀 সব ইউজারে ব্রডকাস্ট', callback_data: 'admin_broadcast' }]);
  }

  const menuCaption = `👋 হ্যালো ${fullName}!\n\n📥 প্ল্যাটফর্ম বেছে নিন:\n/help • /about • /menu`;

  if (botInfo) {
    try {
      const photos = await ctx.telegram.getUserProfilePhotos(botInfo.id, 0, 1);
      if (photos.total_count > 0) {
        const file_id = photos.photos[0][0].file_id;
        const msg = await ctx.replyWithPhoto(file_id, {
          caption: menuCaption,
          reply_markup: { inline_keyboard: baseButtons }
        });
        lastBotMessage.set(ctx.from!.id, msg.message_id);
        return;
      }
    } catch (error) {
      console.error('❌ Failed to send main menu:', (error as Error).message);
    }
  }

  const msg = await ctx.reply(menuCaption, Markup.inlineKeyboard(baseButtons));
  lastBotMessage.set(ctx.from!.id, msg.message_id);
}

bot.on(['text', 'photo', 'video'], async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    const messageText = ('text' in ctx.message ? ctx.message.text : 
                        'caption' in ctx.message ? ctx.message.caption : '') || '';
    const detectedPlatform = detectPlatform(messageText);
    
    if (!detectedPlatform) return;
    
    const link = extractUrl(messageText);
    if (!link) return;
    
    try {
      let apiUrl = '';
      if (detectedPlatform === 'facebook') apiUrl = `${VPS_API_URL}/api/facebook?url=${encodeURIComponent(link)}`;
      if (detectedPlatform === 'tiktok') apiUrl = `${VPS_API_URL}/api/tiktok?url=${encodeURIComponent(link)}`;
      if (detectedPlatform === 'instagram') apiUrl = `${VPS_API_URL}/api/instagram?url=${encodeURIComponent(link)}`;
      if (detectedPlatform === 'twitter') apiUrl = `${VPS_API_URL}/api/twitter?url=${encodeURIComponent(link)}`;
      
      const response = await axios.get(apiUrl, { timeout: 60000 });
      
      if (detectedPlatform === 'tiktok' && response.data.type === 'image' && response.data.images) {
        const images = response.data.images;
        
        const mediaGroup = images.map((imageUrl, index) => ({
          type: 'photo' as const,
          media: imageUrl,
          caption: index === 0 ? `📸 TikTok Slide (${images.length} foto)\n📌 ${response.data.title || 'TikTok Slide'}` : undefined
        }));
        
        try {
          await ctx.replyWithMediaGroup(mediaGroup);
        } catch (err) {
          console.error(`❌ Failed to send slide media group:`, err);
          for (let i = 0; i < images.length; i++) {
            try {
              await ctx.replyWithPhoto({ url: images[i] }, {
                caption: i === 0 ? `📸 TikTok Slide ${i + 1}/${images.length}\n📌 ${response.data.title || 'TikTok Slide'}` : undefined
              });
            } catch (individualErr) {
              console.error(`❌ Failed to send slide ${i + 1}:`, individualErr);
            }
          }
        }
        return;
      }
      
      const videoUrl = response.data.video_url || response.data.download_url;
      
      if (!videoUrl) return;
      
      if (detectedPlatform === 'facebook') {
        const tempPath = path.join(__dirname, 'temp_video.mp4');
        const writer = fs.createWriteStream(tempPath);

        const videoStream = await axios({
          method: 'get',
          url: videoUrl,
          responseType: 'stream'
        });

        videoStream.data.pipe(writer);
        await finished(writer);

        await ctx.replyWithVideo({ source: tempPath });
        fs.unlinkSync(tempPath);
      } else {
        await ctx.replyWithVideo({ url: videoUrl });
      }
    } catch (err) {
      console.error('❌ Group downloader error:', err);
    }
    return;
  }

  const incomingText = ('text' in ctx.message ? ctx.message.text : '') || '';
    const quickReply = getQuickReply(incomingText);
    if (quickReply) {
      return ctx.reply(quickReply, { parse_mode: 'HTML' });
  }

  const pending = pendingBroadcast.get(ctx.from!.id);
  if (pending) {
    pendingBroadcast.delete(ctx.from!.id);

    const broadcastLoading = await ctx.reply('⏳ সব ইউজারে ব্রডকাস্ট চলছে...');

    let successCount = 0;
    let failedUsers: any[] = [];
    const promises: Promise<void>[] = [];

    const originalText = ('text' in ctx.message ? ctx.message.text : 
                         'caption' in ctx.message ? ctx.message.caption : '') || '';
    const originalEntities = ('entities' in ctx.message ? ctx.message.entities : 
                             'caption_entities' in ctx.message ? ctx.message.caption_entities : []) || [];

    let cleanText = originalText;
    let buttons: any[] = [];
    let removedSegments: any[] = [];

    if (originalEntities.length > 0) {
      const textLinks = originalEntities.filter(e => e.type === 'text_link');

      if (textLinks.length > 0) {
        for (let i = textLinks.length - 1; i >= 0; i--) {
          const entity = textLinks[i];
          const label = originalText.substring(entity.offset, entity.offset + entity.length);
          const url = (entity as any).url;
          buttons.push([Markup.button.url(label, url)]);

          removedSegments.push({ offset: entity.offset, length: entity.length });

          cleanText = cleanText.slice(0, entity.offset) + cleanText.slice(entity.offset + entity.length);
        }
        cleanText = cleanText.trim();
      }
    }

    let newEntities: any[] = [];
    if (originalEntities.length > 0) {
      for (const entity of originalEntities) {
        if (entity.type !== 'text_link') {
          let adjustment = 0;
          for (const removed of removedSegments) {
            if (entity.offset > removed.offset) {
              adjustment += removed.length;
            }
          }
          newEntities.push({
            ...entity,
            offset: entity.offset - adjustment
          });
        }
      }
    }

    for (const userId of activeUsers) {
      if (ADMINS.includes(userId)) continue;

      const sendPromise = (async () => {
        try {
          if ('photo' in ctx.message) {
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            await ctx.telegram.sendPhoto(userId, fileId, {
              caption: cleanText || '📢 Broadcast',
              caption_entities: newEntities,
              reply_markup: buttons.length > 0 ? Markup.inlineKeyboard(buttons).reply_markup : undefined
            });
          } else if ('video' in ctx.message) {
            const fileId = ctx.message.video.file_id;
            await ctx.telegram.sendVideo(userId, fileId, {
              caption: cleanText || '📢 Broadcast',
              caption_entities: newEntities,
              reply_markup: buttons.length > 0 ? Markup.inlineKeyboard(buttons).reply_markup : undefined
            });
          } else if ('text' in ctx.message) {
            await ctx.telegram.sendMessage(userId, cleanText || '📢 Broadcast', {
              entities: newEntities,
              link_preview_options: { is_disabled: true },
              reply_markup: buttons.length > 0 ? Markup.inlineKeyboard(buttons).reply_markup : undefined
            });
          }
          successCount++;
        } catch (error) {
          try {
            const chat = await ctx.telegram.getChat(userId);
            failedUsers.push({
              id: userId,
              username: (chat as any).username ? `@${(chat as any).username}` : '(no username)',
              fullName: [(chat as any).first_name, (chat as any).last_name].filter(Boolean).join(' ') || '(no full name)'
            });
            console.log(`❌ Failed to send to ${userId} (${(chat as any).username || 'no username'}) - Error: ${(error as Error).message}`);
          } catch (e) {
            failedUsers.push({
              id: userId,
              username: '(unknown)',
              fullName: '(unknown)'
            });
            console.log(`❌ Failed to send to ${userId} (unknown) - Error: ${(error as Error).message}`);
          }
        }
      })();
      promises.push(sendPromise);
    }

    await Promise.allSettled(promises);

    try { await ctx.telegram.deleteMessage(ctx.chat!.id, ctx.message.message_id); } catch {}
    try { await ctx.telegram.deleteMessage(ctx.chat!.id, pending.messageId); } catch {}
    try { await ctx.telegram.deleteMessage(ctx.chat!.id, broadcastLoading.message_id); } catch {}

    let report = `✅ <b>ব্রডকাস্ট শেষ!</b>\n\n`;
    report += `👤 <b>মোট ইউজার:</b> ${activeUsers.size}\n`;
    report += `📬 <b>সফলভাবে পাঠানো হয়েছে:</b> ${successCount}\n`;
    report += `🚫 <b>ব্যর্থ হয়েছে:</b> ${failedUsers.length}\n\n`;
    report += `🕒 এই রিপোর্ট ৫ মিনিট পর স্বয়ংক্রিয়ভাবে মুছে যাবে.`;

    if (failedUsers.length > 0) {
      report += `\nব্যর্থের তালিকা:\n`;
      failedUsers.forEach(user => {
        report += `- ${user.username} | ${user.id} | ${user.fullName}\n`;
      });
    }

    const finalReport = await ctx.reply(report, { parse_mode: 'HTML' });

    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat!.id, finalReport.message_id).catch(() => {});
    }, 5 * 60 * 1000);

    return;
  }

  let type = userState.get(ctx.from!.id);
  const link = ('text' in ctx.message ? ctx.message.text?.trim() : '') || '';
  const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'User';

  try {
    await ctx.deleteMessage(ctx.message.message_id);
  } catch (e) {
    console.warn('Failed to delete user message:', (e as Error).message);
  }

  const lastMsgId = lastBotMessage.get(ctx.from!.id);
  if (lastMsgId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, lastMsgId);
    } catch (e) {
      console.warn('Failed to delete instruction message:', (e as Error).message);
    }
    lastBotMessage.delete(ctx.from!.id);
  }

  if (!type || type === 'auto') {
    const detectedType = detectPlatform(link);

    if (detectedType) {
      type = detectedType;
      userState.set(ctx.from!.id, detectedType);
    } else {
      return ctx.reply(`📌 ${fullName}, কোনো supported link দিন বা Auto Detect বেছে নিন।`);
    }
  }

  const processingMessage = await ctx.reply(`⏳ ${fullName}, আপনার ভিডিও প্রক্রিয়া করা হচ্ছে...`);

  try {
    let apiUrl = '';
    if (type === 'facebook') apiUrl = `${VPS_API_URL}/api/facebook?url=${encodeURIComponent(link)}`;
    if (type === 'tiktok') apiUrl = `${VPS_API_URL}/api/tiktok?url=${encodeURIComponent(link)}`;
    if (type === 'instagram') apiUrl = `${VPS_API_URL}/api/instagram?url=${encodeURIComponent(link)}`;
    if (type === 'twitter') apiUrl = `${VPS_API_URL}/api/twitter?url=${encodeURIComponent(link)}`;
    //if (type === 'doodstream') apiUrl = `${VPS_API_URL}/api/doodstream?url=${encodeURIComponent(link)}`;

    const response = await axios.get(apiUrl, { timeout: 60000 });
    const title = response.data.title || 'PHME সোশ্যাল মিডিয়া ডাউনলোডার';
    
    if (type === 'tiktok' && response.data.type === 'image' && response.data.images) {
      const images = response.data.images;
      
      const mediaGroup = images.map((imageUrl, index) => ({
        type: 'photo' as const,
        media: imageUrl,
        caption: index === 0 ? `📸 TikTok স্লাইড (${images.length}টি ছবি)\n📌 শিরোনাম: ${title}` : undefined
      }));
      
      try {
        await ctx.replyWithMediaGroup(mediaGroup);
        
        const buttons = Markup.inlineKeyboard([
          [Markup.button.url('☕ ডেভেলপারকে সাপোর্ট করুন', 'https://parvezhossainme.com')],
          [Markup.button.url('⚠️ বাগ রিপোর্ট করুন', 'https://t.me/parvezhossainme')]
        ]);
        
        await ctx.reply('☕ এই বটকে সাপোর্ট করুন বা বাগ রিপোর্ট করুন:', buttons);
        
      } catch (err) {
        console.error(`❌ Failed to send slide media group:`, err);
        for (let i = 0; i < images.length; i++) {
          try {
            const caption = i === 0 ? 
              `📸 TikTok স্লাইড ${i + 1}/${images.length}\n📌 শিরোনাম: ${title}` : 
              `📸 TikTok স্লাইড ${i + 1}/${images.length}`;
            
            await ctx.replyWithPhoto({ url: images[i] }, { caption });
          } catch (individualErr) {
            console.error(`❌ Failed to send slide ${i + 1}:`, individualErr);
          }
        }
      }
      
      lastAction.set(ctx.from!.id, { type, link, title });
      await ctx.telegram.deleteMessage(ctx.chat!.id, processingMessage.message_id);
      
      const done = await ctx.reply('✅ স্লাইড ছবি পাঠানো হয়েছে!');
      setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat!.id, done.message_id).catch(() => {});
      }, 4000);
      
      userState.delete(ctx.from!.id);
      return;
    }
    
    const videoUrl = response.data.video_url || response.data.download_url;

    if (!videoUrl) {
      await ctx.telegram.editMessageText(ctx.chat!.id, processingMessage.message_id, undefined, `❌ ভিডিও পাওয়া যায়নি।`);
      return;
    }

    const caption = `🎬 উৎস: ${type.toUpperCase()}\n📌 শিরোনাম: ${title}\n\n☕ এই বটকে সাপোর্ট করুন বা বাগ রিপোর্ট করুন:`;
    const buttons = Markup.inlineKeyboard([
      [Markup.button.url('☕ ডেভেলপারকে সাপোর্ট করুন', 'https://parvezhossainme.com')],
      [Markup.button.url('⚠️ বাগ রিপোর্ট করুন', 'https://t.me/parvezhossainme')]
    ]);

    if (type === 'facebook') {
      const tempPath = path.join(__dirname, 'temp_video.mp4');
      const writer = fs.createWriteStream(tempPath);

      const videoStream = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream'
      });

      videoStream.data.pipe(writer);
      await finished(writer);

      await ctx.replyWithVideo({ source: tempPath }, { caption, ...buttons });

      fs.unlinkSync(tempPath);
    } else {
      await ctx.replyWithVideo({ url: videoUrl }, { caption, ...buttons });
    }

    lastAction.set(ctx.from!.id, { type, link, title });

    await ctx.telegram.deleteMessage(ctx.chat!.id, processingMessage.message_id);

    const done = await ctx.reply('✅ ভিডিও পাঠানো হয়েছে!');
    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat!.id, done.message_id).catch(() => {});
    }, 4000);

    userState.delete(ctx.from!.id);
  } catch (err) {
    console.error('❌ Downloader error:', err);
    await ctx.telegram.editMessageText(ctx.chat!.id, processingMessage.message_id, undefined, `❌ ভিডিও নিতে গিয়ে সমস্যা হয়েছে।`);
  }
});

bot.launch();
  console.log('🤖 Telegram bot started...');
