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
      return interaction.reply({ content: '⚠️ يوجد لعبة كراسي جارية في هذه القناة!', ephemeral: true });
    }

    const players = new Set();
    players.add(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🪑 لعبة الكراسي الموسيقية!')
      .setDescription(`**${interaction.user.username}** بدأ لعبة الكراسي الموسيقية!\n\nاضغط **انضم للعبة** خلال 30 ثانية للمشاركة.\n\n👥 **اللاعبون:** ${interaction.user.username}`)
      .setFooter({ text: 'ستبدأ اللعبة تلقائياً بعد 30 ثانية' })
      .setTimestamp();

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('chairs_join')
        .setLabel('🪑 انضم للعبة')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('chairs_start')
        .setLabel('▶️ ابدأ الآن')
        .setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({ embeds: [embed], components: [joinRow], fetchReply: true });
    activeGames.set(interaction.channelId, { players, hostId: interaction.user.id });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === 'chairs_join') {
        if (players.has(btnInt.user.id)) {
          return btnInt.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        }
        players.add(btnInt.user.id);
        const playersList = [...players].map(id => `<@${id}>`).join(', ');
        
        const updatedEmbed = EmbedBuilder.from(embed)
          .setDescription(`**${interaction.user.username}** بدأ لعبة الكراسي الموسيقية!\n\nاضغط **انضم للعبة** خلال 30 ثانية للمشاركة.\n\n👥 **اللاعبون (${players.size}):** ${playersList}`);
        
        await msg.edit({ embeds: [updatedEmbed] });
        await btnInt.reply({ content: `✅ انضممت للعبة! عدد اللاعبين: **${players.size}**`, ephemeral: true });
      }

      if (btnInt.customId === 'chairs_start' && btnInt.user.id === interaction.user.id) {
        collector.stop('manual_start');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(interaction.channelId);
      
      if (players.size < 2) {
        const failEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('❌ لعبة الكراسي الموسيقية')
          .setDescription('لم يكفِ عدد اللاعبين! يجب وجود لاعبَيْن على الأقل.');
        return msg.edit({ embeds: [failEmbed], components: [] });
      }

      // عدد الكراسي = عدد اللاعبين - 1
      const chairCount = players.size - 1;
      const playerArray = [...players].sort(() => Math.random() - 0.5);
      
      // من لم يحصل على كرسي (آخر لاعب في المصفوفة المختلطة)
      const eliminated = playerArray[playerArray.length - 1];
      const survivors = playerArray.slice(0, chairCount);

      const resultEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🎵 الكراسي الموسيقية - انتهت الموسيقى!')
        .setDescription(
          `**🪑 عدد الكراسي:** ${chairCount}\n` +
          `**👥 عدد اللاعبين:** ${players.size}\n\n` +
          `**💺 الناجون:** ${survivors.map(id => `<@${id}>`).join(', ')}\n\n` +
          `**💀 المحذوف:** <@${eliminated}> لم يجد كرسياً!`
        )
        .setTimestamp();

      await msg.edit({ embeds: [resultEmbed], components: [] });
    });
  },

  async executePrefix(message) {
    if (activeGames.has(message.channelId)) {
      return message.reply('⚠️ يوجد لعبة كراسي جارية في هذه القناة!');
    }

    const players = new Set();
    players.add(message.author.id);

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🪑 لعبة الكراسي الموسيقية!')
      .setDescription(`**${message.author.username}** بدأ لعبة الكراسي الموسيقية!\n\nاضغط **انضم للعبة** خلال 30 ثانية.\n\n👥 **اللاعبون:** ${message.author.username}`)
      .setFooter({ text: 'ستبدأ اللعبة تلقائياً بعد 30 ثانية' })
      .setTimestamp();

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('chairs_join_p')
        .setLabel('🪑 انضم للعبة')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('chairs_start_p')
        .setLabel('▶️ ابدأ الآن')
        .setStyle(ButtonStyle.Success)
    );

    const msg = await message.reply({ embeds: [embed], components: [joinRow] });
    activeGames.set(message.channelId, { players, hostId: message.author.id });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === 'chairs_join_p') {
        if (players.has(btnInt.user.id)) {
          return btnInt.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        }
        players.add(btnInt.user.id);
        const playersList = [...players].map(id => `<@${id}>`).join(', ');
        const updatedEmbed = EmbedBuilder.from(embed)
          .setDescription(`**${message.author.username}** بدأ لعبة الكراسي الموسيقية!\n\n👥 **اللاعبون (${players.size}):** ${playersList}`);
        await msg.edit({ embeds: [updatedEmbed] });
        await btnInt.reply({ content: `✅ انضممت! عدد اللاعبين: **${players.size}**`, ephemeral: true });
      }
      if (btnInt.customId === 'chairs_start_p' && btnInt.user.id === message.author.id) {
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
      const eliminated = playerArray[playerArray.length - 1];
      const survivors = playerArray.slice(0, chairCount);
      const resultEmbed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🎵 الكراسي الموسيقية - انتهت الموسيقى!')
        .setDescription(`**🪑 الكراسي:** ${chairCount} | **👥 اللاعبون:** ${players.size}\n\n**💺 الناجون:** ${survivors.map(id => `<@${id}>`).join(', ')}\n**💀 المحذوف:** <@${eliminated}>`)
        .setTimestamp();
      await msg.edit({ embeds: [resultEmbed], components: [] });
    });
  }
};
