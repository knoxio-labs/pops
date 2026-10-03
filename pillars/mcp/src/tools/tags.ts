import { tagsReadTools } from './tags-read.js';
import { tagsWriteTools } from './tags-write.js';

import type { ToolDef } from './tool-def.js';

export const tagsTools: readonly ToolDef[] = [...tagsReadTools, ...tagsWriteTools];
