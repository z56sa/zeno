const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

const WORK_COOLDOWN = 4 * 60 * 60 * 1000; // 4 ساعات

const JOBS = [
  { title: '👨‍💻 مطور برمجيات', msg: 'طورت تطبيقاً رائعاً وحصلت على مكافأة!' },
  { title: '🎨 مصمم جرافيك', msg: 'صممت شعاراً احترافياً لعميل سعيد!' },
  { title: '🚗 سائق توصيل', msg: 'وصّلت 20 طلبية بسرعة وحصلت على بقشيش ممتاز!' },
  { title: '📚 معلم', msg: 'درّست طلابك وحصلت على مكافأة نهاية الشهر!' },
  { title: '🍕 طباخ', msg: 'طبخت وجبات لذيذة في مطعم مشهور!' },
  { title: '💊 صيدلاني', msg: 'ساعدت الزبائن وحصلت على عمولة ممتازة!' },
  { title: '🔧 ميكانيكي', msg: 'أصلحت 5 سيارات اليوم وربحت جيداً!' },
  { title: '📷 مصور', msg: 'التقطت صور رائعة في حفل زفاف وحصلت على أجر كبير!' },
  { title: '🎵 موسيقار', msg: 'عزفت في حفلة موسيقية وجمعت بقشيشاً رائعاً!' },
  { title: '⚽ مدرب رياضي', msg: 'دربت الفريق وفاز في المباراة، مكافأة الفوز لك!' },
  { title: '✈️ طيار', msg: 'أكملت رحلة ناجحة وحصلت على بدل مميز!' },
  { title: '🏥 ممرض', msg: 'عملت نوبة إضافية في المستشفى وأخذت أجراً مضاعفاً!' },
  { title: '🌿 بستاني', msg: 'جمّلت حديقة فاخرة وأُعجب صاحبها بعملك!' },
  { title: '🎮 مستعرض ألعاب', msg: 'بثّت مباشراً وجمعت دونيشنات رائعة!' },
  { title: '📦 موظف مستودع', msg: 'رتّبت البضاعة بسرعة ونلت مكافأة الكفاءة!' },
  { title: '🐾 مربي حيوانات', msg: 'اعتنيت بحيوانات عملائك وحصلت على أجر ممتاز!' },
  { title: '🏗️ مقاول بناء', msg: 'أنهيت مشروع البناء في وقت قياسي ونلت المكافأة!' },
];

module.exports = {
  name: 'work',
  description: 'اعمل لتكسب كريدت (كل 4 ساعات)',
  aliases: ['اشتغل', 'شغل'],
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('اعمل لتكسب كريدت 💼'),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleWork(interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message) {
    await this.handleWork(message.author, message.guild.id, (opts) => message.reply(opts));
  },

  async handleWork(user, guildId, reply) {
    const userData = db.getUser(user.id, guildId);
    const lastWork = userData.last_work || 0;
    const now = Date.now();

    if (now - lastWork < WORK_COOLDOWN) {
      const remaining = WORK_COOLDOWN - (now - lastWork);
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const embed = new EmbedBuilder().setColor('#e74c3c')
        .setTitle('😴 أنت متعب!')
        .setDescription(`استرح قليلاً، يمكنك العمل مجدداً خلال:\n⏰ **${h} ساعة و${m} دقيقة**`)
        .setTimestamp();
      return reply({ embeds: [embed] });
    }

    const job = JOBS[Math.floor(Math.random() * JOBS.length)];
    let reward = Math.floor(Math.random() * 151) + 50; // 50-200
    let bonusText = '';

    // 10% فرصة مضاعفة الراتب
    if (Math.random() < 0.1) {
      reward *= 2;
      bonusText = '\n🍀 **حظ سعيد! راتبك مضاعف هذه المرة!**';
    }

    db.addCoins(user.id, guildId, reward);
    db.db.prepare('UPDATE users SET last_work = ? WHERE user_id = ? AND guild_id = ?').run(now, user.id, guildId);

    const newUserData = db.getUser(user.id, guildId);
    const embed = new EmbedBuilder()
      .setColor('#27ae60')
      .setTitle(job.title)
      .setDescription(`${job.msg}${bonusText}`)
      .addFields(
        { name: '💰 الراتب', value: `\`+${reward.toLocaleString()}\` ⭐ Star Coin`, inline: true },
        { name: '💳 رصيدك', value: `\`${(newUserData.coins || newUserData.credits || 0).toLocaleString()}\` ⭐`, inline: true }
      )
      .setFooter({ text: 'يمكنك العمل مجدداً بعد 4 ساعات' })
      .setTimestamp();

    await reply({ embeds: [embed] });
  }
};
