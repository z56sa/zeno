const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const logger = require('./logger');

let checkInterval = null;

/**
 * فحص قناة يوتيوب عبر RSS Feed الرسمي المجاني بدون الحاجة لـ API Key معقد
 */
async function checkYouTube(channelIdOrHandle) {
  try {
    let cleanId = channelIdOrHandle.trim();
    let url = '';

    if (cleanId.startsWith('UC') && cleanId.length === 24) {
      url = `https://www.youtube.com/feeds/videos.xml?channel_id=${cleanId}`;
    } else {
      // إزالة @ أو الرابط الكامل
      cleanId = cleanId.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@/, '');
      if (cleanId.startsWith('channel/')) {
        const id = cleanId.replace('channel/', '');
        url = `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
      } else {
        url = `https://www.youtube.com/feeds/videos.xml?user=${cleanId}`;
      }
    }

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const xml = response.data;
    if (!xml || typeof xml !== 'string') return null;

    // استخراج بيانات أحدث فيديو من XML
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;

    const entry = entryMatch[1];
    const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>(.*?)<\/title>/);
    const authorMatch = xml.match(/<author>[\s\S]*?<name>(.*?)<\/name>/);
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/);

    if (!videoIdMatch || !titleMatch) return null;

    const videoId = videoIdMatch[1];
    const videoTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    const channelName = authorMatch ? authorMatch[1] : cleanId;
    const published = publishedMatch ? publishedMatch[1] : new Date().toISOString();

    return {
      id: videoId,
      title: videoTitle,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelName: channelName,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      published: published
    };
  } catch (err) {
    return null;
  }
}

/**
 * فحص بث Twitch مباشر عبر واجهة عامة موثوقة
 */
async function checkTwitch(username) {
  try {
    const cleanUser = username.trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/^@/, '');
    
    // فحص صفحة القناة أو استخدام API مجاني
    const res = await axios.get(`https://www.twitch.tv/${cleanUser}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = res.data;
    const isLive = html.includes('"isLiveBroadcast":true') || html.includes('"liveStream":');

    if (!isLive) return null;

    // محاولة استخراج العنوان
    const titleMatch = html.match(/<meta property="og:description" content="(.*?)"/i) || html.match(/"description":"(.*?)"/i);
    const streamTitle = titleMatch ? titleMatch[1] : `بث مباشر الآن على قناة ${cleanUser}!`;

    return {
      id: `twitch_${cleanUser}_${new Date().getHours()}`,
      title: streamTitle,
      url: `https://twitch.tv/${cleanUser}`,
      channelName: cleanUser,
      thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${cleanUser}-640x360.jpg`,
      isLive: true
    };
  } catch (err) {
    return null;
  }
}

/**
 * فحص فيديوهات TikTok عبر RSS/Scraper
 */
async function checkTikTok(username) {
  try {
    const cleanUser = username.trim().replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/^@/, '');
    
    const res = await axios.get(`https://www.tiktok.com/@${cleanUser}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = res.data;
    // استخراج أحدث video ID من JSON المدمج
    const idMatch = html.match(/"id":"(\d{15,22})"/);
    if (!idMatch) return null;

    const videoId = idMatch[1];
    return {
      id: videoId,
      title: `فيديو جديد من @${cleanUser} على تيك توك 🎵`,
      url: `https://www.tiktok.com/@${cleanUser}/video/${videoId}`,
      channelName: cleanUser,
      thumbnail: 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uomluhz_lm_q/tiktok_icon.png'
    };
  } catch (err) {
    return null;
  }
}

/**
 * معالجة التنبيهات وإرسالها للسيرفر المحدد
 */
