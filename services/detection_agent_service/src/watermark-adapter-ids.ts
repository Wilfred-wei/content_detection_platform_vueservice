export const WATERMARK_ADAPTER_IDS = [
  "c2pa-local-v1",
  "metadata-local-v1",
  "sdxl-dwt-dct-v1",
  "classic-invisible-watermarks-v1",
  "trustmark-pq-v1",
  "meta-watermarks-v1",
] as const;

export type WatermarkAdapterId = typeof WATERMARK_ADAPTER_IDS[number];

const WATERMARK_ADAPTER_ID_SET = new Set<string>(WATERMARK_ADAPTER_IDS);

export function isAllowlistedAdapterId(value: string): value is WatermarkAdapterId {
  return WATERMARK_ADAPTER_ID_SET.has(value);
}
