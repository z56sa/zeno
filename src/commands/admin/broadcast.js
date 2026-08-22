// ========================================================
// FILE: src/commands/admin/broadcast.js
// أوامر نظام الإعلانات والمذيع الآلي المتقدم (Multi-Channel, Scheduled, Recurring Broadcasts)
// ========================================================
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const { sendBroadcastPayload } = require('../../utils/broadcastScheduler');
const config = require('../../config.json');

module.exports = {
  name: 'broadcast',
  description: 'إرسال وجدولة الإعلانات والمذيع الآلي المتكرر في عدة قنوات',
  aliases: ['اعلان', 'إعلان', 'اذاعة', 'مذيع'],
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('أوامر نظام الإعلانات والمذيع الآلي (Broadcast System)')
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('إرسال إعلان فوري إلى قناة أو عدة قنوات')
        .addChannelOption(opt => opt.setName('channel').setDescription('القناة المستهدفة').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('نص الإعلان (يدعم المتغيرات والأسطر)').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('عنوان الإعلان (اختياري)').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('لون الإيمبد (مثال: #9333ea أو #5865f2)').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('رابط صورة داخل الإعلان (اختياري)').setRequired(false))
        .addChannelOption(opt => opt.setName('channel2').setDescription('قناة إضافية ثانية (اختياري)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption(opt => opt.setName('channel3').setDescription('قناة إضافية ثالثة (اختياري)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('schedule')
        .setDescription('جدولة إعلان ليتم نشره بعد مدة محددة')
        .addChannelOption(opt => opt.setName('channel').setDescription('القناة المستهدفة').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(opt => opt.setName('delay').setDescription('المدة الزمنية قبل الإرسال (مثال: 30m, 2h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('نص الإعلان').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('عنوان الإعلان').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('لون الإيمبد').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('رابط الصورة').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('recurring')
        .setDescription('إنشاء مذيع آلي متكرر دورياً (Auto Recurring Announcement)')
        .addChannelOption(opt => opt.setName('channel').setDescription('القناة المستهدفة').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(opt => opt.setName('interval').setDescription('التكرار بالدقائق (مثال: 60 كل ساعة، 120 كل ساعتين)').setMinValue(5).setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('نص الإعلان المتكرر').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('عنوان الإعلان').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('لون الإيمبد').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('رابط الصورة').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('عرض قائمة بجميع الإعلانات المجدولة والمتكررة في السيرفر')
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('حذف إعلان مجدول أو متكرر')
        .addIntegerOption(opt => opt.setName('id').setDescription('رقم معرّف الإعلان (ID)').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ يتطلب صلاحية إدارة السيرفر (Manage Guild).', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'send') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      const ch1 = interaction.options.getChannel('channel');
      const ch2 = interaction.options.getChannel('channel2');
      const ch3 = interaction.options.getChannel('channel3');
      const message = interaction.options.getString('message');
      const title = interaction.options.getString('title');
      const color = interaction.options.getString('color') || '#9333ea';
      const image = interaction.options.getString('image');

      const targetChannels = [ch1, ch2, ch3].filter(Boolean).map(c => c.id);

      await sendBroadcastPayload(interaction.guild, {
        channel_ids: targetChannels.join(','),
        title,
        message,
        color,
        image_url: image
      });

      return interaction.editReply({
        content: `✅ **تم إرسال الإعلان بنجاح إلى ${targetChannels.length} قناة/قنوات!**`
      });

    } else if (sub === 'schedule') {
      const channel = interaction.options.getChannel('channel');
      const delayStr = interaction.options.getString('delay');
      const message = interaction.options.getString('message');
      const title = interaction.options.getString('title');
      const color = interaction.options.getString('color') || '#9333ea';
      const image = interaction.options.getString('image');

      const durationMs = ms(delayStr);
      if (!durationMs || durationMs < 10000) {
        return interaction.reply({ content: '❌ المدة غير صحيحة. استخدم صيغة مثل: `30m`, `2h`, `1d`.', ephemeral: true });
      }

      const scheduledTime = Date.now() + durationMs;

      const created = db.createBroadcast({
        guild_id: interaction.guild.id,
        channel_ids: channel.id,
        title,
        message,
        color,
        image_url: image,
        interval_minutes: 0,
        scheduled_time: scheduledTime,
        is_recurring: 0,
        created_by: interaction.user.id,
        status: 'active'
      });

      const timestampSec = Math.floor(scheduledTime / 1000);
      return interaction.reply({
        content: `⏰ **تمت جدولة الإعلان بنجاح (ID: #${created.id})!**\nسيتم النشر في <#${channel.id}> <t:${timestampSec}:R> (<t:${timestampSec}:F>).`,
        ephemeral: true
      });

    } else if (sub === 'recurring') {
      const channel = interaction.options.getChannel('channel');
      const intervalMinutes = interaction.options.getInteger('interval');
      const message = interaction.options.getString('message');
      const title = interaction.options.getString('title');
      const color = interaction.options.getString('color') || '#9333ea';
      const image = interaction.options.getString('image');

      const created = db.createBroadcast({
        guild_id: interaction.guild.id,
        channel_ids: channel.id,
        title,
        message,
        color,
        image_url: image,
        interval_minutes: intervalMinutes,
        scheduled_time: 0,
        is_recurring: 1,
        created_by: interaction.user.id,
        status: 'active'
      });

      return interaction.reply({
        content: `🔁 **تم تفعيل المذيع الآلي بنجاح (ID: #${created.id})!**\nسيتم النشر في <#${channel.id}> تلقائياً كل **${intervalMinutes} دقيقة**.`,
        ephemeral: true
      });

    } else if (sub === 'list') {
      const list = db.getGuildBroadcasts(interaction.guild.id);
      if (!list || list.length === 0) {
        return interaction.reply({ content: '📢 لا توجد أي إعلانات مجدولة أو متكررة في هذا السيرفر.', ephemeral: true });
      }

      const rows = list.map(b => {
        const typeText = b.is_recurring ? `🔁 متكرر كل ${b.interval_minutes}د` : `⏰ مجدول لـ <t:${Math.floor(b.scheduled_time / 1000)}:R>`;
        const channelsText = b.channel_ids.split(',').map(id => `<#${id}>`).join(' ');
        const statusEmoji = b.status === 'active' ? '🟢 نشط' : '⚪ منتهي/معطل';
        return `**ID: #${b.id}** | ${channelsText} | ${typeText} | ${statusEmoji}\n📝 **العنوان:** ${b.title || 'بدون عنوان'} - \`${b.message.slice(0, 40)}...\``;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor('#9333ea')
        .setTitle(`📢 الإعلانات والمذيع الآلي - ${interaction.guild.name}`)
        .setDescription(rows)
        .setFooter({ text: 'لحذف إعلان استخدم: /broadcast delete [id]' });

      return interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'delete') {
      const id = interaction.options.getInteger('id');
      const item = db.getBroadcast(id);
      if (!item || item.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: `❌ لم يتم العثور على الإعلان رقم #${id}.`, ephemeral: true });
      }

      db.deleteBroadcast(id, interaction.guild.id);
      return interaction.reply({ content: `✅ تم حذف الإعلان رقم #${id} بنجاح.`, ephemeral: true });
    }
  }
};
