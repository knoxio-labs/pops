# Ingest worker

The `pops-worker-food` daemon. Same image as the API server, different CMD
(`dist/worker/worker.js`); `worker.ts` documents its own lifecycle, dispatch and
cancellation. What this file adds is the shape of the loop it sits in and what
each kind reaches out to.

## The loop, and where each hop lives

```
POST /ingest/start          api/modules/ingest/ingest-procedures-start.ts
  → ingest_sources row + (screenshot only) bytes written to disk
  → BullMQ enqueue          api/modules/ingest/ingest-enqueue.ts
                            queue name + job/result types: contract/queue/index.ts
  → this daemon             worker.ts → dispatch.ts → handlers/<kind>.ts
  → POST /ingest/worker-complete   worker/api-client.ts
  → uncompiled draft recipe api/modules/ingest/ingest-worker-complete.ts
```

The worker never touches SQLite — every write goes back through the
`worker-complete` callback.

## What each kind reaches out to

| Kind            | Handler                                               | Off-box calls                                                                                                                                                                             |
| --------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`          | `handlers/text.ts`                                    | One Claude text call.                                                                                                                                                                     |
| `screenshot`    | `handlers/screenshot.ts`                              | One Claude vision call over the image the producer wrote to disk.                                                                                                                         |
| `url-instagram` | `handlers/instagram.ts` → `instagram/orchestrator.ts` | `yt-dlp` (with a mounted Netscape cookie file), `ffmpeg`, `python3 -m faster_whisper.cli`, then one Claude vision call and, if that fails on a long enough caption, one Claude text call. |
