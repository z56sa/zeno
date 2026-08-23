const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

const ACTIVE_FIGHTS = new Map();

module.exports = {
  name: 'fight',
  description: 'تحدّ عضواً آخر في قتال 🥊',
  aliases: ['قتال', 'تحدي'],
  data: new SlashCommandBuilder()
    .setName('fight')
    .setDescription('تحدّ عضواً آخر في قتال 🥊')
    .addUserOption(opt => opt.setName('opponent').setDescription('العضو المتحدى').setRequired(true))
    .addIntegerOption(opt => opt.setName('bet').setDescription('الرهان (الحد الأدنى 50)').setRequired(true).setMinValue(50)),

  async execute(interaction) {
    const opponent = interaction.options.getUser('opponent');
    const bet = interaction.options.getInteger('bet');

    if (opponent.id === interaction.user.id) return interaction.reply({ content: '❌ لا تستطيع تحدي نفسك!', ephemeral: true });
    if (opponent.bot) return interaction.reply({ content: '❌ لا يمكن تحدي البوت!', ephemeral: true });
    if (ACTIVE_FIGHTS.has(interaction.user.id) || ACTIVE_FIGHTS.has(opponent.id))
      return interaction.reply({ content: '⚠️ أحد اللاعبين في قتال بالفعل!', ephemeral: true });

    const challengerData = db.getUser(interaction.user.id, interaction.guild.id);
    const opponentData = db.getUser(opponent.id, interaction.guild.id);
    const cBalance = challengerData.coins || challengerData.credits || 0;
    const oBalance = opponentData.coins || opponentData.credits || 0;

    if (cBalance < bet) return interaction.reply({ content: `❌ رصيدك غير كافٍ! لديك \`${cBalance.toLocaleString()}\` ⭐`, ephemeral: true });
    if (oBalance < bet) return interaction.reply({ content: `❌ رصيد **${opponent.tag}** غير كافٍ!`, ephemeral: true });

    const challengeEmbed = new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('⚔️ تحدي قتال!')
      .setDescription(`**${interaction.user.tag}** يتحداك يا **${opponent.tag}**!\n💰 الرهان: \`${bet.toLocaleString()}\` ⭐`)
      .setFooter({ text: 'لديك 30 ثانية لقبول التحدي' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fight_accept').setLabel('✅ قبول').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('fight_decline').setLabel('❌ رفض').setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({ content: `<@${opponent.id}>`, embeds: [challengeEmbed], components: [row], fetchReply: true });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === opponent.id,
      time: 30000,
      max: 1
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'fight_decline') {
        await i.update({ content: `❌ **${opponent.tag}** رفض التحدي!`, embeds: [], components: [] });
        return;
      }

      ACTIVE_FIGHTS.set(interaction.user.id, true);
      ACTIVE_FIGHTS.set(opponent.id, true);

      // بدء القتال
      let challengerHP = 100, opponentHP = 100;
      let round = 1;
      const fightLog = [];

      while (challengerHP > 0 && opponentHP > 0 && round <= 10) {
        const cDmg = Math.floor(Math.random() * 41) + 10;
        const oDmg = Math.floor(Math.random() * 41) + 10;
        opponentHP = Math.max(0, opponentHP - cDmg);
        challengerHP = Math.max(0, challengerHP - oDmg);
        fightLog.push(`**الجولة ${round}:** ${interaction.user.username} 🗡️ ${cDmg} — ${opponent.username} 🗡️ ${oDmg}`);
        round++;
        if (challengerHP <= 0 || opponentHP <= 0) break;
      }

      let winner, loser;
      if (challengerHP > opponentHP) { winner = interaction.user; loser = opponent; }
      else if (opponentHP > challengerHP) { winner = opponent; loser = interaction.user; }
      else { winner = null; }

      if (winner) {
        db.addCoins(winner.id, interaction.guild.id, bet);
        db.removeCoins(loser.id, interaction.guild.id, bet);
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(winner ? '#FFD700' : '#95a5a6')
        .setTitle(winner ? `🏆 ${winner.username} فاز!` : '🤝 تعادل!')
        .setDescription(fightLog.slice(-5).join('\n'))
        .addFields(
          { name: `❤️ ${interaction.user.username}`, value: `${challengerHP} HP`, inline: true },
          { name: `❤️ ${opponent.username}`, value: `${opponentHP} HP`, inline: true },
          { name: '💰 المكافأة', value: winner ? `${winner.username} ربح \`${bet.toLocaleString()}\` ⭐` : 'لا أحد يربح في التعادل', inline: false }
        ).setTimestamp();

      await i.update({ content: '', embeds: [resultEmbed], components: [] });

      // رسالة خسارة للخاسر
      if (winner && loser) {
        const lossEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('💀 خسرت المعركة!')
          .setDescription(
            `يا **${loser.username}**، هُزمت أمام **${winner.username}**! 🥊\n\n` +
            `❌ **خسرت** \`${bet.toLocaleString()}\` ⭐ من رصيدك.\n\n` +
            `😤 ربما المرة القادمة تكون أقوى!`
          )
          .setTimestamp();
        await i.channel.send({ embeds: [lossEmbed] });
      }

      ACTIVE_FIGHTS.delete(interaction.user.id);
      ACTIVE_FIGHTS.delete(opponent.id);
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        msg.edit({ content: `⏰ انتهى وقت التحدي!`, embeds: [], components: [] }).catch(() => {});
      }
    });
  },

  async executePrefix(message) {
    return message.reply('❌ استخدم `/fight` للتحدي.');
  }
};
