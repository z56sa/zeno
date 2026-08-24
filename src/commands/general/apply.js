// ============================================================
// FILE: src/commands/general/apply.js
// نظام التقديمات مع Modal تفاعلي
// ============================================================
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const database = require("../../database/index");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("تقديم طلب توظيف في السيرفر"),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        // جلب التقديمات المفتوحة من قاعدة البيانات
        let openApps = [];
        try {
            openApps = database.db.prepare("SELECT * FROM applications WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC").all(guildId);
        } catch(e) {}

        if (!openApps.length) {
            return interaction.reply({ content: "❌ لا توجد فرص توظيف مفتوحة في هذا السيرفر حالياً.", ephemeral: true });
        }

        // إذا كان هناك تقديم واحد فقط، افتح Modal مباشرة
        const app = openApps[0];
        let questions = [];
        try { questions = JSON.parse(app.questions); } catch(e) { questions = ["ما الذي يجعلك مناسباً لهذا المنصب؟"]; }

        const modal = new ModalBuilder()
            .setCustomId(`apply_submit_${app.id}`)
            .setTitle(app.title.slice(0, 45));

        // أضف حقول الأسئلة (حد ديسكورد 5 حقول)
        const fields = questions.slice(0, 5).map((q, i) =>
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`q_${i}`)
                    .setLabel(q.slice(0, 45))
                    .setStyle(i === 0 ? TextInputStyle.Short : TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(500)
            )
        );

        modal.addComponents(...fields);
        await interaction.showModal(modal);
    }
};
