const fs = require('fs');
const path = require('path');
const { REST, Routes, Collection } = require('discord.js');
const logger = require('../utils/logger');

module.exports = async (client) => {
  client.commands = new Collection();
  client.prefixCommands = new Collection();
  client.aliases = new Collection();

  const slashCommandsArray = [];
  const commandsPath = path.join(__dirname, '../commands');
  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(categoryPath, file);
      const command = require(filePath);

      if (command.data && command.data.name) {
        command.category = category;
        client.commands.set(command.data.name, command);
        slashCommandsArray.push(command.data.toJSON());
      }

      // دعم الأوامر النصية البرفكس (Prefix)
      if (command.name) {
        command.category = category;
        client.prefixCommands.set(command.name.toLowerCase(), command);
        if (command.aliases && Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            client.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
          }
        }
      }
    }
  }

  logger.info(`تم تحميل ${client.commands.size} أمر سلاش و ${client.prefixCommands.size} أمر نصي.`);

  // تسجيل أوامر السلاش في الديسكورد في الخلفية بشكل غير معطل (Background Asynchronous)
  const botToken = (process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
  const clientId = (process.env.CLIENT_ID || '').trim();
  if (botToken && clientId && botToken !== 'YOUR_BOT_TOKEN_HERE') {
    const rest = new REST({ version: '10' }).setToken(botToken);
    (async () => {
      try {
        logger.info('جاري تسجيل أوامر السلاش (Slash Commands) عالمياً في الخلفية...');
        const registered = await rest.put(
          Routes.applicationCommands(clientId),
          { body: slashCommandsArray }
        );
        client.slashCommandIds = new Map();
        if (Array.isArray(registered)) {
          for (const cmd of registered) {
            client.slashCommandIds.set(cmd.name, cmd.id);
          }
        }
        logger.success('تم تسجيل وتحديث أوامر السلاش بنجاح!');
      } catch (error) {
        logger.error('حدث خطأ أثناء تسجيل أوامر السلاش في الخلفية:', error);
      }
    })();
  }
};
