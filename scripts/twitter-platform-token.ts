import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { TwitterApi } from "twitter-api-v2";
import { getSelectedTwitterEnv } from "../src/lib/twitter";

const openFile = promisify(execFile);
const DEFAULT_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

function loadEnv() {
  const envFiles = [".env.local", ".env"];

  for (const envFile of envFiles) {
    const envPath = join(process.cwd(), envFile);
    if (!existsSync(envPath)) continue;

    const envContent = readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const [key, ...valueParts] = trimmed.split("=");
      if (!key || valueParts.length === 0 || process.env[key]) return;
      process.env[key] = valueParts.join("=").trim();
    });
  }
}

function required(name: string, value?: string) {
  const resolved = value?.trim() || process.env[name]?.trim();
  if (!resolved) {
    throw new Error(`Missing ${name}.`);
  }
  return resolved;
}

function getSelectedConfig() {
  const selected = getSelectedTwitterEnv();
  return {
    selected,
    clientId: required(selected.names.clientId, selected.clientId),
    clientSecret: required(selected.names.clientSecret, selected.clientSecret),
    redirectUri: required(selected.names.redirectUri, selected.redirectUri),
    outputRefreshTokenKey: selected.names.refreshToken,
    outputAccountUsernameKey: selected.names.accountUsername,
  };
}

function getScopes() {
  const { selected } = getSelectedConfig();
  const configured = (selected.scopes || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  const scopes = configured.length > 0 ? configured : [...DEFAULT_SCOPES];
  for (const scope of DEFAULT_SCOPES) {
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  return scopes;
}

function writeHtml(res: ServerResponse, statusCode: number, title: string, body: string) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`);
}

function getCallbackUrl() {
  const { selected, redirectUri } = getSelectedConfig();
  const url = new URL(redirectUri);

  const supportedHostnames = new Set(["127.0.0.1", "localhost"]);
  if (url.protocol !== "http:" || !supportedHostnames.has(url.hostname)) {
    throw new Error(
      `${selected.names.redirectUri} must be a local http callback like http://127.0.0.1:3001/api/twitter/oauth/callback to use this script.`
    );
  }

  return url;
}

async function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";

  const args =
    process.platform === "win32"
      ? ["/c", "start", "", url]
      : [url];

  try {
    await openFile(command, args);
    return true;
  } catch {
    return false;
  }
}

async function waitForCallback(callbackUrl: URL, expectedState: string) {
  const port = Number(callbackUrl.port || "80");
  const hostname = callbackUrl.hostname;
  const pathname = callbackUrl.pathname;

  return await new Promise<{ code: string }>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url || "/", callbackUrl.origin);
      if (reqUrl.pathname !== pathname) {
        writeHtml(res, 404, "Not Found", "This callback path is not used by the Twitter token helper.");
        return;
      }

      const oauthError = reqUrl.searchParams.get("error");
      if (oauthError) {
        writeHtml(res, 400, "Twitter OAuth Failed", reqUrl.searchParams.get("error_description") || oauthError);
        cleanup();
        reject(new Error(reqUrl.searchParams.get("error_description") || oauthError));
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state");
      if (!code || !state || state !== expectedState) {
        writeHtml(res, 400, "Invalid Callback", "Missing or invalid code/state. Start the flow again.");
        cleanup();
        reject(new Error("Missing or invalid code/state returned from Twitter."));
        return;
      }

      writeHtml(res, 200, "Twitter Connected", "The refresh token was captured. Return to the terminal.");
      cleanup();
      resolve({ code });
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the Twitter OAuth callback."));
    }, CALLBACK_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      server.close();
    }

    server.on("error", (error) => {
      cleanup();
      reject(error);
    });

    server.listen(port, hostname);
  });
}

async function main() {
  loadEnv();

  const { selected, clientId, clientSecret, outputRefreshTokenKey, outputAccountUsernameKey } = getSelectedConfig();
  const callbackUrl = getCallbackUrl();

  const requestClient = new TwitterApi({ clientId, clientSecret });
  const { url, state, codeVerifier } = requestClient.generateOAuth2AuthLink(callbackUrl.toString(), {
    scope: getScopes(),
  });

  console.log(`Starting Twitter/X OAuth flow for the ${selected.mode === "production" ? "production" : "test"} platform account.`);
  console.log(`Redirect URI: ${callbackUrl.toString()}`);
  console.log("");

  const opened = await openBrowser(url);
  if (opened) {
    console.log("Opened the authorization URL in your browser.");
  } else {
    console.log("Could not open the browser automatically. Open this URL manually:");
    console.log(url);
  }

  if (!opened) console.log("");

  const { code } = await waitForCallback(callbackUrl, state);
  const { client: userClient, refreshToken } = await requestClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackUrl.toString(),
  });

  if (!refreshToken) {
    throw new Error("Twitter did not return a refresh token. Make sure offline.access is included in the configured OAuth scopes.");
  }

  const me = await userClient.v2.me();
  const username = me.data.username;

  console.log("");
  console.log("Save these in your env:");
  console.log(`${outputRefreshTokenKey}=${refreshToken}`);
  if (username) {
    console.log(`${outputAccountUsernameKey}=${username}`);
  }
  console.log("");
  console.log("Keep the refresh token secret. If it is ever exposed, revoke/regenerate it.");
}

void main().catch((error) => {
  console.error(`Twitter token helper failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
