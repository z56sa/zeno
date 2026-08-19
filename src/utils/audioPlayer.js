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
            return interaction.reply({ content: '❌ يجب أن تكون في روم صوتي تشغيل موسيقى!', ephemeral: true });
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
                    return interaction.reply({ content: '❌ لم يتم العثور على نتائج مطابقة لبحثك!', ephemeral: true });
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
            return interaction.reply({ content: '❌ حدث خطأ أثناء محاولة جلب المقطع الصوتي.', ephemeral: true });
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
                return interaction.reply({ content: '❌ فشل الاتصال بالروم الصوتي.', ephemeral: true });
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
            return interaction.reply({ content: '❌ لا توجد مقاطع تعمل حالياً لتخطيها!', ephemeral: true });
        }
        serverQueue.player.stop();
        return interaction.reply({ content: '⏭️ تم تخطي المقطع الحالي بنجاح.' });
    }

    /**
     * إيقاف البوت ومغادرة الروم الصوتي
     */
    stop(interaction) {
        const serverQueue = queues.get(interaction.guild.id);
        if (!serverQueue) {
            return interaction.reply({ content: '❌ البوت ليس متصلاً بأي روم صوتي!', ephemeral: true });
        }

        serverQueue.queue = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queues.delete(interaction.guild.id);

        return interaction.reply({ content: '⏹️ تم إيقاف المشغل ومغادرة الروم الصوتي.' });
    }
}

module.exports = new AudioPlayerManager();