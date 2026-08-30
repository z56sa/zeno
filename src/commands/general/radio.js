// ============================================================
// FILE: src/commands/general/radio.js
// ============================================================
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const radioService = require("../../services/radioService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("radio")
        .setDescription("تشغيل راديو إسلامي أو قرآن كريم في القناة الصوتية")
        .addSubcommand(sub =>
            sub.setName("play")
                .setDescription("تشغيل محطة إذاعية أو قرآن كريم")
                .addStringOption(opt =>
                    opt.setName("station")
                        .setDescription("المحطة الإذاعية")
                        .setRequired(false)
                        .addChoices(
                            { name: "🕌 قرآن كريم - مكة", value: "quran_makkah" },
                            { name: "📖 إذاعة القرآن - مصر", value: "quran_egypt" },
                            { name: "☀️ راديو السنة النبوية", value: "sunnah" },
                            { name: "🌙 إذاعة المدينة المنورة", value: "madinah" },
                            { name: "📚 قرآن التفسير والعلوم", value: "quran_tafseer" }
                        )
                )
        )
        .addSubcommand(sub => sub.setName("stop").setDescription("إيقاف البث الحالي"))
        .addSubcommand(sub => sub.setName("list").setDescription("عرض قائمة المحطات")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(false);

        if (sub === "stop") {
            const stopped = await radioService.stop(interaction.guild.id);
            return interaction.reply({ content: stopped ? "⏹️ تم إيقاف البث." : "❌ لا يوجد بث نشط حالياً.", flags: 64 });
        }

        if (sub === "list") {
            const stations = radioService.getStations();
            const list = Object.entries(stations).map(([k, s]) => `${s.emoji} **${s.name}**`).join("\n");
            return interaction.reply({ content: `📻 **المحطات المتاحة:**\n${list}`, flags: 64 });
        }

        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) return interaction.reply({ content: "❌ يجب أن تكون في قناة صوتية أولاً!", flags: 64 });

        await interaction.deferReply();
        const stationKey = interaction.options.getString("station") || "quran_makkah";

        try {
            const station = await radioService.play(voiceChannel, stationKey);
            const embed = radioService.buildNowPlayingEmbed(station, voiceChannel, interaction.user.username);
            const buttons = radioService.buildControlButtons();
            await interaction.editReply({ embeds: [embed], components: [buttons] });
        } catch(e) {
            await interaction.editReply({ content: `❌ خطأ: ${e.message}` });
        }
    }
};
