require('dotenv').config();
const { connect, mongoose } = require('../config/database');
const models = require('../models');

(async () => {
  try {
    await connect();
    const names = Object.keys(models);
    for (const name of names) {
      const model = models[name];
      if (!model || typeof model.syncIndexes !== 'function') continue;
      const result = await model.syncIndexes();
      console.log(`✅ ${name}: indexes synced`, result);
    }
    await mongoose.connection.close(false);
    process.exit(0);
  } catch (error) {
    console.error('❌ Index sync failed:', error);
    process.exit(1);
  }
})();
