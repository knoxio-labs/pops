import type { ErrorRequestHandler } from 'express';

/**
 * A status no handler under test ever answers with, so seeing it is
 * unambiguous.
 */
export const PASSED_THROUGH_STATUS = 599;

/**
 * A terminal error handler that reports the error it was handed.
 *
 * Mounted after an error-mapping middleware, it is what tells "declined this
 * error and called `next(err)`" apart from "swallowed it": the response below
 * only happens if the middleware passed the error along.
 */
export const passThroughErrorReporter: ErrorRequestHandler = (err, _req, res, _next) => {
  res
    .status(PASSED_THROUGH_STATUS)
    .json({ passedThrough: err instanceof Error ? err.message : String(err) });
};
