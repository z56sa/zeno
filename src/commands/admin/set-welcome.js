const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-welcome',
  description: 'إعداد نظام الترحيب بالأعضاء الجدد (روم، رسالة، بطاقة صورة)',
  aliases: ['ترحيب'],
  data: new SlashCommandBuilder()
    .setName('set-welcome')
    .setDescription('إعداد نظام الترحيب')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('روم إرسال الترحيب')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('رسالة الترحيب المخصصة ({user}, {server}, {memberCount})')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('image')
        .setDescription('تفعيل أو تعطيل بطاقة الصورة المصممة (Canvas)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const image = interaction.options.getBoolean('image');

    db.updateGuildSetting(interaction.guild.id, 'welcome_channel', channel.id);
    if (message !== null) {
      db.updateGuildSetting(interaction.guild.id, 'welcome_message', message);
    }
    if (image !== null) {
      db.updateGuildSetting(interaction.guild.id, 'welcome_image', image ? 1 : 0);
    }

    await interaction.reply({
      content: `✅ تم تحديث إعدادات الترحيب بنجاح!\n📍 الروم: <#${channel.id}>\n🖼️ بطاقة الترحيب المصممة: **${image === false ? 'معطلة' : 'مفعلة'}**`
    });
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ يرجى منشن الروم. مثال: `#set-welcome #welcome`');

    db.updateGuildSetting(message.guild.id, 'welcome_channel', channel.id);
    message.reply(`✅ تم تعيين روم الترحيب: <#${channel.id}>`);
  }
};
