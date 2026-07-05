/**
 * Unit tests for the per-import-run AI circuit breaker (CP026/#3656/CF039).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { AiCircuitBreaker, getCircuitBreakerThreshold } from '../ai-circuit-breaker.js';

afterEach(() => {
  delete process.env['FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD'];
});

describe('getCircuitBreakerThreshold', () => {
  it('defaults to 3 consecutive rate-limited calls', () => {
    expect(getCircuitBreakerThreshold()).toBe(3);
  });

  it('honours the env override', () => {
    process.env['FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD'] = '5';
    expect(getCircuitBreakerThreshold()).toBe(5);
  });

  it('ignores an invalid override and falls back to the default', () => {
    process.env['FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD'] = '0';
    expect(getCircuitBreakerThreshold()).toBe(3);
    process.env['FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD'] = 'nope';
    expect(getCircuitBreakerThreshold()).toBe(3);
  });
});

describe('AiCircuitBreaker', () => {
  it('starts closed', () => {
    const breaker = new AiCircuitBreaker(3);
    expect(breaker.isOpen).toBe(false);
  });

  it('opens once the threshold of consecutive rate-limited calls is reached', () => {
    const breaker = new AiCircuitBreaker(3);
    breaker.recordRateLimited();
    expect(breaker.isOpen).toBe(false);
    breaker.recordRateLimited();
    expect(breaker.isOpen).toBe(false);
    breaker.recordRateLimited();
    expect(breaker.isOpen).toBe(true);
  });

  it('stays open past the threshold', () => {
    const breaker = new AiCircuitBreaker(1);
    breaker.recordRateLimited();
    breaker.recordRateLimited();
    expect(breaker.isOpen).toBe(true);
  });

  it('a recovery resets the consecutive-failure streak', () => {
    const breaker = new AiCircuitBreaker(2);
    breaker.recordRateLimited();
    breaker.recordRecovery();
    breaker.recordRateLimited();
    expect(breaker.isOpen).toBe(false);
  });

  it('respects a custom threshold over the env default', () => {
    process.env['FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD'] = '10';
    const breaker = new AiCircuitBreaker(1);
    breaker.recordRateLimited();
    expect(breaker.isOpen).toBe(true);
  });
});
