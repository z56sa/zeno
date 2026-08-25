// ============================================================
// FILE: src/commands/general/apply.js
// نظام التقديمات التفاعلي الشامل (Discord Embed + Button + Modal)
// ============================================================
const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} = require("discord.js");
const database = require("../../database/index");
const config = require("../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("فتح قائمة التقديمات أو إرسال رسالة التقديمات في القناة")
    .addSubcommand(sub =>
      sub
        .setName("form")
        .setDescription("التقديم على وظيفة أو رتبة في السيرفر")
    )
    .addSubcommand(sub =>
      sub
        .setName("send_panel")
        .setDescription("إرسال رسالة وبانل التقديمات في قناة محددة (للمشرفين)")
        .addChannelOption(opt => opt.setName("channel").setDescription("القناة المراد إرسال رسالة التقديم فيها").setRequired(false))
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const subCmd = interaction.options.getSubcommand(false) || "form";

    // 1. إرسال بانل التقديم في قناة محددة
    if (subCmd === "send_panel") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ ليس لديك صلاحية لإرسال لوحة التقديمات.", ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
      const apps = database.getApplications(guildId).filter(a => a.status === 'open');

      if (!apps || apps.length === 0) {
        return interaction.reply({ content: "❌ لا توجد نماذج تقديم مفتوحة حالياً. يمكنك إنشاء نموذج جديد من الداشبورد.", ephemeral: true });
      }

      const panelEmbed = new EmbedBuilder()
        .setColor("#9333ea")
        .setTitle(`📝 التقديم والتوظيف في سيرفر ${interaction.guild.name}`)
        .setDescription(`مرحباً بك! يمكنك التقديم على الرتب والوظائف المتاحة بالسيرفر بسهولة.\n\nاضغط على الزر أدناه للبدء وتعبئة استمارة التقديم. 🚀`)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      if (apps.length === 1) {
        const app = apps[0];
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_apply_${app.id}`)
            .setLabel(`تقديم على: ${app.title.slice(0, 30)} 📝`)
            .setStyle(ButtonStyle.Primary)
        );
        await targetChannel.send({ embeds: [panelEmbed], components: [row] });
      } else {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("select_apply_form")
          .setPlaceholder("اختر نموذج التقديم المناسب...")
          .addOptions(
            apps.map(a => ({
              label: a.title.slice(0, 50),
              description: (a.description || "تقديم وظيفي").slice(0, 80),
              value: String(a.id),
              emoji: "📝"
            }))
          );
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await targetChannel.send({ embeds: [panelEmbed], components: [row] });
      }

      return interaction.reply({ content: `✅ تم إرسال بانل التقديم بنجاح في القناة ${targetChannel}!`, ephemeral: true });
    }

    // 2. التقديم المباشر للعضو (/apply form)
    let openApps = [];
    try {
      openApps = database.getApplications(guildId).filter(a => a.status === 'open');
    } catch(e) {}

    if (!openApps.length) {
      return interaction.reply({ content: "❌ لا توجد فرص توظيف مفتوحة في هذا السيرفر حالياً.", ephemeral: true });
    }

    if (openApps.length === 1) {
      const app = openApps[0];
      return openModalForApp(interaction, app);
    }

    // عدة نماذج -> قائمة اختيار
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_apply_form")
      .setPlaceholder("اختر استمارة التقديم...")
      .addOptions(
        openApps.map(a => ({
          label: a.title.slice(0, 50),
          description: (a.description || "تقديم وظيفي").slice(0, 80),
          value: String(a.id),
          emoji: "📝"
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return interaction.reply({ content: "📋 **الرجاء اختيار استمارة التقديم المطلوبة:**", components: [row], ephemeral: true });
  }
};

function openModalForApp(interaction, app) {
  let questions = [];
  try {
    questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
  } catch(e) {
    questions = [{ text: "ما الذي يجعلك مناسباً لهذا المنصب؟", type: "paragraph" }];
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_submit_app_${app.id}`)
    .setTitle(`📝 ${app.title.slice(0, 40)}`);

  const fields = questions.slice(0, 5).map((q, i) => {
    const qText = typeof q === 'object' ? (q.text || `السؤال ${i+1}`) : String(q);
    const isShort = typeof q === 'object' && q.type === 'short';

    return new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`q_${i}`)
        .setLabel(qText.slice(0, 45))
        .setStyle(isShort ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    );
  });

  modal.addComponents(...fields);
  return interaction.showModal(modal);
}
