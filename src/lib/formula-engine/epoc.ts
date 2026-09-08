export interface EpocResult {
  epocCalories: number;
  epocDurationHours: number;
}

/**
 * EPOC (afterburn) estimate, PDF page 7. Driven by minutes spent above
 * 80% MHR (zone 4 + zone 5 minutes). Accuracy is ±25% per the PDF —
 * always display as an approximate "afterburn estimate", and NEVER add
 * this into net/adjusted calories, always show it separately.
 */
export function computeEpoc(zone4Minutes: number, zone5Minutes: number, weightKg: number): EpocResult {
  const minutesAbove80 = zone4Minutes + zone5Minutes;
  const epocCalories = minutesAbove80 * 0.15 * (weightKg / 70);
  // Rule of thumb: 1 hour of afterburn per 10 minutes above 80% MHR.
  const epocDurationHours = minutesAbove80 / 10;
  return { epocCalories, epocDurationHours };
}
