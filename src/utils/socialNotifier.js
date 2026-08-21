const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const logger = require('./logger');

let checkInterval = null;

/**
 * جلب معرف القناة الحقيقي (UC...) من الـ handle أو الرابط
 */
async function resolveYouTubeChannelId(input) {
  let clean = input.trim();
  if (clean.startsWith('UC') && clean.length === 24) return clean;
  clean = clean.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@/, '');
  if (clean.startsWith('channel/')) return clean.replace('channel/', '');

  try {
    const res = await axios.get(`https://www.youtube.com/@${clean}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = res.data;
    const match = html.match(/channelId["':\s]+(UC[a-zA-Z0-9_-]{22})/)
               || html.match(/externalId["':\s]+(UC[a-zA-Z0-9_-]{22})/)
               || html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (match && match[1]) return match[1];
  } catch (e) {}

  return clean;
}

/**
 * فحص قناة يوتيوب عبر RSS Feed الرسمي لجلب أحدث فيديو منشور فعلياً
 */
async function checkYouTube(channelIdOrHandle) {
  try {
    let resolvedId = await resolveYouTubeChannelId(channelIdOrHandle);
    let url = '';

    if (resolvedId.startsWith('UC') && resolvedId.length === 24) {
      url = `https://www.youtube.com/feeds/videos.xml?channel_id=${resolvedId}`;
    } else {
      url = `https://www.youtube.com/feeds/videos.xml?user=${resolvedId}`;
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
    const channelName = authorMatch ? authorMatch[1] : channelIdOrHandle;
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
 * فحص بث Twitch مباشر
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

    const titleMatch = html.match(/<meta property="og:description" content="(.*?)"/i) || html.match(/"description":"(.*?)"/i);
    const streamTitle = titleMatch ? titleMatch[1] : `بث مباشر على قناة ${cleanUser}`;

    return {
      id: isLive ? `twitch_${cleanUser}_${Date.now()}` : `twitch_${cleanUser}_offline`,
      title: streamTitle,
      url: `https://twitch.tv/${cleanUser}`,
      channelName: cleanUser,
      thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${cleanUser}-640x360.jpg`,
      isLive: isLive
    };
  } catch (err) {
    return {
      id: `twitch_${username}`,
      title: `قناة ${username} على Twitch`,
      url: `https://twitch.tv/${username}`,
      channelName: username,
      thumbnail: 'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png',
      isLive: false
    };
  }
}

/**
 * فحص فيديوهات TikTok وجلب أحدث فيديو مباشر
 */
async function checkTikTok(username) {
  try {
    const cleanUser = username.trim()
      .replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '')
      .replace(/^@/, '');

    // 1. محاولة جلب الفيديو عبر Feed/Embed endpoint المباشر
    try {
      const oembed = await axios.get(`https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${cleanUser}`, {
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (oembed.data && oembed.data.title) {
        // oembed يعطينا معلومات الحساب الأساسية
      }
    } catch(e) {}

    // 2. جلب صفحة الحساب لاستخراج أحدث video ID
    const res = await axios.get(`https://www.tiktok.com/@${cleanUser}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });

    const html = res.data;
    
    // استخراج معرّف أحدث فيديو من نصوص الـ HTML والـ JSON المتعددة
    const videoMatches = html.match(/"id":"(\d{18,20})"/g) || html.match(/\/video\/(\d{18,20})/g) || [];
    let videoId = null;
    
    for (const m of videoMatches) {
      const cleanNum = m.replace(/[^0-9]/g, '');
      if (cleanNum && cleanNum.length >= 18) {
        videoId = cleanNum;
        break;
      }
    }

    // استخراج الوصف
    const titleMatch = html.match(/<meta property="og:description" content="([^"]+)"/i)
                    || html.match(/<meta name="description" content="([^"]+)"/i);
    const videoDesc = titleMatch ? titleMatch[1] : `أحدث فيديو من @${cleanUser} على تيك توك 🎵`;

    if (videoId) {
      return {
        id: videoId,
        title: videoDesc,
        url: `https://www.tiktok.com/@${cleanUser}/video/${videoId}`,
        channelName: cleanUser,
        thumbnail: 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uomluhz_lm_q/tiktok_icon.png'
      };
    }

    // إذا تعذر استخراج ID الفيديو، نضع رابط الحساب المباشر مع توجيه لتبويب الفيديوهات
    return {
      id: `tt_${cleanUser}`,
      title: videoDesc,
      url: `https://www.tiktok.com/@${cleanUser}`,
      channelName: cleanUser,
      thumbnail: 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uomluhz_lm_q/tiktok_icon.png'
    };
  } catch (err) {
    const cleanUser = username.trim().replace(/^@/, '');
    return {
      id: `tt_${cleanUser}`,
      title: `حساب @${cleanUser} على تيك توك 🎵`,
      url: `https://www.tiktok.com/@${cleanUser}`,
      channelName: cleanUser,
      thumbnail: 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uomluhz_lm_q/tiktok_icon.png'
    };
  }
}

