import { resolve } from 'node:path';

import { provisionDispatchGuard } from './dispatch-guard.js';

const directory = process.env['DOCUMENTS_UPLOAD_GUARD_DIR'];
const guardId = process.env['DOCUMENTS_UPLOAD_GUARD_ID'];
if (directory === undefined || directory === '' || guardId === undefined || guardId === '')
  throw new Error('An explicit guard directory and deployment UUID are required');
provisionDispatchGuard(resolve(directory), guardId);
