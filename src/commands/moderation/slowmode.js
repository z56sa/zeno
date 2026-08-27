const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'slowmode',
  description: 'تحديد سرعة إرسال الرسائل (Slowmode) في الروم',
  aliases: ['سلومود'],
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('تحديد سرعة إرسال الرسائل بالثواني')
    .addIntegerOption(opt =>
      opt.setName('seconds')
        .setDescription('المدة بالثواني (0 للتعطيل)')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة القنوات.', flags: 64 });
    }

    const seconds = interaction.options.getInteger('seconds');
    await interaction.channel.setRateLimitPerUser(seconds);

    if (seconds === 0) {
      await interaction.reply('✅ تم تعطيل وضع السلومود (Slowmode) في هذا الروم.');
    } else {
      await interaction.reply(`⏱️ تم ضبط السلومود على **${seconds}** ثانية.`);
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ لا تملك صلاحية إدارة القنوات.');
    }

    const seconds = parseInt(args[0], 10);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      return message.reply('❌ يرجى تحديد الثواني بين 0 و 21600.');
    }

    await message.channel.setRateLimitPerUser(seconds);
    if (seconds === 0) {
      message.reply('✅ تم تعطيل وضع السلومود.');
    } else {
      message.reply(`⏱️ تم ضبط السلومود على **${seconds}** ثانية.`);
    }
  }
};
