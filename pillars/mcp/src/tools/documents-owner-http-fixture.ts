import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import express from 'express';
import { expect } from 'vitest';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { contractInputs } from '../contract-inputs.js';
import { documentsReadContracts } from './documents-owner-contract.js';

import type { Express } from 'express';

type TaskState = 'pending' | 'done' | 'duplicate';
type UploadState = 'awaiting_content' | 'admitted' | 'accepted';

/** Fixture state and real owner HTTP surface used by the MCP upload integration test. */
export interface DocumentsOwnerHttpFixture {
  readonly app: Express;
  taskState: TaskState;
  uploadState: UploadState;
  created: boolean;
  refuseDispatch: boolean;
  posts: number;
  legacyPosts: number;
  contentWrites: number;
  bytes: Buffer<ArrayBufferLike>;
  createBodies: unknown[];
}

/** Fictional original bytes whose exact digest and length are declared by the caller. */
export const originalBytes = Buffer.from('%PDF-fictional-test');
/** Caller-retained immutable identity used by the real SDK and raw upload router. */
export const uploadInput = {
  operationId: '0c8c5b6e-2817-4f70-98f9-0f5f274f9e1c',
  fileName: 'rail.pdf',
  title: 'Rail original',
  mimeType: 'application/pdf',
  byteLength: originalBytes.byteLength,
  sha256: createHash('sha256').update(originalBytes).digest('hex'),
};
/** Actual source identity exposed only after the fictional owner's task completes. */
export const original = {
  id: 91,
  title: 'Rail original',
  created: '2026-11-12',
  originalFileName: 'rail.pdf',
  thumbnailUrl: '/91/thumb',
};

/** Builds a stateful Documents owner fixture; gateway token resets do not reset owner proof. */
export function createDocumentsOwnerHttpFixture(): DocumentsOwnerHttpFixture {
  const state: DocumentsOwnerHttpFixture = {
    app: express(),
    taskState: 'pending',
    uploadState: 'awaiting_content',
    created: false,
    refuseDispatch: false,
    posts: 0,
    legacyPosts: 0,
    contentWrites: 0,
    bytes: Buffer.alloc(0),
    createBodies: [],
  };
  registerOpenApi(state.app);
  registerAuthorization(state.app);
  registerReadRoutes(state);
  registerUploadRoutes(state);
  return state;
}

function registerOpenApi(app: Express): void {
  app.get('/openapi', (_req, res) =>
    res.json(JSON.parse(readFileSync(contractInputs.documents, 'utf8')))
  );
}

function registerAuthorization(app: Express): void {
  app.use('/paperless', (req, res, next) => {
    if (req.get(SERVICE_ACCOUNT_HEADER) === 'fixture') next();
    else {
      res.status(403).json({
        code: 'documents.auth.forbidden',
        message: 'Forbidden',
        requestId: 'fixture',
        retryable: false,
      });
    }
  });
}

function registerReadRoutes(state: DocumentsOwnerHttpFixture): void {
  state.app.get('/paperless/status', (_req, res) =>
    res.json({
      data: {
        configured: true,
        available: true,
        baseUrl: null,
        documentCount: 1,
        maxUploadBytes: 47,
        allowedMimeTypes: ['application/pdf'],
      },
    })
  );
  state.app.get('/paperless/search', (req, res) => {
    expect(req.query).toEqual({ query: 'rail' });
    res.json({ data: [original] });
  });
  state.app.get('/paperless/documents/:id', (req, res) => {
    expect(req.params.id).toBe('91');
    res.json({ data: original });
  });
  state.app.get('/paperless/tasks/:taskId', (req, res) => {
    expect(req.params.taskId).toBe('owner-ingestion');
    expect(state.posts).toBe(1);
    res.json({
      data: {
        state: state.taskState,
        documentId: state.taskState === 'pending' ? null : 91,
        reason: null,
      },
    });
  });
}

function registerUploadRoutes(state: DocumentsOwnerHttpFixture): void {
  state.app.post('/paperless/uploads', express.json(), (req, res) => {
    const body: unknown = req.body;
    expect(documentsReadContracts.createUpload.input.validate(body).valid).toBe(true);
    expect(body).toEqual(uploadInput);
    state.createBodies.push(body);
    state.created = true;
    res.json(ownerProof(state));
  });
  registerContentRoute(state);
  registerDispatchRoute(state);
  state.app.get('/paperless/uploads/:operationId', (req, res) => {
    expect(state.created).toBe(true);
    expect(req.params.operationId).toBe(uploadInput.operationId);
    res.json(ownerProof(state));
  });
  state.app.post('/paperless/documents', (_req, res) => {
    state.legacyPosts++;
    res.status(410).end();
  });
}

function registerContentRoute(state: DocumentsOwnerHttpFixture): void {
  state.app.put(
    '/paperless/uploads/:operationId/content',
    express.raw({ type: 'application/pdf' }),
    (req, res) => {
      expect(state.created).toBe(true);
      expect(req.params.operationId).toBe(uploadInput.operationId);
      expect(state.uploadState).toBe('awaiting_content');
      expect(req.get('content-type')).toBe(uploadInput.mimeType);
      expect(req.get('content-length')).toBe(String(uploadInput.byteLength));
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body)) throw new Error('Expected streamed original bytes');
      expect(body).toEqual(originalBytes);
      expect(createHash('sha256').update(body).digest('hex')).toBe(uploadInput.sha256);
      state.bytes = body;
      state.contentWrites++;
      state.uploadState = 'admitted';
      res.json(ownerProof(state));
    }
  );
}

function registerDispatchRoute(state: DocumentsOwnerHttpFixture): void {
  state.app.post('/paperless/uploads/:operationId/dispatch', (req, res) => {
    expect(req.params.operationId).toBe(uploadInput.operationId);
    expect(state.uploadState).not.toBe('awaiting_content');
    if (state.refuseDispatch) {
      res.status(503).json({
        code: 'documents.upload.storage',
        message: 'Durable upload storage is unavailable.',
        requestId: 'fixture',
        retryable: true,
      });
      return;
    }
    if (state.uploadState === 'admitted') {
      state.posts++;
      state.uploadState = 'accepted';
    }
    res.json(ownerProof(state));
  });
}

function ownerProof(state: DocumentsOwnerHttpFixture): { readonly data: object } {
  const completed = state.uploadState === 'accepted' && state.taskState !== 'pending';
  const record = {
    input: uploadInput,
    ownerMatches: true,
    state: completed ? state.taskState : state.uploadState,
    contentAvailable: state.uploadState !== 'awaiting_content',
    taskId: state.uploadState === 'accepted' ? 'owner-ingestion' : null,
    documentId: completed ? 91 : null,
    reason: null,
  };
  expect(documentsReadContracts.upload.response({ data: record }).valid).toBe(true);
  return { data: record };
}
