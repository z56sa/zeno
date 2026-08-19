// C:\Users\PCD\Desktop\zeno\game_modules\rps_module.js
const { SlashCommandBuilder } = require('discord.js');
const { WINNER_TEMPLATE } = require('../utils/templates'); // Import the shared template

/**
 * @param {Message} interaction The Discord interaction object.
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Plays Rock, Paper, Scissors against the bot.')
        .addStringOption(option => 
            option.setName('move').setDescription('Your move (rock/paper/scissors)').setChoices(
                { value: 'rock', name: 'Rock' }, 
                { value: 'paper', name: 'Paper' }
            ).required(), // Note: Only including rock/paper for simplified command structure demonstration, but ideally all three.
        ),
    async execute(interaction) {
        const userMove = interaction.options.getString('move');
        // --- Placeholder Game Logic Start ---
        // Simulate bot response and game outcome logic (e.g., random selection vs comparison)
        
        let winnerName = interaction.user.tag; // Use the actual user's tag/name
        let finalScore = 1000; // Assuming a high score for demonstration victory
        let playedGame = 'Rock Paper Scissors';

        // Mock winning condition (e.g., if the move is 'paper' and the bot chooses 'rock')
        const didUserWin = userMove === 'paper'; 

        if (didUserWin) {
            console.log("RPS Game Logic: User has won!");
            
            // Critical Integration Point: Use the centralized template for announcement
            const announcement = WINNER_TEMPLATE(winnerName, playedGame, finalScore);

            // Send the formatted winner announcement to the channel
            await interaction.channel.send(`\n${announcement}`); 
            return; // End execution after sending win message
        } else {
             // Handle loss/draw message (not using winner template)
             await interaction.reply({ content: `Sorry ${winnerName}, you lost the game of ${playedGame}. Better luck next time!`, ephemeral: true });
        }
        // --- Placeholder Game Logic End ---
    }
};