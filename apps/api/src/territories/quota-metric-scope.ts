export function selectMetricQuotas<T extends { periodIndex: number }>(
  quotas: T[]
): T[] {
  const indexed = quotas.filter(quota => quota.periodIndex > 0);
  return indexed.length > 0 ? indexed : quotas;
}
