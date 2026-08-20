const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

// لعبة الغميضة - شخص يختبئ والبقية تبحث
const activeGames = new Map();

module.exports = {
  name: 'hideseek',
  description: 'لعبة الغميضة - اختبئ قبل ما يلاقوك!',
  aliases: ['غميضة', 'hideandseek'],
  data: new SlashCommandBuilder()
    .setName('hideseek')
    .setDescription('لعبة الغميضة - شخص يختبئ والباقون يبحثون!'),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ يوجد لعبة غميضة جارية في هذه القناة!', ephemeral: true });
    }

    const players = new Set();
    players.add(interaction.user.id);
    activeGames.set(interaction.channelId, true);

    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('🙈 لعبة الغميضة!')
      .setDescription(
        `**${interaction.user.username}** بدأ لعبة الغميضة!\n\n` +
        `اضغط **انضم** للمشاركة. بعد 30 ثانية سيتم اختيار شخص يختبئ والباقون يبحثون!\n\n` +
        `👥 **اللاعبون (1):** ${interaction.user.username}`
      )
      .setFooter({ text: 'تنتهي الدعوة بعد 30 ثانية' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hs_join').setLabel('🙈 انضم').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('hs_start').setLabel('▶️ ابدأ').setStyle(ButtonStyle.Success)
    );

    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'hs_join') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        players.add(btn.user.id);
        const list = [...players].map(id => `<@${id}>`).join(', ');
        await msg.edit({ embeds: [EmbedBuilder.from(embed).setDescription(`**${interaction.user.username}** بدأ لعبة الغميضة!\n\n👥 **اللاعبون (${players.size}):** ${list}`)] });
        await btn.reply({ content: `✅ انضممت! عدد اللاعبين: **${players.size}**`, ephemeral: true });
      }
      if (btn.customId === 'hs_start' && btn.user.id === interaction.user.id) {
        if (players.size < 2) return btn.reply({ content: '❌ يجب وجود لاعبَيْن على الأقل!', ephemeral: true });
        collector.stop('manual');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(interaction.channelId);
      if (players.size < 2) {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ الغميضة').setDescription('لم يكفِ عدد اللاعبين!')], components: [] });
      }

      const arr = [...players].sort(() => Math.random() - 0.5);
      const hider = arr[0];
      const seekers = arr.slice(1);

      // أرسل للمختبئ رسالة سرية
      try {
        const hiderUser = await interaction.client.users.fetch(hider);
        await hiderUser.send(`🙈 **أنت المختبئ في لعبة الغميضة!**\nاختبئ جيداً في قناة صوتية! الباحثون سيحاولون إيجادك!`);
      } catch (e) { /* DMs مغلقة */ }

      const resultEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🙈 لعبة الغميضة - انطلقت!')
        .setDescription(
          `**🫣 المختبئ:** <@${hider}> (أُرسلت له رسالة سرية!)\n\n` +
          `**🔍 الباحثون:** ${seekers.map(id => `<@${id}>`).join(', ')}\n\n` +
          `📌 ابحثوا عن المختبئ في القنوات الصوتية! من يجده أولاً يفوز!`
        )
        .setTimestamp();

      await msg.edit({ embeds: [resultEmbed], components: [] });
    });
  },

  async executePrefix(message) {
    if (activeGames.has(message.channelId)) {
      return message.reply('⚠️ يوجد لعبة غميضة جارية في هذه القناة!');
    }

    const players = new Set([message.author.id]);
    activeGames.set(message.channelId, true);

    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('🙈 لعبة الغميضة!')
      .setDescription(`**${message.author.username}** بدأ لعبة الغميضة!\n\nاضغط **انضم** للمشاركة.\n\n👥 **اللاعبون (1):** ${message.author.username}`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hs_join_p').setLabel('🙈 انضم').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('hs_start_p').setLabel('▶️ ابدأ').setStyle(ButtonStyle.Success)
    );

    const msg = await message.reply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'hs_join_p') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        players.add(btn.user.id);
        const list = [...players].map(id => `<@${id}>`).join(', ');
        await msg.edit({ embeds: [EmbedBuilder.from(embed).setDescription(`👥 **اللاعبون (${players.size}):** ${list}`)] });
        await btn.reply({ content: `✅ انضممت! عدد اللاعبين: **${players.size}**`, ephemeral: true });
      }
      if (btn.customId === 'hs_start_p' && btn.user.id === message.author.id) {
        if (players.size < 2) return btn.reply({ content: '❌ يجب لاعبَيْن على الأقل!', ephemeral: true });
        collector.stop('manual');
      }
    });

    collector.on('end', async () => {
      activeGames.delete(message.channelId);
      if (players.size < 2) {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ الغميضة').setDescription('لم يكفِ عدد اللاعبين!')], components: [] });
      }
      const arr = [...players].sort(() => Math.random() - 0.5);
      const hider = arr[0];
      const seekers = arr.slice(1);
      try {
        const hiderUser = await message.client.users.fetch(hider);
        await hiderUser.send(`🙈 **أنت المختبئ في لعبة الغميضة!**`);
      } catch (e) { }
      const resultEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🙈 لعبة الغميضة - انطلقت!')
        .setDescription(`**🫣 المختبئ:** <@${hider}>\n**🔍 الباحثون:** ${seekers.map(id => `<@${id}>`).join(', ')}\n\n📌 ابحثوا عنه في القنوات الصوتية!`)
        .setTimestamp();
      await msg.edit({ embeds: [resultEmbed], components: [] });
    });
  }
};
