const { SlashCommandBuilder } = require('discord.js');
// استيراد دالة الـ AI الموجودة في ملف index.js الرئيسي
const { askAI } = require('../index.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('اسأل ذكاء جوجل الاصطناعي (Gemini) أي سؤال!')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('السؤال الذي تريد طرحه على البوت')
                .setRequired(true)
        ),

    async execute(interaction) {
        // إعلام المستخدم أن البوت جاري التفكير (لتجنب انتهاء مهلة التفاعل)
        await interaction.deferReply();

        const question = interaction.options.getString('question');

        try {
            // استدعاء دالة الذكاء الاصطناعي
            const aiResponse = await askAI(question);

            // التحقق من طول الرد لأنه مسموح بـ 2000 حرف كحد أقصى في رسائل ديسكورد
            if (aiResponse.length > 2000) {
                // إذا كان الرد طويلاً، يمكنك إرساله على دفعات أو اختصاره
                await interaction.editReply(aiResponse.substring(0, 2000));
            } else {
                await interaction.editReply(aiResponse);
            }
        } catch (error) {
            console.error('Error generating AI response:', error);
            await interaction.editReply('عذراً، حدث خطأ أثناء محاولة الاتصال بالذكاء الاصطناعي.');
        }
    },
};