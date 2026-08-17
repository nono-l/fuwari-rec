/** Build timestamp injected by Vite (JST, e.g. 2026/08/17 10:07). */
export const APP_BUILD_AT: string =
  typeof __APP_BUILD_AT__ !== "undefined" && __APP_BUILD_AT__
    ? __APP_BUILD_AT__
    : "—";
