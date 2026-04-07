export const MVP_REGION_SCOPE = {
  mode: "gangneung-only",
  supportedCities: ["강릉시"] as const,
  citySelectOptions: [
    { label: "선택 안 함", value: null },
    { label: "강릉시", value: "강릉시" as const },
  ],
  districtSelectEnabled: false,
} as const;

export type SupportedCity = (typeof MVP_REGION_SCOPE.supportedCities)[number];
