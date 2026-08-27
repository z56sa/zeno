const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-tempvoice',
  description: 'تعيين روم إنشاء الرومات الصوتية المؤقتة (Join to Create)',
  aliases: ['رومات_مؤقتة'],
  data: new SlashCommandBuilder()
    .setName('set-tempvoice')
    .setDescription('تعيين روم الرومات الصوتية المؤقتة')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('الروم الصوتي الرئيسي (Join to Create)')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'temp_voice_channel', channel.id);

    await interaction.reply({
      content: `✅ تم تعيين الروم الصوتي الرئيسي بنجاح: <#${channel.id}>\n🔊 عندما يدخل أي عضو لهذا الروم، سيقوم البوت بإنشاء روم صوتي خاص به ونقله إليه فوراً!`
    });
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return message.reply('❌ يرجى منشن الروم الصوتي. مثال: `#set-tempvoice #VoiceChannel`');
    }

    db.updateGuildSetting(message.guild.id, 'temp_voice_channel', channel.id);
    message.reply(`✅ تم تعيين روم الرومات الصوتية المؤقتة: <#${channel.id}>`);
  }
};
