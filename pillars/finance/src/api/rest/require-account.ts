import {
  AccountNotFoundError,
  accountsService,
  type AccountRow,
  type FinanceDb,
} from '../../db/index.js';
import { NotFoundError } from '../shared/errors.js';

/** 404 unless the account exists; returns it so callers can read `archivedAt`. */
export function requireAccount(db: FinanceDb, id: string): AccountRow {
  try {
    return accountsService.getAccount(db, id);
  } catch (err) {
    if (err instanceof AccountNotFoundError) throw new NotFoundError('Account', id);
    throw err;
  }
}
