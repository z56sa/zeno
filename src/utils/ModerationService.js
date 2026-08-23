// ==============================================
// 🛠️ ADVANCED MODERATION CHECKING FUNCTIONS (New Logic)
// ==============================================

/**
 * التحقق من وجود رابط مشبوه في الرسالة بناءً على Regex المحدد في التكوين.
 */
const checkLink = async (message, config) => {
    if (!config?.rules?.spam_control?.anti_link_spam?.enabled) return false;
    try {
        // استخدام regex من الكونفيج المُحمّل
        const regex = new RegExp(config.rules.spam_control.anti_link_spam.regex);
        const linkMatch = message.content.match(regex);

        if (linkMatch) {
            // **ملاحظة:** يجب إضافة دالة تحقق من النطاق المسموح به هنا في بيئة العمل الحقيقية.
            return true; // نعتبره مشبوهًا بشكل افتراضي لتفعيله.
        }
    } catch (e) {
        console.error("Error checking link:", e);
    }
    return false;
};

/**
 * التحقق من الكلمات المحظورة في الرسالة بناءً على قائمة التكوين.
 */
const isProfanity = (message, config) => {
    if (!config?.rules?.profanity_filter?.enabled || !Array.isArray(config.rules.profanity_filter.banned_words)) return false;

    // تنظيف المحتوى: تحويل إلى أحرف صغيرة وإزالة علامات الترقيم للتحقق الأكثر صرامة.
    const cleanContent = message.content.toLowerCase().replace(/[^a-z0-9\s]/g, '');

    for (const word of config.rules.profanity_filter.banned_words) {
        if (cleanContent.includes(word.toLowerCase())) {
            return true; // تم العثور على كلمة محظورة
        }
    }
    return false;
};

/**
 * التحقق من معدل إرسال الرسائل والسبام المتعدد (Rate Limiting).
 * **يتطلب هذا الدالة الوصول إلى سجل بيانات المستخدم في الـ DB.**
 */
const checkRateLimit = async (user, config) => {
    if (!config?.rules?.spam_control?.anti_word_spam?.enabled) return null;

    // **ملاحظة:** يجب استبدال هذا الجزء بمنطق حقيقي لقراءة سجل الرسائل للمستخدم من قاعدة البيانات.
    /*
    const userMessages = await getRecentUserMessages(user.id, 'messageCreate', config.rules.spam_control.anti_word_spam.max_count);
    if (userMessages.length > config.rules.spam_control.anti_word_spam.max_count) {
        return "Word Spam / Excessive Messaging";
    }
    */
    return null; // Placeholder: يجب استكمال هذا الجزء بربطه بقاعدة البيانات الفعليّة.
};

// ==============================================
// 🚀 دالة المعالجة الرئيسية (يتم استدعاؤها عند كل حدث رسالة)
// ==============================================
async function processMessageForModeration(message, client, config) {
    if (!config?.moderation?.enabled) return;

    const user = message.author;

    // 1. فحص الروابط (الأولوية القصوى للأمان)
    let linkViolation = await checkLink(message, config);
    if (linkViolation) {
        await client.send('🛡️ تم حذف هذه الرسالة لأنها تحتوي على رابط مُشتبه به.');
        return;
    }

    // 2. فحص الكلمات المحظورة (Profanity Check)
    if (isProfanity(message, config)) {
        const action = config.rules.profanity_filter?.action_type || 'warning';
        await client.send(`⚠️ **مخالفة محتوى:** تم حذف الرسالة بسبب استخدام كلمة محظورة.`);
        // هنا يتم استدعاء دالة تنفيذ العقوبة (ApplyPunishment(user, action))
    }

    // 3. فحص معدل الإرسال والسبام المتعدد (Rate Limit)
    const rateLimitViolation = await checkRateLimit(user, config);
    if (rateLimitViolation) {
        await client.send(`🚫 **تنبيه:** تم حذف الرسالة لأنك تجاوزت الحد المسموح به للرسائل.`);
        // هنا يتم استدعاء دالة تنفيذ العقوبة (ApplyPunishment(user, 'spam'))
    }
}