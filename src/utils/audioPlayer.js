const {
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const playdl = require('play-dl'); // مكتبة ممتازة لجلب روابط وسائط الصوت

// خريطة لتخزين طابور التشغيل لكل سيرفر: guildId => { connection, player, queue: [], current, channel }
const queues = new Map();

class AudioPlayerManager {
    /**
     * الانضمام للروم الصوتي وبدء التشغيل أو إضافته للطابور
     */
    async play(interaction, query) {
        const channel = interaction.member?.voice?.channel;
        if (!channel) {
            return interaction.reply({ content: '❌ يجب أن تكون في روم صوتي تشغيل موسيقى!', flags: 64 });
        }

        const guildId = interaction.guild.id;
        let serverQueue = queues.get(guildId);

        // التحقق من الرابط أو البحث
        let streamInfo;
        try {
            if (playdl.yt_validate(query) === 'video') {
                const fetched = await playdl.video_info(query);
                streamInfo = {
                    title: fetched.video_details.title,
                    url: fetched.video_details.url,
                    duration: fetched.video_details.durationRaw,
                    thumbnail: fetched.video_details.thumbnails[0]?.url,
                    requestedBy: interaction.user
                };
            } else {
                // البحث في يوتيوب في حال لم يكن رابطاً مباشراً
                const searched = await playdl.search(query, { limit: 1 });
                if (!searched || searched.length === 0) {
                    return interaction.reply({ content: '❌ لم يتم العثور على نتائج مطابقة لبحثك!', flags: 64 });
                }
                streamInfo = {
                    title: searched[0].title,
                    url: searched[0].url,
                    duration: searched[0].durationRaw,
                    thumbnail: searched[0].thumbnails[0]?.url,
                    requestedBy: interaction.user
                };
            }
        } catch (err) {
            console.error('خطأ في جلب بيانات الصوت:', err);
            return interaction.reply({ content: '❌ حدث خطأ أثناء محاولة جلب المقطع الصوتي.', flags: 64 });
        }

        // إذا لم يكن هناك طابور تشغيل لهذا السيرفر، أنشئ واحداً جديداً
        if (!serverQueue) {
            serverQueue = {
                guild: interaction.guild,
                channel: channel,
                textChannel: interaction.channel,
                connection: null,
                player: createAudioPlayer(),
                queue: [],
                current: null,
            };

            queues.set(guildId, serverQueue);
            serverQueue.queue.push(streamInfo);

            try {
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });

                serverQueue.connection = connection;
                connection.subscribe(serverQueue.player);

                // ربط مشغل الصوت بالأحداث
                this._setupPlayerEvents(guildId);

                await interaction.reply({ content: `🎵 تم الانضمام وجاري تشغيل: **${streamInfo.title}**` });
                this._playNext(guildId);
            } catch (err) {
                console.error('فشل الاتصال بالروم الصوتي:', err);
                queues.delete(guildId);
                return interaction.reply({ content: '❌ فشل الاتصال بالروم الصوتي.', flags: 64 });
            }
        } else {
            // السيرفر يعمل مسبقاً، أضف الأغنية للطابور
            serverQueue.queue.push(streamInfo);
            return interaction.reply({ content: `✅ تم إضافتها إلى الطابور: **${streamInfo.title}** (الترتيب #${serverQueue.queue.length})` });
        }
    }

    /**
     * تشغيل المقطع التالي في الطابور
     */
    async _playNext(guildId) {
        const serverQueue = queues.get(guildId);
        if (!serverQueue) return;

        if (serverQueue.queue.length === 0) {
            // انتهى الطابور، انتظر قليلاً أو اخرج
            serverQueue.current = null;
            return;
        }

        const song = serverQueue.queue.shift();
        serverQueue.current = song;

        try {
            const streamSource = await playdl.stream(song.url);
            const resource = createAudioResource(streamSource.stream, {
                inputType: streamSource.type
            });

            serverQueue.player.play(resource);
        } catch (err) {
            console.error('خطأ أثناء تشغيل الدفق الصوتي:', err);
            this._playNext(guildId);
        }
    }

    /**
     * إعداد أحداث مشغل الصوت (انتهاء الأغنية، الأخطاء)
     */
    _setupPlayerEvents(guildId) {
        const serverQueue = queues.get(guildId);
        if (!serverQueue) return;

        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            // انتهاء المقطع الحالي، انتقل للتالي
            this._playNext(guildId);
        });

        serverQueue.player.on('error', error => {
            console.error('خطأ في مشغل الصوت:', error);
            this._playNext(guildId);
        });
    }

    /**
     * تخطي الأغنية الحالية
     */
    skip(interaction) {
        const serverQueue = queues.get(interaction.guild.id);
        if (!serverQueue || !serverQueue.current) {
            return interaction.reply({ content: '❌ لا توجد مقاطع تعمل حالياً لتخطيها!', flags: 64 });
        }
        serverQueue.player.stop();
        return interaction.reply({ content: '⏭️ تم تخطي المقطع الحالي بنجاح.' });
    }

    /**
     * إيقاف البوت ومغادرة الروم الصوتي
     */
    stop(interaction) {
        const guildId = typeof interaction === 'string' ? interaction : interaction?.guild?.id;
        const serverQueue = queues.get(guildId);
        if (!serverQueue) {
            if (typeof interaction === 'object' && interaction.reply) {
                return interaction.reply({ content: '❌ البوت ليس متصلاً بأي روم صوتي!', flags: 64 });
            }
            return false;
        }

        serverQueue.queue = [];
        try { serverQueue.player.stop(); } catch(e) {}
        try { serverQueue.connection.destroy(); } catch(e) {}
        queues.delete(guildId);

        if (typeof interaction === 'object' && interaction.reply) {
            return interaction.reply({ content: '⏹️ تم إيقاف المشغل ومغادرة الروم الصوتي.' });
        }
        return true;
    }

    /**
     * تشغيل بث راديو مباشر / إذاعة قرآن كريم 24/7
     */
    async playStream(voiceChannel, streamUrl, name = 'إذاعة القرآن الكريم') {
        if (!voiceChannel) throw new Error('الروم الصوتي غير صالح');
        const guildId = voiceChannel.guild.id;

        // إيقاف أي بث سابق
        let serverQueue = queues.get(guildId);
        if (serverQueue) {
            try { serverQueue.player.stop(); } catch(e) {}
            try { serverQueue.connection.destroy(); } catch(e) {}
            queues.delete(guildId);
        }

        const player = createAudioPlayer();
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        // انتظار اكتمال مصافحة الاتصال الصوتي مع ديسكورد
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (err) {
            console.error('Voice Connection Ready Timeout:', err);
        }

        const axios = require('axios');
        const { StreamType } = require('@discordjs/voice');

        const streamResponse = await axios.get(streamUrl, {
            responseType: 'stream',
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const resource = createAudioResource(streamResponse.data, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });
        if (resource.volume) resource.volume.setVolume(1.0);

        connection.subscribe(player);
        player.play(resource);

        serverQueue = {
            guild: voiceChannel.guild,
            channel: voiceChannel,
            connection: connection,
            player: player,
            queue: [],
            current: { title: name, url: streamUrl, isRadio: true }
        };
        queues.set(guildId, serverQueue);

        // معالجة الأخطاء وإعادة الاتصال التلقائي في حال انقطاع البث
        player.on('error', err => {
            console.error('Radio Stream Error, attempting reconnect:', err);
            setTimeout(async () => {
                if (queues.has(guildId)) {
                    try {
                        const newStream = await axios.get(streamUrl, { responseType: 'stream', timeout: 10000 });
                        const newResource = createAudioResource(newStream.data, { inputType: StreamType.Arbitrary, inlineVolume: true });
                        player.play(newResource);
                    } catch(e) {}
                }
            }, 3000);
        });

        player.on(AudioPlayerStatus.Idle, () => {
            if (queues.has(guildId)) {
                setTimeout(async () => {
                    try {
                        const newStream = await axios.get(streamUrl, { responseType: 'stream', timeout: 10000 });
                        const newResource = createAudioResource(newStream.data, { inputType: StreamType.Arbitrary, inlineVolume: true });
                        player.play(newResource);
                    } catch(e) {}
                }, 2000);
            }
        });

        return serverQueue;
    }

    /**
     * التحقق من حالة الراديو في سيرفر معين
     */
    getRadioStatus(guildId) {
        const serverQueue = queues.get(guildId);
        if (!serverQueue) return { isPlaying: false, channel: null, current: null };
        return {
            isPlaying: true,
            channelId: serverQueue.channel?.id,
            channelName: serverQueue.channel?.name,
            current: serverQueue.current
        };
    }
}

