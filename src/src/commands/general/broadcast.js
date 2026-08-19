const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database'); // تأكد من مسار قاعدة البيانات الصحيح حسب مشروعك
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('إدارة نظام الإعلانات والرسائل المجدولة في السيرفر')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('إضافة إعلان مجدول جديد')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('القناة المراد إرسال الإعلان فيها')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('interval')
                        .setDescription('الفترة الزمنية بالدقائق (مثال: 60 لكل ساعة)')
                        .setRequired(true)
                        .setMinValue(5))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('محتوى رسالة الإعلان (يدعم \\n للأسطر الجديدة)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('عنوان الإعلان (اختياري، لتحويله إلى Embed)')
                        .setRequired(false))
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('عرض قائمة الإعلانات المجدولة النشطة في السيرفر')
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('حذف إعلان مجدول باستخدام معرفه (ID)')
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('معرف الإعلان (ID)')
                        .setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'add') {
            const channel = interaction.options.getChannel('channel');
            const interval = interaction.options.getInteger('interval');
            const message = interaction.options.getString('message');
            const title = interaction.options.getString('title') || null;

            try {
                // حفظ الإعلان في قاعدة البيانات (تأكد من توفر دالة اضافة الإعلانات في ملف database.js)
                db.addBroadcast({
                    guild_id: guildId,
                    channel_id: channel.id,
                    interval_minutes: interval,
                    message: message,
                    title: title,
                    last_sent: Date.now()
                });

                return interaction.reply({
                    content: `✅ تم إضافة الإعلان المجدول بنجاح في القناة ${channel} لتتكرر كل **${interval} دقيقة**!`,
                    ephemeral: true
                });
            } catch (err) {
                console.error('خطأ في إضافة الإعلان المجدول:', err);
                return interaction.reply({
                    content: '❌ حدث خطأ أثناء حفظ الإعلان المجدول.',
                    ephemeral: true
                });
            }
        }
        else if (subcommand === 'list') {
            try {
                const broadcasts = db.getAllActiveBroadcasts().filter(b => b.guild_id === guildId);

                if (!broadcasts || broadcasts.length === 0) {
                    return interaction.reply({ content: '📭 لا توجد أي إعلانات مجولة نشطة في هذا السيرفر حالياً.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('📢 قائمة الإعلانات المجدولة النشطة')
                    .setDescription(broadcasts.map(b => `**ID:** \`${b.id}\`\n📍 القناة: <#${b.channel_id}>\n⏱️ التكرار: كل **${b.interval_minutes} دقيقة**\n📌 العنوان: ${b.title || 'بدون عنوان (نصي)'}\n-------------------`).join('\n'))
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (err) {
                console.error('خطأ في جلب الإعلانات:', err);
                return interaction.reply({ content: '❌ حدث خطأ أثناء استعراض الإعلانات المجدولة.', ephemeral: true });
            }
        }
        else if (subcommand === 'remove') {
            const broadcastId = interaction.options.getInteger('id');
            try {
                db.removeBroadcast(broadcastId);
                return interaction.reply({ content: `🗑️ تم حذف الإعلان المجدول برقم \`${broadcastId}\` بنجاح.`, ephemeral: true });
            } catch (err) {
                console.error('خطأ في حذف الإعلان:', err);
                return interaction.reply({ content: '❌ حدث خطأ أثناء محاولة حذف الإعلان.', ephemeral: true });
            }
        }
    }
};