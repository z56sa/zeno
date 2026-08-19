// C:\Users\PCD\Desktop\zeno\game_modules\trivia_module.js
const { SlashCommandBuilder } = require('discord.js');
const { WINNER_TEMPLATE } = require('../utils/templates'); // Import the template

/**
 * @param {Message} interaction The Discord interaction object.
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Plays a trivia round.')
        .addStringOption(option => 
            option.setName('difficulty').setDescription('Difficulty level (easy/hard).').setChoices(
                { value: 'easy', name: 'Easy' }, 
                { value: 'hard', name: 'Hard' }
            ).required(),
        ),
    async execute(interaction) {
        const difficulty = interaction.options.getString('difficulty');
        await interaction.reply({ content: `Starting ${difficulty} trivia round!`, ephemeral: true });

        // --- Placeholder Game Logic Start ---
        // Simulate a game played and results determined
        const winnerName = 'User Name'; // Replace with actual winner determination logic
        let finalScore = 0; 
        if (difficulty === 'hard') {
            finalScore = 950;
        } else if (difficulty === 'easy') {
            finalScore = 700;
        }

        // Critical Integration Point: Use the centralized template
        const announcement = WINNER_TEMPLATE(winnerName, 'Trivia Challenge', finalScore);

        // Send the formatted winner announcement to the channel
        await interaction.channel.send(`\n${announcement}`); 
        console.log("Winner announcement sent using integrated template.");
        // --- Placeholder Game Logic End ---
    }
};