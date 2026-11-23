# ZERYNX WORKER RECOVERY

Cloudflare Workers diagnostics and controlled recovery tool. Static GitHub Pages application; no backend and no database.

## Features

- Verify a Cloudflare API token and list accessible accounts.
- List existing Workers and inspect script versions, deployments, settings, and bindings.
- Download a local source backup in the browser.
- Inspect source for common configuration and runtime compatibility warning patterns.
- Start a live Workers Tail session and collect runtime logs in the browser.
- Restore a selected previous Worker version by creating a new 100% deployment.
- Export a diagnostic JSON report without including the API token.

## Deploy to GitHub Pages

1. Open repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source: GitHub Actions**.
3. Push to `main` or run the workflow manually from **Actions → Deploy ZERYNX Worker Recovery to GitHub Pages**.
4. The site will be available at:

   `https://zerynxit.github.io/ZERYNX-WORKER-RECOVERY/`

## API Token

Use the preconfigured token link in the app. It requests these user-token permissions:

- **Workers Scripts — Edit**: inspect existing script content and versions, then create a rollback deployment.
- **Workers Tail — Read**: create a live runtime log tail.
- **Account Settings — Read**: list accounts accessible to the user.

**Important:** In the Cloudflare token wizard, restrict the Account resource to only the account you intend to repair. Do not grant unrelated permissions. Set a short expiration (for example, one day or one week). The token is never written to localStorage, sessionStorage, cookies, URLs, logs, or this repository. It exists only in JavaScript memory until the page is refreshed/closed or Clear Token is pressed.

Cloudflare permission reference: https://developers.cloudflare.com/fundamentals/api/reference/permissions/

## 1101 recovery workflow

1. Create a scoped token and connect.
2. Select the Cloudflare account and Worker showing error 1101.
3. Run the deep inspection and download a source backup.
4. Start Runtime Logs, then send a request to the failing Worker so the exception is emitted.
5. Inspect the exception and stack trace. Export the report.
6. If the failure started after a deployment and a known-good previous version exists, select that version and explicitly confirm rollback.

A rollback creates a new deployment routing 100% of traffic to the selected existing version. It does not rewrite script source, change bindings, modify secrets, delete versions, or remove routes.

## Important limitations

- Error 1101 has multiple causes. Static source inspection cannot prove a runtime fault without the actual exception and stack trace.
- A previous version rollback may not fix a problem caused by changed bindings, external services, D1 data, account configuration, or a platform incident.
- The tool deliberately does not auto-edit arbitrary Worker source or guess at a fix. It backs up, diagnoses, and offers a reversible version rollback.
- Cloudflare API access and browser CORS behavior depend on the token and Cloudflare API response. If a browser request is blocked, verify token permissions and try the API from the Cloudflare dashboard.
- Logs are collected only while the page is open and the Tail connection is active.
- No token or Worker source is uploaded to a ZERYNX server. The Cloudflare API receives requests directly from the browser.

## Security

This is a public static site. Never paste a Global API Key. Use a narrowly scoped API Token, restrict it to one account, set an expiration, and revoke it after recovery if it is no longer needed.
