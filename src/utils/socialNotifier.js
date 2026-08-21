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
      channelName,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      published
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
    const cleanUser = username.trim().toLowerCase()
      .replace(/^https?:\/\/(www\.)?twitch\.tv\//, '')
      .replace(/^@/, '');

    const res = await axios.get(`https://www.twitch.tv/${cleanUser}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = res.data;
    const isLive = html.includes('"isLiveBroadcast":true') || html.includes('"liveStream":');

    if (!isLive) return null;

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
    const cleanUser = username.trim()
      .replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '')
      .replace(/^@/, '');

    const res = await axios.get(`https://www.tiktok.com/@${cleanUser}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.5'
      }
    });

    const html = res.data;
    // محاولة استخراج أحدث video ID من بيانات JSON المدمجة
    const idMatch = html.match(/"id":"(\d{15,22})"/) || html.match(/video\/(\d{15,22})/);
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
 * بناء وإرسال Embed التنبيه للقناة
 */
async function sendNotificationEmbed(client, feed, latest) {
  try {
    const channel = client.channels.cache.get(feed.channel_id)
      || await client.channels.fetch(feed.channel_id).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      logger.warn(`[Notifier] Channel ${feed.channel_id} not found or not text-based`);
      return false;
    }

    const platformMeta = {
      youtube: { name: 'YouTube', color: '#FF0000', icon: '📺' },
      twitch:  { name: 'Twitch',  color: '#9146FF', icon: '🔴' },
      tiktok:  { name: 'TikTok',  color: '#00F2FE', icon: '🎵' }
    };

    const meta = platformMeta[feed.platform] || { name: feed.platform, color: '#7c3aed', icon: '🔔' };

    // بناء رسالة المنشن
    let messageContent = feed.custom_message || '';
    if (feed.role_id) {
      const mention = feed.role_id === 'everyone' ? '@everyone' : `<@&${feed.role_id}>`;
      messageContent = `${mention} ${messageContent}`.trim();
    }

    if (!messageContent) {
      if (feed.platform === 'youtube')      messageContent = `🔔 **${latest.channelName}** نزل فيديو جديد على YouTube!`;
      else if (feed.platform === 'twitch')  messageContent = `🔴 **${latest.channelName}** بدأ بث مباشر على Twitch!`;
      else                                  messageContent = `🎵 **${latest.channelName}** نزل فيديو جديد على TikTok!`;
    } else {
      messageContent = messageContent
        .replace(/{channel}/g, latest.channelName)
        .replace(/{title}/g, latest.title)
        .replace(/{url}/g, latest.url);
    }

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.icon} ${latest.title}`)
      .setURL(latest.url)
      .setAuthor({ name: `${latest.channelName} • ${meta.name}`, url: latest.url })
      .setDescription(`[🔗 اضغط للمشاهدة](${latest.url})\n\n**الحساب:** @${latest.channelName}`)
      .setFooter({ text: `ZENO ${meta.name} Notifier • تلقائي` })
      .setTimestamp();

    if (latest.thumbnail) embed.setImage(latest.thumbnail);

    await channel.send({
      content: `${messageContent}\n${latest.url}`,
      embeds: [embed]
    });

    return true;
  } catch (err) {
    logger.error(`[Notifier] Failed to send embed:`, err.message);
    return false;
  }
}

/**
 * معالجة feed واحد — يفحص المحتوى ويرسل لو في جديد
 */
async function processFeed(client, feed) {
  try {
    let latest = null;

    if (feed.platform === 'youtube')      latest = await checkYouTube(feed.account_id);
    else if (feed.platform === 'twitch')  latest = await checkTwitch(feed.account_id);
    else if (feed.platform === 'tiktok')  latest = await checkTikTok(feed.account_id);

    if (!latest || !latest.id) return;

    // منع التكرار
    if (feed.last_video_id && feed.last_video_id === latest.id) return;

    // أول مرة: سجّل الـ ID بدون إرسال حتى لا يُرسل كل القديم
    if (!feed.last_video_id) {
      db.updateSocialFeedLastId(feed.id, latest.id);
      return;
    }

    // فيديو جديد — أرسل الإشعار وحدّث الـ ID
    await sendNotificationEmbed(client, feed, latest);
    db.updateSocialFeedLastId(feed.id, latest.id);

  } catch (e) {
    logger.error('[Notifier] processFeed error:', e.message);
  }
}

/**
 * اختبار فوري لـ feed — يرسل embed تجريبي بدون تحقق من الجديد
 */
async function testFeed(client, feed) {
  try {
    const channel = client.channels.cache.get(feed.channel_id)
      || await client.channels.fetch(feed.channel_id).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return { success: false, error: `لم يتم إيجاد القناة ${feed.channel_id}` };
    }

    const platformMeta = {
      youtube: { name: 'YouTube', color: '#FF0000', icon: '📺', url: 'https://www.youtube.com', thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
      twitch:  { name: 'Twitch',  color: '#9146FF', icon: '🔴', url: 'https://twitch.tv',       thumb: '' },
      tiktok:  { name: 'TikTok',  color: '#00F2FE', icon: '🎵', url: 'https://tiktok.com',      thumb: 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uomluhz_lm_q/tiktok_icon.png' }
    };

    const meta = platformMeta[feed.platform] || { name: feed.platform, color: '#7c3aed', icon: '🔔', url: '#', thumb: '' };

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.icon} هذه رسالة اختبار من نظام التنبيهات`)
      .setURL(meta.url)
      .setAuthor({ name: `@${feed.account_id} • ${meta.name}`, url: meta.url })
      .setDescription(
        `✅ **التنبيهات تعمل بشكل صحيح!**\n\n` +
        `عند نزول محتوى جديد من **@${feed.account_id}**\n` +
        `سيصل الإشعار تلقائياً في هذه القناة 🔔\n\n` +
        `[رابط تجريبي](${meta.url})`
      )
      .addFields(
        { name: '📡 المنصة', value: meta.name, inline: true },
        { name: '👤 الحساب', value: `@${feed.account_id}`, inline: true },
        { name: '📢 الروم', value: `<#${feed.channel_id}>`, inline: true }
      )
      .setFooter({ text: 'ZENO Social Notifier • رسالة اختبار' })
      .setTimestamp();

    if (meta.thumb) embed.setThumbnail(meta.thumb);

    let content = `🧪 **رسالة اختبار** — تنبيهات ${meta.name}`;
    if (feed.role_id) {
      const mention = feed.role_id === 'everyone' ? '@everyone' : `<@&${feed.role_id}>`;
      content = `${mention} ${content}`;
    }

    await channel.send({ content, embeds: [embed] });
    return { success: true };

  } catch (err) {
    logger.error('[Notifier] testFeed error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * تشغيل دورة الفحص التلقائي لكل الحسابات المفعلة
 */
function startSocialNotifier(client) {
  if (checkInterval) clearInterval(checkInterval);

  logger.info('🚀 [Notifier] Social media notifier started (YouTube / Twitch / TikTok).');

  // فحص كل دقيقتين
  checkInterval = setInterval(async () => {
    try {
      const activeFeeds = db.getAllActiveSocialFeeds();
      if (!activeFeeds || activeFeeds.length === 0) return;

      for (const feed of activeFeeds) {
        await processFeed(client, feed);
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (err) {
      logger.error('[Notifier] Error in feed checking cycle:', err.message);
    }
  }, 120000);

  // فحص أولي بعد 30 ثانية من الإقلاع
  setTimeout(async () => {
    try {
      const activeFeeds = db.getAllActiveSocialFeeds();
      for (const feed of activeFeeds) {
        await processFeed(client, feed);
      }
    } catch (e) {}
  }, 30000);
}

module.exports = {
  startSocialNotifier,
  checkYouTube,
  checkTwitch,
  checkTikTok,
  processFeed,
  testFeed
};