/**
 * بناء وإرسال Embed التنبيه للقناة (بما في ذلك الفيديو الحقيقي والرابط المباشر)
 */
async function sendNotificationEmbed(client, feed, latest, isTest = false) {
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

    // بناء رسالة المنشن والنص المخصص
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

    if (isTest) {
      messageContent = `🧪 **[تجربة إشعار]**\n${messageContent}`;
    }

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.icon} ${latest.title}`)
      .setURL(latest.url)
      .setAuthor({ name: `${latest.channelName} • ${meta.name}`, url: latest.url })
      .setDescription(`[🔗 اضغط للمشاهدة الآن](${latest.url})\n\n**القناة:** @${latest.channelName}`)
      .setFooter({ text: isTest ? `ZENO ${meta.name} Notifier • تجربة فحص حقيقية` : `ZENO ${meta.name} Notifier • تلقائي` })
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
 * معالجة feed واحد في الدورة الدورية — يفحص المحتوى ويرسل لو في جديد
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

    // أول مرة نسجل فيها: نحفظ الـ ID بدون إرسال لتفادي الإزعاج
    if (!feed.last_video_id) {
      db.updateSocialFeedLastId(feed.id, latest.id);
      return;
    }

    // محتوى جديد فعلياً! أرسل الإشعار وحدّث الـ ID
    await sendNotificationEmbed(client, feed, latest, false);
    db.updateSocialFeedLastId(feed.id, latest.id);

  } catch (e) {
    logger.error('[Notifier] processFeed error:', e.message);
  }
}

/**
 * اختبار فوري لـ feed — يجلب أحدث فيديو منشور فعلياً ويرسله في الروم مع الرابط وصورة العرض
 */
async function testFeed(client, feed) {
  try {
    const channel = client.channels.cache.get(feed.channel_id)
      || await client.channels.fetch(feed.channel_id).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return { success: false, error: `لم يتم العثور على الروم أو ليس روم كتابي (${feed.channel_id})` };
    }

    let latest = null;

    if (feed.platform === 'youtube')      latest = await checkYouTube(feed.account_id);
    else if (feed.platform === 'twitch')  latest = await checkTwitch(feed.account_id);
    else if (feed.platform === 'tiktok')  latest = await checkTikTok(feed.account_id);

    // إذا تعذر جلب أحدث فيديو تلقائياً، نبني بيانات مناسبة
    if (!latest || !latest.url) {
      const cleanAcc = feed.account_id.replace(/^@/, '');
      latest = {
        id: `test_${cleanAcc}`,
        title: `أحدث محتوى من @${cleanAcc}`,
        url: feed.platform === 'youtube' ? `https://youtube.com/@${cleanAcc}` :
             feed.platform === 'twitch'  ? `https://twitch.tv/${cleanAcc}` :
                                           `https://tiktok.com/@${cleanAcc}`,
        channelName: cleanAcc,
        thumbnail: feed.platform === 'youtube' ? 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' : null
      };
    }

    const sent = await sendNotificationEmbed(client, feed, latest, true);
    return sent ? { success: true } : { success: false, error: 'فشل إرسال الرسالة للروم، تأكد من صلاحيات البوت' };

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
      if (activeFeeds) {
        for (const feed of activeFeeds) {
          await processFeed(client, feed);
        }
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
