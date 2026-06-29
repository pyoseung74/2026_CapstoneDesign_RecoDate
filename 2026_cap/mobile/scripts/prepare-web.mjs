import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const frontendDir = resolve(root, "frontend");
const mobileWebDir = resolve(root, "mobile/web");
const cliApiUrl = process.argv[2]?.trim();
const apiUrl = cliApiUrl || process.env.RECODATE_MOBILE_API_URL?.trim();

await rm(mobileWebDir, { recursive: true, force: true });
await mkdir(mobileWebDir, { recursive: true });
await cp(frontendDir, mobileWebDir, { recursive: true });
await rm(resolve(mobileWebDir, "docs"), { recursive: true, force: true });
await rm(resolve(mobileWebDir, "_backup_before_mobile_redesign"), { recursive: true, force: true });
await rm(resolve(mobileWebDir, "http-local.err.log"), { force: true });
await rm(resolve(mobileWebDir, "http-local.out.log"), { force: true });

if (apiUrl) {
  const runtimeConfigPath = resolve(mobileWebDir, "runtime-config.js");
  const runtimeConfig = await readFile(runtimeConfigPath, "utf8");
  await writeFile(
    runtimeConfigPath,
    runtimeConfig
      .replace(
        /const recodateBundledNativeApiBaseUrl = "[^"]+";/,
        `const recodateBundledNativeApiBaseUrl = ${JSON.stringify(apiUrl)};`,
      )
      .replace(
        /recodateIsNativeApp \? "[^"]+" : "http:\/\/127\.0\.0\.1:8010"/,
        `recodateIsNativeApp ? ${JSON.stringify(apiUrl)} : "http://127.0.0.1:8010"`,
      )
      .replace('"http://127.0.0.1:8010"', JSON.stringify(apiUrl)),
    "utf8",
  );
}

console.log(`Prepared mobile web assets${apiUrl ? ` for ${apiUrl}` : ""}.`);