const manager = new AudioPlayerManager();

// قائمة محطات وإذاعات القرآن الكريم المباشرة 100% شغالة
manager.quranStations = {
    'cairo_radio': { name: 'إذاعة القرآن الكريم من القاهرة 🇪🇬', url: 'https://qurango.net/radio/tarateel' },
    'makkah_radio': { name: 'إذاعة القرآن الكريم من مكة المكرمة 🇸🇦', url: 'http://live.mp3quran.net:9992/' },
    'afasy': { name: 'الشيخ مشاري راشد العفاسي 📖', url: 'https://qurango.net/radio/mishary_alafasi' },
    'abdulbasit': { name: 'الشيخ عبدالباسط عبدالصمد (المجود) 📖', url: 'https://qurango.net/radio/abdulbasit_abdulsamad_mojawwad' },
    'muaiqly': { name: 'الشيخ ماهر المعيقلي 📖', url: 'https://qurango.net/radio/maher_al_muaiqly' },
    'dosari': { name: 'الشيخ ياسر الدوسري 📖', url: 'https://qurango.net/radio/tarateel' },
    'ghamdi': { name: 'الشيخ سعد الغامدي 📖', url: 'https://qurango.net/radio/saad_alghamdi' },
    'sudais': { name: 'الشيخ عبدالرحمن السديس 📖', url: 'https://qurango.net/radio/abdulrahman_alsudaes' },
    'shuraim': { name: 'الشيخ سعود الشريم 📖', url: 'https://qurango.net/radio/saud_alshuraim' },
    'ajmy': { name: 'الشيخ أحمد العجمي 📖', url: 'https://qurango.net/radio/ahmad_alajmy' },
    'shatri': { name: 'الشيخ أبو بكر الشاطري 📖', url: 'https://qurango.net/radio/shaik_abu_bakr_al_shatri' }
};

module.exports = manager;