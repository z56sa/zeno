// ============================================================
// FILE: src/services/radioService.js
// ============================================================
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require("@discordjs/voice");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");

const STATIONS = {
    quran_makkah: { name: "قرآن كريم - مكة المكرمة", url: "https://stream.radiojar.com/0tpy1h0kxtzuv", emoji: "🕌", color: "#1a6b2e" },
    quran_egypt:  { name: "إذاعة القرآن الكريم - مصر", url: "https://n04.radiojar.com/8s5u5tpdtwzuv", emoji: "📖", color: "#2d6a2d" },
    sunnah:       { name: "راديو السنة النبوية", url: "https://stream.radiojar.com/8s5u5tpdtwzuv", emoji: "☀️", color: "#8b6914" },
    madinah:      { name: "إذاعة المدينة المنورة", url: "https://media.hikmah.com:7777/qurankareem64k", emoji: "🌙", color: "#1a4b6b" },
    quran_tafseer:{ name: "قرآن التفسير والعلوم", url: "https://stream.radiojar.com/4xcrjcectwzuv", emoji: "📚", color: "#4b1a6b" }
};

const activeConnections = new Map();

class RadioService {
    getStations() { return STATIONS; }
    getStation(key) { return STATIONS[key] || null; }
    isPlaying(guildId) { return activeConnections.has(guildId); }
    getCurrentStation(guildId) { const c = activeConnections.get(guildId); return c ? c.stationKey : null; }

    async play(voiceChannel, stationKey) {
        const station = STATIONS[stationKey];
        if (!station) throw new Error("محطة غير موجودة");
        await this.stop(voiceChannel.guild.id);
        const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: voiceChannel.guild.id, adapterCreator: voiceChannel.guild.voiceAdapterCreator, selfDeaf: false });
        try { await entersState(connection, VoiceConnectionStatus.Ready, 10_000); } catch(e) { connection.destroy(); throw new Error("لم يتمكن من الانضمام للقناة الصوتية"); }
        const player = createAudioPlayer();
        const playStream = () => { try { const r = createAudioResource(station.url, { inlineVolume: true }); if (r.volume) r.volume.setVolume(0.8); player.play(r); } catch(e) {} };
        playStream();
        connection.subscribe(player);
        player.on(AudioPlayerStatus.Idle, () => setTimeout(playStream, 2000));
        player.on("error", (err) => console.error("[Radio] Error:", err.message));
        connection.on(VoiceConnectionStatus.Disconnected, async () => { try { await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5_000), entersState(connection, VoiceConnectionStatus.Connecting, 5_000)]); } catch(e) { activeConnections.delete(voiceChannel.guild.id); try { connection.destroy(); } catch(_) {} } });
        activeConnections.set(voiceChannel.guild.id, { connection, player, stationKey, channelId: voiceChannel.id, startedAt: Date.now() });
        return station;
    }

    async stop(guildId) {
        const c = activeConnections.get(guildId);
        if (!c) return false;
        try { c.player.stop(true); c.connection.destroy(); } catch(e) {}
        activeConnections.delete(guildId);
        return true;
    }

    buildNowPlayingEmbed(station, voiceChannel, username) {
        const conn = activeConnections.get(voiceChannel.guild.id);
        const mins = conn ? Math.floor((Date.now() - conn.startedAt) / 60000) : 0;
        return new EmbedBuilder().setColor(station.color).setTitle(station.emoji + " " + station.name).setDescription("البث مباشر في القناة: **" + voiceChannel.name + "**").addFields({ name: "📻 المحطة", value: station.name, inline: true }, { name: "⏱️ المدة", value: mins + " دقيقة", inline: true }, { name: "🎵 الحالة", value: "🔴 بث مباشر", inline: true }).setFooter({ text: "بدأ بواسطة " + username + " • ZENO Radio" }).setTimestamp();
    }

    buildControlButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("radio_stop").setLabel("إيقاف").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("radio_stations").setLabel("تغيير المحطة").setEmoji("📻").setStyle(ButtonStyle.Secondary)
        );
    }

    buildStationsMenu() {
        const options = Object.entries(STATIONS).map(([key, s]) => ({ label: s.name, value: key, emoji: s.emoji }));
        return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("radio_select_station").setPlaceholder("اختر محطة إذاعية...").addOptions(options));
    }
}

module.exports = new RadioService();
