/**
 * Hard safety lock for real trade execution.
 * Keep this locked until backtest validation is complete.
 */
export const TRADE_EXECUTION_LOCK = {
  locked: true,
  reason:
    'Auto trade execution is temporarily disabled. Enable only after sufficient backtest validation.',
} as const;

