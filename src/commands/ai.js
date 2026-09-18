module.exports = {
    name: 'ai', // اسم الأمر النصي
    description: 'التحدث مع الذكاء الاصطناعي',
    async execute(message, args) {
        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ يرجى كتابة السؤال أو النص بعد الأمر، مثال: `#ai مرحباً`');
        }

        const waiting = await message.reply('⏳ جاري المعالجة...');

        try {
            // استدعاء دالة الـ AI الخاصة بك
            const aiResponse = await askAI(query);

            // إذا كان رد الذكاء الاصطناعي طويلاً، نقوم بتقسيمه لكي لا يتخطي حدود ديسكورد (2000 حرف)
            if (aiResponse.length > 2000) {
                const chunks = aiResponse.match(/[\s\S]{1,2000}/g);
                await waiting.edit(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await message.channel.send(chunks[i]);
                }
            } else {
                await waiting.edit(aiResponse);
            }
        } catch (error) {
            console.error(error);
            await waiting.edit('❌ حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.');
        }
    }
};