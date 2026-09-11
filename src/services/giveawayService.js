/**
 * @module giveawayService
 * @description خدمة فحص وإنهاء سحوبات القيف أواي التلقائية فور انتهاء وقتها
 * تعمل كل 10 ثوان لفحص أي قيف أواي بلغ وقته أو تجاوزه، وإنهائه فورا وإعلان الفائزين
 */

const giveawayCommand = require("../commands/general/giveaway");
const database = require("../database");

class GiveawayService {
    constructor(client) {
        this.client = client;
        this._interval = null;
        this.running = false;
        this.processing = new Set();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._tick().catch(() => {});
        this._interval = setInterval(() => this._tick().catch(() => {}), 10 * 1000);
        console.log("[GiveawayService] ✅ خدمة مراقبة وإنهاء القيف أواي تعمل بنجاح (فحص كل 10 ثوان)");
    }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this.running = false;
    }

    async _tick() {
        try {
            const rawDb = database.rawDb || database.db;
            if (!rawDb) return;

            const now = Date.now();
            const dueGiveaways = rawDb.prepare(
                "SELECT * FROM giveaways WHERE status = 'active' AND end_time <= ?"
            ).all(now);

            for (const gw of dueGiveaways) {
                if (this.processing.has(gw.message_id)) continue;
                this.processing.add(gw.message_id);

                try {
                    await giveawayCommand.finishGiveaway(gw.message_id, this.client);
                } catch (err) {
                    console.error("[GiveawayService] Error finishing giveaway " + gw.message_id + ":", err.message);
                } finally {
                    this.processing.delete(gw.message_id);
                }
            }
        } catch (e) {
            console.error("[GiveawayService] Error in tick:", e.message);
        }
    }
}

module.exports = GiveawayService;
