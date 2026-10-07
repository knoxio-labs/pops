/**
 * `accounts/:id/grants` sub-router (POPS-5864, epic POPS-5827).
 *
 * A grant gives one email `view` or `edit` on one account. These three routes
 * are how the operator hands that out, changes it and takes it back.
 *
 * None of them is marked `guestRoute()`, deliberately: a guest holding `edit`
 * on an account still cannot see or change who else it is shared with.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ACCOUNT_GRANT_ROLES } from '../db/index.js';
import { ERR_RESPONSES, MessageSchema } from './rest-schemas.js';

const c = initContract();

/** Longest address RFC 5321 allows on the wire. */
const MAX_EMAIL_LENGTH = 254;

export const AccountGrantRoleSchema = z.enum(ACCOUNT_GRANT_ROLES);

export const AccountGrantSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  /** Lower-cased; the form the grantee's sign-in email is compared in. */
  email: z.string(),
  role: AccountGrantRoleSchema,
  createdAt: z.string(),
  /** Email of whoever first granted it. Null when that caller carried no identity. */
  createdBy: z.string().nullable(),
});

export const PutAccountGrantInputSchema = z.object({
  email: z.email().max(MAX_EMAIL_LENGTH),
  role: AccountGrantRoleSchema,
});

const AccountParams = z.object({ id: z.string() });

export const financeAccountGrantsContract = c.router({
  list: {
    method: 'GET',
    path: '/accounts/:id/grants',
    pathParams: AccountParams,
    responses: { 200: z.object({ data: z.array(AccountGrantSchema) }), ...ERR_RESPONSES },
    summary: 'List who an account is shared with, ordered by email',
  },
  put: {
    method: 'PUT',
    path: '/accounts/:id/grants',
    pathParams: AccountParams,
    body: PutAccountGrantInputSchema,
    responses: {
      200: z.object({ data: AccountGrantSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Give an email view or edit on an account, or change the role it already holds. ' +
      'The email is matched case-insensitively, so one address has at most one grant per account',
  },
  remove: {
    method: 'DELETE',
    path: '/accounts/:id/grants/:grantId',
    pathParams: AccountParams.extend({ grantId: z.string() }),
    body: z.object({}).optional(),
    responses: { 204: MessageSchema.optional(), ...ERR_RESPONSES },
    summary: 'Revoke a grant; the grantee loses the account on their next request',
  },
});
