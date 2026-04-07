export const MVP_REGION_SCOPE = {
  mode: "gangneung-only",
  supportedCities: ["gangneung-si"] as const,
  citySelectOptions: [
    { label: "\uc120\ud0dd \uc548 \ud568", value: null },
    { label: "\uac15\ub989\uc2dc", value: "gangneung-si" as const },
  ],
  districtSelectEnabled: false,
} as const;

export type SupportedCity = (typeof MVP_REGION_SCOPE.supportedCities)[number];
