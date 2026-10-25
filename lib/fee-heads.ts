/** Fee type heads offered as a dropdown wherever a fee head is captured. */
export const FEE_HEADS = [
  "Admission fee",
  "Tuition fee",
  "Eligibility fees",
  "I unit test",
  "I term exam",
  "II unit test",
  "II term exam",
  "Board exam fees",
  "TC fees",
  "Other fees",
] as const;

export type FeeHead = (typeof FEE_HEADS)[number];

/**
 * Heads that are charged only when an event happens (e.g. a Transfer
 * Certificate is requested) and so are added to a student individually rather
 * than through a class-wide structure. Each may be charged once per year.
 */
export const CONDITIONAL_FEE_HEADS: readonly FeeHead[] = ["TC fees", "Board exam fees", "Eligibility fees"];
