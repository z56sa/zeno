const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

let aiClient = null;

function getClient() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    if (!aiClient) {
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
}

/**
 * دالة مركزية للتحدث مع الذكاء الاصطناعي (Gemini)
 * @param {string} promptText نص السؤال أو المحادثة
 * @returns {Promise<string>} رد الذكاء الاصطناعي
 */
async function askAI(promptText) {
    if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
        return '❌ يرجى كتابة سؤال صالح.';
    }

    const ai = getClient();
    if (!ai) {
        return '❌ لم يتم ضبط مفتاح `GEMINI_API_KEY` في متغيرات البيئة (Environment Variables).';
    }

    const modelsToTry = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
    ];

    let lastError = null;
    for (const model of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: promptText.trim(),
            });
            if (response && response.text) {
                return response.text;
            }
        } catch (error) {
            lastError = error;
            console.warn(`[AI] فشلت المحاولة باستخدام النموذج ${model}:`, error?.message || error);
        }
    }

    console.error('[AI Error] تعذر الحصول على رد من Gemini:', lastError);
    return '❌ عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي، يرجى المحاولة لاحقاً.';
}

module.exports = { askAI };
