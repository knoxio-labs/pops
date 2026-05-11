/**
 * Public types for the AI alert subsystem (PRD-092 US-07).
 *
 * The alert evaluator is intentionally narrow: rule types map 1:1 to
 * evaluator implementations and each fires alerts with a stable shape.
 */

export const ALERT_RULE_TYPES = ['budget-threshold', 'error-spike', 'latency-degradation'] as const;

export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const ALERT_CHANNELS = ['telegram', 'nudge'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const ALERT_SEVERITIES = ['warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** Decoded alert rule as exposed by the service layer. */
export interface AlertRule {
  id: number;
  type: AlertRuleType;
  scopeProvider: string | null;
  scopeModel: string | null;
  thresholdValue: number;
  windowMinutes: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A single fired alert. */
export interface FiredAlert {
  id: number;
  ruleId: number | null;
  type: AlertRuleType;
  message: string;
  severity: AlertSeverity;
  scopeDetail: string | null;
  metricValue: number;
  thresholdValue: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

/**
 * Result of evaluating a single rule. The evaluator returns zero or more
 * trigger candidates — for example a single "latency-degradation" rule that
 * is unscoped fans out into one candidate per model that breaches the
 * threshold.
 */
export interface AlertCandidate {
  ruleId: number;
  type: AlertRuleType;
  severity: AlertSeverity;
  message: string;
  scopeDetail: string | null;
  metricValue: number;
  thresholdValue: number;
}

/** A persisted alert plus the channels it should be dispatched on. */
export interface DispatchedAlert extends FiredAlert {
  channels: AlertChannel[];
}
