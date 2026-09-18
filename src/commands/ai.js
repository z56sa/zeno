import { GoogleGenAI } from '@google/genai';

// التهيئة باستخدام المفتاح الخاص بك من ملف .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askAI(promptText) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptText,
        });
        return response.text;
    } catch (error) {
        console.error("خطأ في الاتصال بـ Gemini AI:", error);
        return "عذراً، حدث خطأ أثناء معالجة طلبك.";
    }
}