const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'clear',
  description: 'مسح عدد محدد من الرسائل في الروم',
  aliases: ['مسح', 'purge'],
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('مسح عدد محدد من الرسائل في الروم')
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('عدد الرسائل المراد مسحها (1 - 100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية مسح الرسائل.', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);

    if (!deleted) {
      return interaction.reply({ content: '❌ تعذر مسح الرسائل (الرسائل التي مضى عليها أكثر من 14 يوماً لا يمكن للبوت مسحها دفعة واحدة).', ephemeral: true });
    }

    const reply = await interaction.reply({ content: `🧹 تم مسح **${deleted.size}** رسالة بنجاح!`, fetchReply: true });
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ لا تملك صلاحية مسح الرسائل.');
    }

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ يرجى كتابة عدد صحيح بين 1 و 100.');
    }

    await message.delete().catch(() => {});
    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);

    if (!deleted) {
      return message.channel.send('❌ تعذر مسح الرسائل القديمة.');
    }

    const reply = await message.channel.send(`🧹 تم مسح **${deleted.size}** رسالة بنجاح!`);
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  }
};
