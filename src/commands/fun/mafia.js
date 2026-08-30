const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

// لعبة المافيا الكاملة
const activeGames = new Map();

const ROLES = {
  MAFIA: { name: 'مافيا', emoji: '🔫', color: '#ED4245', description: 'أنت من المافيا! تعاون مع فريقك ليلاً لتحذف أحد المواطنين.' },
  DETECTIVE: { name: 'محقق', emoji: '🔍', color: '#3498DB', description: 'أنت المحقق! كل ليلة يمكنك التحقق من هوية أحد اللاعبين.' },
  DOCTOR: { name: 'طبيب', emoji: '💊', color: '#57F287', description: 'أنت الطبيب! كل ليلة يمكنك حماية لاعب واحد من المافيا.' },
  CITIZEN: { name: 'مواطن', emoji: '👤', color: '#95A5A6', description: 'أنت مواطن عادي! صوّت نهاراً لكشف المافيا.' },
};

function assignRoles(playerCount) {
  const roles = [];
  const mafiaCount = Math.max(1, Math.floor(playerCount / 4));
  
  for (let i = 0; i < mafiaCount; i++) roles.push('MAFIA');
  roles.push('DETECTIVE');
  if (playerCount >= 5) roles.push('DOCTOR');
  while (roles.length < playerCount) roles.push('CITIZEN');
  
  return roles.sort(() => Math.random() - 0.5);
}

