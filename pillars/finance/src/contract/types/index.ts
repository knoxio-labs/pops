/**
 * Public entity types for the finance pillar. Hand-maintained against the
 * `rest-*.ts` zod contracts (the single source of truth for the served wire
 * shape) rather than a separate parallel schema module (CF079/#3670).
 */
export type { Budget, BudgetPeriod } from './budget.js';
export { ENTITY_TYPES } from './entity.js';
export type { Entity, EntityType } from './entity.js';
export type { Transaction } from './transaction.js';
export type { WishListItem, WishListPriority } from './wish-list-item.js';
