export const MVP_SCOPE = {
  regionMode: "gangneung-only",
  supportedCities: ["강릉시"] as const,
  districtSelectionEnabled: false,
} as const;

export type SupportedCity = (typeof MVP_SCOPE.supportedCities)[number];
