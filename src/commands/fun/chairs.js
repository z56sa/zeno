const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

// لعبة الكراسي الموسيقية
const activeGames = new Map();

module.exports = {
  name: 'chairs',
  description: 'لعبة الكراسي الموسيقية - من سيحصل على كرسي؟',
  aliases: ['كراسي', 'chairs'],
  data: new SlashCommandBuilder()
    .setName('chairs')
    .setDescription('لعبة الكراسي الموسيقية - اضغط الزر قبل ما تنتهي الموسيقى!'),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ يوجد لعبة كراسي جارية في هذه القناة!', flags: 64 });
    }

    const players = new Set();
    players.add(interaction.user.id);

    const buildEmbed = () => new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🪑 لعبة الكراسي الموسيقية!')
      .setDescription(
        `**${interaction.user.username}** بدأ لعبة الكراسي الموسيقية!\n\n` +
        `اضغط **انضم للعبة** خلال 30 ثانية للمشاركة.\n\n` +
        `👥 **اللاعبون (${players.size}):** ${[...players].map(id => `<@${id}>`).join(', ')}`
      )
      .setFooter({ text: 'ستبدأ اللعبة تلقائياً بعد 30 ثانية' })
      .setTimestamp();

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('chairs_join').setLabel('🪑 انضم للعبة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('chairs_start').setLabel('▶️ ابدأ الآن').setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({ embeds: [buildEmbed()], components: [joinRow], withResponse: true });
    activeGames.set(interaction.channelId, { players, hostId: interaction.user.id });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === 'chairs_join') {
        if (players.has(btnInt.user.id)) {
          return btnInt.reply({ content: '⚠️ أنت بالفعل في اللعبة!', flags: 64 });
        }
        players.add(btnInt.user.id);
        await msg.edit({ embeds: [buildEmbed()] });
        await btnInt.reply({ content: `✅ انضممت للعبة! عدد اللاعبين: **${players.size}**`, flags: 64 });
      }
      if (btnInt.customId === 'chairs_start' && btnInt.user.id === interaction.user.id) {
        if (players.size < 2) return btnInt.reply({ content: '❌ يجب لاعبَيْن على الأقل!', flags: 64 });
        await btnInt.deferUpdate();
        collector.stop('manual_start');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(interaction.channelId);

      if (players.size < 2) {
        return msg.edit({
          embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ لعبة الكراسي الموسيقية').setDescription('لم يكفِ عدد اللاعبين! يجب وجود لاعبَيْن على الأقل.')],
          components: []
        });
      }

      const chairCount = players.size - 1;
      const playerArray = [...players].sort(() => Math.random() - 0.5);
      const eliminatedId = playerArray[playerArray.length - 1];
      const survivors = playerArray.slice(0, chairCount);

      // رسالة خسارة للمطرود
      const lossEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('💀 خرجت من اللعبة!')
        .setDescription(
          `يا <@${eliminatedId}>، لم تجد كرسياً وقفت عليه! 🪑\n\n` +
          `❌ **تم استبعادك** من هذه الجولة!\n\n` +
          `**الناجون:** ${survivors.map(id => `<@${id}>`).join(', ')}`
        )
        .setTimestamp();

      const resultEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🎵 الكراسي الموسيقية - انتهت الموسيقى!')
        .setDescription(
          `**🪑 عدد الكراسي:** ${chairCount}\n` +
          `**👥 عدد اللاعبين:** ${players.size}\n\n` +
          `**💺 الناجون:** ${survivors.map(id => `<@${id}>`).join(', ')}\n\n` +
          `**💀 المحذوف:** <@${eliminatedId}> لم يجد كرسياً!`
        )
        .setTimestamp();

      await msg.edit({ embeds: [resultEmbed], components: [] });
      await interaction.channel.send({ embeds: [lossEmbed] });
    });
  },

  async executePrefix(message) {
    if (activeGames.has(message.channelId)) {
      return message.reply('⚠️ يوجد لعبة كراسي جارية في هذه القناة!');
    }

    const players = new Set();
    players.add(message.author.id);

    const buildEmbed = () => new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🪑 لعبة الكراسي الموسيقية!')
      .setDescription(
        `**${message.author.username}** بدأ لعبة الكراسي الموسيقية!\n\n` +
        `اضغط **انضم للعبة** خلال 30 ثانية.\n\n` +
        `👥 **اللاعبون (${players.size}):** ${[...players].map(id => `<@${id}>`).join(', ')}`
      )
      .setFooter({ text: 'ستبدأ اللعبة تلقائياً بعد 30 ثانية' })
      .setTimestamp();

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('chairs_join_p').setLabel('🪑 انضم للعبة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('chairs_start_p').setLabel('▶️ ابدأ الآن').setStyle(ButtonStyle.Success)
    );

    const msg = await message.reply({ embeds: [buildEmbed()], components: [joinRow] });
    activeGames.set(message.channelId, { players, hostId: message.author.id });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === 'chairs_join_p') {
        if (players.has(btnInt.user.id)) return btnInt.reply({ content: '⚠️ أنت بالفعل في اللعبة!', flags: 64 });
        players.add(btnInt.user.id);
        await msg.edit({ embeds: [buildEmbed()] });
        await btnInt.reply({ content: `✅ انضممت! عدد اللاعبين: **${players.size}**`, flags: 64 });
      }
      if (btnInt.customId === 'chairs_start_p' && btnInt.user.id === message.author.id) {
        if (players.size < 2) return btnInt.reply({ content: '❌ يجب لاعبَيْن على الأقل!', flags: 64 });
        await btnInt.deferUpdate();
        collector.stop('manual_start');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(message.channelId);
      if (players.size < 2) {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ لعبة الكراسي').setDescription('لم يكفِ عدد اللاعبين!')], components: [] });
      }

      const chairCount = players.size - 1;
      const playerArray = [...players].sort(() => Math.random() - 0.5);
      const eliminatedId = playerArray[playerArray.length - 1];
      const survivors = playerArray.slice(0, chairCount);

      const lossEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('💀 خرجت من اللعبة!')
        .setDescription(
          `يا <@${eliminatedId}>، لم تجد كرسياً وقفت عليه! 🪑\n\n` +
          `❌ **تم استبعادك** من هذه الجولة!\n\n` +
          `**الناجون:** ${survivors.map(id => `<@${id}>`).join(', ')}`
        )
        .setTimestamp();

      const resultEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🎵 الكراسي الموسيقية - انتهت الموسيقى!')
        .setDescription(
          `**🪑 الكراسي:** ${chairCount} | **👥 اللاعبون:** ${players.size}\n\n` +
          `**💺 الناجون:** ${survivors.map(id => `<@${id}>`).join(', ')}\n` +
          `**💀 المحذوف:** <@${eliminatedId}>`
        )
        .setTimestamp();

      await msg.edit({ embeds: [resultEmbed], components: [] });
      await message.channel.send({ embeds: [lossEmbed] });
    });
  }
};
