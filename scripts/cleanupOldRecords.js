#!/usr/bin/env node
import { cleanupOldRecords } from '../services/dynamo.js';

const retentionDays = Number(process.env.RETENTION_DAYS || 30);

cleanupOldRecords({ retentionDays })
  .then(() => {
    console.log(`Removed records older than ${retentionDays} days`);
  })
  .catch((err) => {
    console.error('Cleanup failed', err);
    process.exit(1);
  });