async function processFeed(client, feed) {
  try {
    const channel = client.channels.cache.get(feed.channel_id) || await client.channels.fetch(feed.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    let latest = null;
    let platformName = '';
    let platformColor = '#FF0000';
    let platformIcon = '📺';

    if (feed.platform === 'youtube') {
      latest = await checkYouTube(feed.account_id);
      platformName = 'YouTube';
      platformColor = '#FF0000';
      platformIcon = '📺';
    } else if (feed.platform === 'twitch') {
      latest = await checkTwitch(feed.account_id);
      platformName = 'Twitch';
      platformColor = '#9146FF';
      platformIcon = '🔴';
    } else if (feed.platform === 'tiktok') {
      latest = await checkTikTok(feed.account_id);
      platformName = 'TikTok';
      platformColor = '#00F2FE';
      platformIcon = '🎵';
    }

    if (!latest || !latest.id) return;

    // منع التكرار: إذا كان نفس الفيديو الأخير لا نرسل مرة أخرى
    if (feed.last_video_id === latest.id) return;

    // إذا كانت أول مرة نسجل الفيديو بدون إرسال إشعار قديم إلا إذا رغبنا
    if (!feed.last_video_id) {
      db.updateSocialFeedLastId(feed.id, latest.id);
      return;
    }

    // تحديث آخر ID في قاعدة البيانات
    db.updateSocialFeedLastId(feed.id, latest.id);

    // بناء الرسالة المخصصة
    let messageContent = feed.custom_message || '';
    if (feed.role_id) {
      const mention = feed.role_id === 'everyone' ? '@everyone' : `<@&${feed.role_id}>`;
      messageContent = `${mention} ${messageContent}`.trim();
    }

    if (!messageContent) {
      if (feed.platform === 'youtube') messageContent = `🔔 **${latest.channelName}** نزل فيديو جديد على YouTube!`;
      else if (feed.platform === 'twitch') messageContent = `🔴 **${latest.channelName}** بدأ بث مباشر الآن على Twitch!`;
      else messageContent = `🎵 **${latest.channelName}** نزل فيديو جديد على TikTok!`;
    } else {
      messageContent = messageContent
        .replace(/{channel}/g, latest.channelName)
        .replace(/{title}/g, latest.title)
        .replace(/{url}/g, latest.url);
    }

    const embed = new EmbedBuilder()
      .setColor(platformColor)
      .setTitle(`${platformIcon} ${latest.title}`)
      .setURL(latest.url)
      .setAuthor({ name: `${latest.channelName} (${platformName})`, url: latest.url })
      .setDescription(`[اضغط هنا للمشاهدة الآن](${latest.url})\n\n**القناة:** ${latest.channelName}`)
      .setImage(latest.thumbnail)
      .setFooter({ text: `ZENO ${platformName} Notifier • تلقائي` })
      .setTimestamp();

    await channel.send({
      content: messageContent ? `${messageContent}\n${latest.url}` : latest.url,
      embeds: [embed]
    }).catch(err => {
      logger.error(`Failed to send ${platformName} notification to channel ${feed.channel_id}:`, err.message);
    });

  } catch (e) {
    // تجاهل أخطاء الشبكة الفردية
  }
}

/**
 * تشغيل دورة الفحص التلقائي لكل الحسابات المفعلة
 */
function startSocialNotifier(client) {
  if (checkInterval) clearInterval(checkInterval);

  logger.info('🚀 [Notifier] Social media notifier (YouTube / Twitch / TikTok) started.');

  // فحص كل دقيقتين (120 ثانية)
  checkInterval = setInterval(async () => {
    try {
      const activeFeeds = db.getAllActiveSocialFeeds();
      if (!activeFeeds || activeFeeds.length === 0) return;

      for (const feed of activeFeeds) {
        await processFeed(client, feed);
        // تأخير بسيط لتجنب الـ Rate limit
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (err) {
      logger.error('[Notifier] Error in feed checking cycle:', err.message);
    }
  }, 120000);

  // تشغيل فحص أولي بعد 15 ثانية من الإقلاع
  setTimeout(async () => {
    try {
      const activeFeeds = db.getAllActiveSocialFeeds();
      for (const feed of activeFeeds) {
        await processFeed(client, feed);
      }
    } catch (e) {}
  }, 15000);
}

module.exports = {
  startSocialNotifier,
  checkYouTube,
  checkTwitch,
  checkTikTok,
  processFeed
};
