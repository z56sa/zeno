const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'poll',
  description: 'إنشاء تصويت تفاعلي في الروم مع أزرار ونسب التصويت',
  aliases: ['تصويت', 'استطلاع'],
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('إنشاء تصويت تفاعلي')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('سؤال التصويت')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('option1')
        .setDescription('الخيار الأول (افتراضي: نعم)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('option2')
        .setDescription('الخيار الثاني (افتراضي: لا)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const opt1 = interaction.options.getString('option1') || 'نعم 👍';
    const opt2 = interaction.options.getString('option2') || 'لا 👎';

    const votes = {
      opt1: new Set(),
      opt2: new Set()
    };

    const buildEmbed = () => {
      const count1 = votes.opt1.size;
      const count2 = votes.opt2.size;
      const total = count1 + count2;
      const pct1 = total > 0 ? Math.round((count1 / total) * 100) : 0;
      const pct2 = total > 0 ? Math.round((count2 / total) * 100) : 0;

      return new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`📊 تصويت: ${question}`)
        .setDescription([
          `**1️⃣ ${opt1}**`,
          `\`${count1} صوت (${pct1}%)\``,
          `\n**2️⃣ ${opt2}**`,
          `\`${count2} صوت (${pct2}%)\``,
          `\n📈 إجمالي الأصوات: **${total}**`
        ].join('\n'))
        .setFooter({ text: `أنشئ بواسطة: ${interaction.user.tag}` })
        .setTimestamp();
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_1_${interaction.id}`)
        .setLabel(opt1.length > 40 ? opt1.substring(0, 37) + '...' : opt1)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`poll_2_${interaction.id}`)
        .setLabel(opt2.length > 40 ? opt2.substring(0, 37) + '...' : opt2)
        .setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({ embeds: [buildEmbed()], components: [row], withResponse: true });

    const collector = message.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });

    collector.on('collect', async (i) => {
      const uId = i.user.id;
      if (i.customId === `poll_1_${interaction.id}`) {
        votes.opt2.delete(uId);
        if (votes.opt1.has(uId)) votes.opt1.delete(uId);
        else votes.opt1.add(uId);
      } else if (i.customId === `poll_2_${interaction.id}`) {
        votes.opt1.delete(uId);
        if (votes.opt2.has(uId)) votes.opt2.delete(uId);
        else votes.opt2.add(uId);
      }

      await i.update({ embeds: [buildEmbed()] });
    });
  },

  async executePrefix(message, args) {
    const question = args.join(' ');
    if (!question) return message.reply('❌ الاستخدام: `#poll [سؤال التصويت]`');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`📊 تصويت جديد`)
      .setDescription(question)
      .setFooter({ text: `بواسطة: ${message.author.tag}` })
      .setTimestamp();

    const sent = await message.channel.send({ embeds: [embed] });
    await sent.react('👍');
    await sent.react('👎');
  }
};
