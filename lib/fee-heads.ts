/** Fee type heads offered as a dropdown wherever a fee head is captured. */
export const FEE_HEADS = [
  "Eligibility fees",
  "I unit test",
  "I term exam",
  "II unit test",
  "II term exam",
  "TC fees",
  "Other fees",
] as const;

export type FeeHead = (typeof FEE_HEADS)[number];
