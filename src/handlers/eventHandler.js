const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

module.exports = (client) => {
  const eventsPath = path.join(__dirname, '../events');
  const eventFolders = fs.readdirSync(eventsPath);

  let eventsCount = 0;

  for (const folder of eventFolders) {
    const folderPath = path.join(eventsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const eventFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
      const filePath = path.join(folderPath, file);
      const event = require(filePath);

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      eventsCount++;
    }
  }

  logger.info(`تم تحميل ${eventsCount} حدث (Event) بنجاح.`);
};
