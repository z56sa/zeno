const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');

const activeGames = new Map();

module.exports = {
  name: 'roulette',
  description: 'لعبة الروليت - من سيختار البوت؟ 🎰',
  aliases: ['روليت'],
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('لعبة الروليت - ادعُ الآخرين وانتظر مصيرك! 🎰')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('الرهان من رصيدك (اختياري)')
        .setRequired(false)
        .setMinValue(10)
    ),

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ يوجد لعبة روليت جارية في هذه القناة!', ephemeral: true });
    }

    const bet = interaction.options.getInteger('bet') || 0;

    if (bet > 0) {
      const userData = db.getUser(interaction.user.id, interaction.guild.id);
      const balance = userData.coins || 0;
      if (balance < bet) {
        return interaction.reply({ content: `❌ رصيدك غير كافٍ! لديك \`${balance.toLocaleString()}\` ⭐`, ephemeral: true });
      }
    }

    const players = new Set([interaction.user.id]);
    activeGames.set(interaction.channelId, { players, hostId: interaction.user.id, bet });

    const buildEmbed = () => new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🎰 لعبة الروليت!')
      .setDescription(
        `**${interaction.user.username}** فتح غرفة الروليت!\n\n` +
        `🎯 **كيف تلعب؟**\n` +
        `• اضغط **انضم للعبة** للمشاركة\n` +
        `• صاحب الغرفة يضغط **ابدأ اللعبة** عندما يكون الجميع جاهزاً\n` +
        `• البوت يختار ضحية عشوائية من المشتركين!\n\n` +
        (bet > 0 ? `💰 **الرهان:** \`${bet.toLocaleString()}\` ⭐ (الخاسر يدفع للفائزين)\n\n` : '') +
        `👥 **اللاعبون (${players.size}):** ${[...players].map(id => `<@${id}>`).join(', ')}`
      )
      .setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية أو عند ضغط ابدأ' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rlt_join').setLabel('🎰 انضم للعبة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rlt_start').setLabel('▶️ ابدأ اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rlt_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({ embeds: [buildEmbed()], components: [row], fetchReply: true });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'rlt_join') {
        if (players.has(btn.user.id)) {
          return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        }

        if (bet > 0) {
          const bData = db.getUser(btn.user.id, interaction.guild.id);
          const bal = bData.coins || 0;
          if (bal < bet) {
            return btn.reply({ content: `❌ رصيدك غير كافٍ للرهان! لديك \`${bal.toLocaleString()}\` ⭐ والرهان \`${bet.toLocaleString()}\` ⭐`, ephemeral: true });
          }
        }

        players.add(btn.user.id);
        await msg.edit({ embeds: [buildEmbed()] });
        await btn.reply({ content: `✅ انضممت للعبة الروليت! عدد اللاعبين: **${players.size}**`, ephemeral: true });
      }

      if (btn.customId === 'rlt_start') {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({ content: '❌ فقط صاحب الغرفة يستطيع بدء اللعبة!', ephemeral: true });
        }
        if (players.size < 2) {
          return btn.reply({ content: '❌ يجب وجود لاعبَيْن على الأقل للبدء!', ephemeral: true });
        }
        await btn.deferUpdate();
        collector.stop('start');
      }

      if (btn.customId === 'rlt_cancel') {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({ content: '❌ فقط صاحب الغرفة يستطيع الإلغاء!', ephemeral: true });
        }
        await btn.deferUpdate();
        collector.stop('cancel');
      }
    });

    collector.on('end', async (collected, reason) => {
      activeGames.delete(interaction.channelId);

      if (reason === 'cancel') {
        return msg.edit({
          embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ روليت - ألغيت').setDescription('تم إلغاء اللعبة من قِبل صاحب الغرفة.')],
          components: []
        });
      }

      if (players.size < 2) {
        return msg.edit({
          embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ روليت - انتهت المهلة').setDescription('لم يكفِ عدد اللاعبين! يجب لاعبَيْن على الأقل.')],
          components: []
        });
      }

      // اختيار الضحية عشوائياً
      const arr = [...players];
      const victim = arr[Math.floor(Math.random() * arr.length)];
      const survivors = arr.filter(id => id !== victim);

      const outcomes = [
        { text: `💀 انتهت عليك يا <@${victim}>! البوت اختارك كضحية الجولة!`, color: '#ED4245' },
        { text: `🎯 <@${victim}> أنت المحظوظ (أو غير المحظوظ) هذه المرة!`, color: '#FEE75C' },
        { text: `🔫 طق! الرصاصة وصلت لـ <@${victim}>!`, color: '#ED4245' },
        { text: `🎰 الروليت قرر! <@${victim}> أنت الضحية!`, color: '#FF6B6B' },
      ];
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

      // معالجة الرهان
      let betResult = '';
      if (bet > 0 && survivors.length > 0) {
        db.removeCoins(victim, interaction.guild.id, bet * survivors.length);
        for (const sid of survivors) {
          db.addCoins(sid, interaction.guild.id, bet);
        }
        betResult = `\n\n💰 <@${victim}> خسر \`${(bet * survivors.length).toLocaleString()}\` ⭐ وزّعت على الباقين!`;
      }

      const victimUser = await interaction.client.users.fetch(victim).catch(() => null);
      const resultEmbed = new EmbedBuilder()
        .setColor(outcome.color)
        .setTitle('🎰 لعبة الروليت - النتيجة!')
        .setDescription(outcome.text + betResult)
        .setThumbnail(victimUser?.displayAvatarURL() || null)
        .addFields(
          { name: '👥 المشتركون', value: arr.map(id => `<@${id}>`).join(', '), inline: false },
          { name: '🏆 الناجون', value: survivors.length > 0 ? survivors.map(id => `<@${id}>`).join(', ') : 'لا أحد 😅', inline: false }
        )
        .setFooter({ text: `بدأت من: ${interaction.user.username}` })
        .setTimestamp();

      await msg.edit({ embeds: [resultEmbed], components: [] });
    });
  },

  async executePrefix(message, args) {
    if (activeGames.has(message.channelId)) {
      return message.reply('⚠️ يوجد لعبة روليت جارية في هذه القناة!');
    }

    const bet = parseInt(args[0]) || 0;

    if (bet > 0) {
      const userData = db.getUser(message.author.id, message.guild.id);
      const balance = userData.coins || 0;
      if (balance < bet) {
        return message.reply(`❌ رصيدك غير كافٍ! لديك \`${balance.toLocaleString()}\` ⭐`);
      }
    }

    const players = new Set([message.author.id]);
    activeGames.set(message.channelId, { players, hostId: message.author.id, bet });

    const buildEmbed = () => new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🎰 لعبة الروليت!')
      .setDescription(
        `**${message.author.username}** فتح غرفة الروليت!\n\n` +
        (bet > 0 ? `💰 **الرهان:** \`${bet.toLocaleString()}\` ⭐\n\n` : '') +
        `👥 **اللاعبون (${players.size}):** ${[...players].map(id => `<@${id}>`).join(', ')}`
      )
      .setFooter({ text: 'تنتهي الدعوة بعد 60 ثانية' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rlt_join_p').setLabel('🎰 انضم للعبة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rlt_start_p').setLabel('▶️ ابدأ اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rlt_cancel_p').setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
    );

    const msg = await message.reply({ embeds: [buildEmbed()], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (btn) => {
      if (btn.customId === 'rlt_join_p') {
        if (players.has(btn.user.id)) return btn.reply({ content: '⚠️ أنت بالفعل في اللعبة!', ephemeral: true });
        players.add(btn.user.id);
        await msg.edit({ embeds: [buildEmbed()] });
        await btn.reply({ content: `✅ انضممت! عدد اللاعبين: **${players.size}**`, ephemeral: true });
      }
      if (btn.customId === 'rlt_start_p') {
        if (btn.user.id !== message.author.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        if (players.size < 2) return btn.reply({ content: '❌ يجب لاعبَيْن على الأقل!', ephemeral: true });
        await btn.deferUpdate();
        collector.stop('start');
      }
      if (btn.customId === 'rlt_cancel_p') {
        if (btn.user.id !== message.author.id) return btn.reply({ content: '❌ فقط صاحب الغرفة!', ephemeral: true });
        await btn.deferUpdate();
        collector.stop('cancel');
      }
    });

    collector.on('end', async (collected, reason) => {
      activeGames.delete(message.channelId);

      if (reason === 'cancel') {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ روليت - ألغيت').setDescription('تم إلغاء اللعبة.')], components: [] });
      }

      if (players.size < 2) {
        return msg.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ روليت').setDescription('لم يكفِ عدد اللاعبين!')], components: [] });
      }

      const arr = [...players];
      const victim = arr[Math.floor(Math.random() * arr.length)];
      const survivors = arr.filter(id => id !== victim);

      const outcomes = [
        { text: `💀 انتهت عليك يا <@${victim}>!`, color: '#ED4245' },
        { text: `🎯 <@${victim}> أنت الضحية!`, color: '#FEE75C' },
        { text: `🔫 طق! الرصاصة وصلت لـ <@${victim}>!`, color: '#ED4245' },
      ];
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

      let betResult = '';
      if (bet > 0 && survivors.length > 0) {
        db.removeCoins(victim, message.guild.id, bet * survivors.length);
        for (const sid of survivors) db.addCoins(sid, message.guild.id, bet);
        betResult = `\n\n💰 <@${victim}> خسر \`${(bet * survivors.length).toLocaleString()}\` ⭐`;
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(outcome.color)
        .setTitle('🎰 لعبة الروليت - النتيجة!')
        .setDescription(outcome.text + betResult)
        .addFields({ name: '👥 المشتركون', value: arr.map(id => `<@${id}>`).join(', ') })
        .setTimestamp();

      await msg.edit({ embeds: [resultEmbed], components: [] });
    });
  }
};
