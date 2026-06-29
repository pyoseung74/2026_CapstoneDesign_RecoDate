// Web uses the local backend by default.
// Mobile builds can override this before running `npm run mobile:sync`.
const recodateIsNativeApp =
  window.location.protocol === "capacitor:" ||
  Boolean(window.Capacitor);
const recodateBundledNativeApiBaseUrl = "http://223.130.153.14";
const recodateIsLocalWeb =
  ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const recodateDefaultWebApiBaseUrl = recodateIsLocalWeb
  ? "http://127.0.0.1:8010"
  : window.location.origin;

if (recodateIsNativeApp) {
  window.localStorage.removeItem("recodate_api_base_url");
}

window.RECODATE_API_BASE_URL =
  (recodateIsNativeApp ? recodateBundledNativeApiBaseUrl : window.localStorage.getItem("recodate_api_base_url")) ||
  recodateDefaultWebApiBaseUrl;
