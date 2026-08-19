const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'clear',
  description: 'مسح وحذف رسائل الشات بسرعة',
  aliases: ['مسح', 'حذف', 'purge'],
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('مسح رسائل الشات')
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('عدد الرسائل المراد مسحها (من 1 إلى 100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('مسح رسائل عضو معين فقط (اختياري)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة الرسائل.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => { });

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('target');

    try {
      let messages = await interaction.channel.messages.fetch({ limit: 100 });

      if (targetUser) {
        messages = messages.filter(m => m.author.id === targetUser.id);
      }

      // تحويل المجموع إلى العدد المطلوب בדיוק وتجاهل الرسائل الأقدم من 14 يوم
      const messagesToDelete = Array.from(messages.values()).slice(0, amount);

      if (messagesToDelete.length === 0) {
        return interaction.editReply({ content: '❌ لم يتم العثور على رسائل مطابقة للحذف (تذكر أن ديسكورد لا يسمح بحذف رسائل أقدم من 14 يوم دفعة واحدة).' });
      }

      const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
      await interaction.editReply({ content: `✅ تم مسح **${deleted.size}** رسالة بنجاح.` });
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة مسح الرسائل. قد تكون بعض الرسائل أقدم من 14 يوماً.' });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ لا تملك صلاحية إدارة الرسائل.');
    }

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ يرجى تحديد عدد صحيح للرسائل بين 1 و 100. (مثال: `#clear 50`)');
    }

    const targetUser = message.mentions.users.first();

    try {
      await message.delete().catch(() => { });

      let messages = await message.channel.messages.fetch({ limit: 100 });

      if (targetUser) {
        messages = messages.filter(m => m.author.id === targetUser.id);
      }

      const messagesToDelete = Array.from(messages.values()).slice(0, amount);

      if (messagesToDelete.length === 0) {
        return message.channel.send('❌ لم يتم العثور على رسائل مطابقة للحذف.').then(msg => setTimeout(() => msg.delete().catch(() => { }), 4000));
      }

      const deleted = await message.channel.bulkDelete(messagesToDelete, true);
      const reply = await message.channel.send(`✅ تم مسح **${deleted.size}** رسالة بنجاح.`);
      setTimeout(() => reply.delete().catch(() => { }), 4000);
    } catch (error) {
      console.error(error);
      message.channel.send('❌ حدث خطأ أثناء مسح الرسائل (تأكد أن الرسائل ليست أقدم من 14 يوم).');
    }
  }
};