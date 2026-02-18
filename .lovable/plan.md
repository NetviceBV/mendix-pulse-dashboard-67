

## Webhook Callback Pattern for Linting

### How it works today (broken for large projects)

```text
Browser --> run-linting-checks --> Analyzer API (waits 60-300s) --> process results --> update DB
                                   ^^ edge function gets killed here if too slow
```

### How it will work (reliable for any project size)

```text
Browser --> run-linting-checks --> Analyzer API (returns 200 immediately)
                                   |
                                   +-- Analyzer does its work in the background
                                   |
                                   +-- When done, POSTs results to --> linting-webhook --> process results --> update DB
```

No timeout risk because neither edge function runs for more than a few seconds.

### What needs to change

#### 1. Your Mendix Analyzer API (Railway) -- you need to adjust this yourself

The `/analyze-mpr/git` and `/analyze-mpr/svn` endpoints need to accept an optional `webhookUrl` parameter. When provided:
- Return `200 OK` immediately with something like `{ "accepted": true }`
- Process the analysis in the background
- When done, POST the full result (the same JSON you return today) to the `webhookUrl`

This is a change you make on your Railway app. The edge function will send the webhook URL in the request body.

#### 2. New edge function: `linting-webhook` (receives results)

A new Supabase Edge Function that:
- Receives the POST from the Analyzer API with the linting results
- Validates the request using a secret token passed as a query parameter
- Extracts the `runId` from the payload to find the correct `linting_runs` row
- Processes violations and stores `linting_results` (the same logic currently in the background task)
- Updates `linting_runs` status to "completed" or "failed"
- No auth header needed (called by external service), so `verify_jwt = false` and validated via secret token

#### 3. Simplify `run-linting-checks` (sends request)

- Remove the entire background task block (lines 114-273)
- Build the webhook URL: `{SUPABASE_URL}/functions/v1/linting-webhook?secret={LINTING_WEBHOOK_SECRET}&runId={run.id}`
- Send the request to the Analyzer API with the `webhookUrl` field included
- If the API returns 200/accepted, return success to the browser
- If the API rejects (e.g. bad credentials), mark the run as failed immediately

#### 4. New secret: `LINTING_WEBHOOK_SECRET`

A random secret string used to authenticate the webhook callback. This prevents anyone from calling the webhook endpoint with fake results. You'll need to add this secret in Supabase.

#### 5. Config update: `supabase/config.toml`

Add `verify_jwt = false` for the new `linting-webhook` function (it's called by Railway, not by authenticated users).

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/run-linting-checks/index.ts` | Remove background task, add webhookUrl to API request body |
| `supabase/functions/linting-webhook/index.ts` | **New** -- receives results, processes violations, updates DB |
| `supabase/config.toml` | Add `[functions.linting-webhook]` with `verify_jwt = false` |

### What you need to do on your Railway API

Add support for a `webhookUrl` field in the request body of both `/analyze-mpr/git` and `/analyze-mpr/svn`:

```json
{
  "projectId": "...",
  "username": "...",
  "pat": "...",
  "reportFormat": "json",
  "policies": ["..."],
  "webhookUrl": "https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/linting-webhook?secret=xxx&runId=abc"
}
```

When `webhookUrl` is present:
- Return `{ "accepted": true }` immediately
- Do the analysis in the background
- POST the full JSON result to the `webhookUrl` when done

Also include the `runId` query param in the webhook call back, or echo it in the POST body -- either approach works. The simplest is to just POST to the exact URL provided (which already contains `runId` as a query param).

### Frontend impact

None -- the frontend already polls `linting_runs` every 5 seconds for status changes. This pattern works perfectly with the webhook approach since the status will update from "running" to "completed"/"failed" when the webhook fires.

### Fallback for stale runs

As a safety net, the `run-linting-checks` function will also mark any runs stuck in "running" for over 10 minutes as "failed" before creating a new run. This handles edge cases where the Analyzer API never calls back.