module.exports = {
  name: 'mafia',
  description: 'لعبة المافيا الاجتماعية الكاملة!',
  aliases: ['مافيا'],
  data: new SlashCommandBuilder()
    .setName('mafia')
    .setDescription('لعبة المافيا - من هو عضو المافيا بينكم؟'),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ يوجد لعبة مافيا جارية في هذه القناة!', flags: 64 });
    }

    const players = new Map(); // userId -> role
    players.set(interaction.user.id, null);
    activeGames.set(interaction.channelId, true);

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🔫 لعبة المافيا!')
      .setDescription(
        `**${interaction.user.username}** بدأ لعبة المافيا!\n\n` +
        `⚡ **كيف تلعب؟**\n` +
        `• كل لاعب يحصل على دور سري (مافيا، محقق، طبيب، مواطن)\n` +
        `• نهاراً: الجميع يصوت لطرد مشتبه به\n` +
        `• ليلاً: المافيا تختار ضحية!\n\n` +
        `👥 **اللاعبون (1):** ${interaction.user.username}\n` +
        `⚠️ يجب وجود **4 لاعبين** على الأقل!`
      )
      .setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mafia_join').setLabel('🎭 انضم للعبة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mafia_start').setLabel('▶️ ابدأ اللعبة').setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'mafia_join') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', flags: 64 });
        players.set(btn.user.id, null);
        const list = [...players.keys()].map(id => `<@${id}>`).join(', ');
        const updatedEmbed = EmbedBuilder.from(embed).setDescription(
          `**${interaction.user.username}** بدأ لعبة المافيا!\n\n` +
          `👥 **اللاعبون (${players.size}):** ${list}\n\n` +
          `⚠️ يجب وجود **4 لاعبين** على الأقل!`
        );
        await msg.edit({ embeds: [updatedEmbed] });
        await btn.reply({ content: `✅ انضممت للعبة المافيا! عدد اللاعبين: **${players.size}**`, flags: 64 });
      }

      if (btn.customId === 'mafia_start' && btn.user.id === interaction.user.id) {
        if (players.size < 4) return btn.reply({ content: '❌ يجب وجود **4 لاعبين** على الأقل لبدء لعبة المافيا!', flags: 64 });
        collector.stop('manual');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(interaction.channelId);

      if (players.size < 4) {
        return msg.edit({
          embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ المافيا').setDescription('لم يكفِ عدد اللاعبين! (يجب 4 على الأقل)')],
          components: []
        });
      }

      // توزيع الأدوار
      const playerIds = [...players.keys()];
      const roles = assignRoles(playerIds.length);
      const roleAssignments = {};
      
      playerIds.forEach((id, index) => {
        roleAssignments[id] = roles[index];
      });

      // إرسال الأدوار بشكل سري
      let sentCount = 0;
      for (const [userId, role] of Object.entries(roleAssignments)) {
        try {
          const user = await interaction.client.users.fetch(userId);
          const roleInfo = ROLES[role];
          await user.send({
            embeds: [
              new EmbedBuilder()
                .setColor(roleInfo.color)
                .setTitle(`🎭 دورك في لعبة المافيا: ${roleInfo.emoji} ${roleInfo.name}`)
                .setDescription(roleInfo.description)
                .setFooter({ text: 'احتفظ بسرّك! لا تكشف دورك لأحد!' })
            ]
          });
          sentCount++;
        } catch (e) { /* DMs مغلقة */ }
      }

      // الملخص
      const mafiaCount = Object.values(roleAssignments).filter(r => r === 'MAFIA').length;
      const citizenCount = playerIds.length - mafiaCount;

      const startEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🔫 لعبة المافيا - انطلقت!')
        .setDescription(
          `📨 **تم إرسال الأدوار السرية لكل اللاعبين!** (${sentCount}/${playerIds.length})\n\n` +
          `👥 **اللاعبون:** ${playerIds.map(id => `<@${id}>`).join(', ')}\n\n` +
          `📊 **التوزيع:** ${mafiaCount} مافيا / ${citizenCount} مواطن\n\n` +
          `🌞 **النهار الأول:**\nناقشوا بينكم من يبدو مشبوهاً، ثم صوّتوا لطرده!\n\n` +
          `⚡ **شرط الفوز:**\n• 🔫 المافيا تفوز عندما يساوي عددها عدد المواطنين\n• 👤 المواطنون يفوزون عندما يطردون آخر عضو مافيا!`
        )
        .setTimestamp();

      await msg.edit({ embeds: [startEmbed], components: [] });
    });
  },

  async executePrefix(message) {
    if (activeGames.has(message.channelId)) {
      return message.reply('⚠️ يوجد لعبة مافيا جارية في هذه القناة!');
    }

    const players = new Map();
    players.set(message.author.id, null);
    activeGames.set(message.channelId, true);

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🔫 لعبة المافيا!')
      .setDescription(
        `**${message.author.username}** بدأ لعبة المافيا!\n\n` +
        `اضغط **انضم للعبة** للمشاركة.\n\n` +
        `👥 **اللاعبون (1):** ${message.author.username}\n⚠️ يجب 4 لاعبين على الأقل!`
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mafia_join_p').setLabel('🎭 انضم').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mafia_start_p').setLabel('▶️ ابدأ').setStyle(ButtonStyle.Success)
    );

    const msg = await message.reply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'mafia_join_p') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', flags: 64 });
        players.set(btn.user.id, null);
        const list = [...players.keys()].map(id => `<@${id}>`).join(', ');
        await msg.edit({ embeds: [EmbedBuilder.from(embed).setDescription(`👥 **اللاعبون (${players.size}):** ${list}\n⚠️ يجب 4 لاعبين على الأقل!`)] });
        await btn.reply({ content: `✅ انضممت! عدد اللاعبين: **${players.size}**`, flags: 64 });
      }
      if (btn.customId === 'mafia_start_p' && btn.user.id === message.author.id) {
        if (players.size < 4) return btn.reply({ content: '❌ يجب 4 لاعبين على الأقل!', flags: 64 });
        collector.stop('manual');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(message.channelId);
      if (players.size < 4) {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ المافيا').setDescription('لم يكفِ عدد اللاعبين!')], components: [] });
      }

      const playerIds = [...players.keys()];
      const roles = assignRoles(playerIds.length);
      const roleAssignments = {};
      playerIds.forEach((id, i) => roleAssignments[id] = roles[i]);

      let sentCount = 0;
      for (const [userId, role] of Object.entries(roleAssignments)) {
        try {
          const user = await message.client.users.fetch(userId);
          const roleInfo = ROLES[role];
          await user.send({ embeds: [new EmbedBuilder().setColor(roleInfo.color).setTitle(`🎭 دورك: ${roleInfo.emoji} ${roleInfo.name}`).setDescription(roleInfo.description)] });
          sentCount++;
        } catch (e) { }
      }

      const mafiaCount = Object.values(roleAssignments).filter(r => r === 'MAFIA').length;
      const startEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🔫 لعبة المافيا - انطلقت!')
        .setDescription(`📨 تم إرسال الأدوار! (${sentCount}/${playerIds.length})\n👥 **اللاعبون:** ${playerIds.map(id => `<@${id}>`).join(', ')}\n📊 ${mafiaCount} مافيا / ${playerIds.length - mafiaCount} مواطن`)
        .setTimestamp();
      await msg.edit({ embeds: [startEmbed], components: [] });
    });
  }
};
