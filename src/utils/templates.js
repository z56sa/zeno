/**
 * @module Templates
 * Provides standardized Discord Markdown templates for bot announcements.
 */

const WINNER_TEMPLATE = (winnerName, gamePlayed, score) => {
    return `✨🏆 **👑 GRAND WINNER ANNOUNCEMENT! 🥳** 🏆✨

*A monumental performance that will be remembered forever!*

---------------------------------------------

🎉🎊 **CONGRATULATIONS TO OUR CHAMPION!** 🌟

🥇 **WINNER NAME:** ${winnerName}
🚀 **GAME PLAYED:** ${gamePlayed}
🔥 **FINAL SCORE:** ${score} 🔥

***
*This victory is a testament to skill, dedication, and sheer brilliance. Keep dominating!*

✨🏅 *The Bot Team* 🤖.`;
};

module.exports = {
    WINNER_TEMPLATE
};