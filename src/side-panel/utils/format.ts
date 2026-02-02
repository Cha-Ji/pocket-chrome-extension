// ============================================================
// Formatting Utils
// ============================================================

export const formatMoney = (value: number | undefined | null, decimals = 2): string => {
  if (value === undefined || value === null || isNaN(value)) return '0.00'
  return value.toFixed(decimals)
}

export const formatPercent = (value: number | undefined | null, decimals = 1): string => {
  if (value === undefined || value === null || isNaN(value)) return '0.0'
  return value.toFixed(decimals)
}

export const formatNumber = (value: number | undefined | null, decimals = 0): string => {
  if (value === undefined || value === null || isNaN(value)) return '0'
  return value.toFixed(decimals)
}
