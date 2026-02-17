

## Fix: Linting Check Timing Out

### Problem

The linting check was triggered and the edge function started successfully ("Running linting for app ... with 26 rules", "Trying Git endpoint..."). However, the Mendix Analyzer API takes a long time to process (it downloads the full MPR file and runs all rules), causing the Supabase Edge Function to time out (~25-30s limit). This leaves:
- A `linting_runs` row stuck in `running` status with no results
- A "Failed to fetch" error shown to the user

### Solution

Split into two parts:

**Part 1: Increase edge function resilience (immediate fix)**

The `run-linting-checks` edge function currently waits synchronously for the Analyzer API response and returns it to the browser. Since the analyzer can take 60-120+ seconds, this will always time out.

**Fix approach**: Return an immediate response to the browser after creating the `linting_runs` row, then continue processing in the background using `waitUntil`-style pattern (EdgeRuntime.waitUntil or a background promise). This way:
- The user sees "Linting started" immediately
- The edge function continues processing the analyzer call in the background
- Results are written to the database when ready
- The UI polls or uses real-time subscription to detect completion

**Part 2: Frontend polling for results**

Since the edge function now returns immediately, the frontend needs to poll for the run status:
- After starting linting, poll the `linting_runs` table every 5 seconds
- Stop polling when status changes from `running` to `completed` or `failed`
- Then invalidate queries to show results
- Show a progress indicator while waiting

### Technical Changes

**`supabase/functions/run-linting-checks/index.ts`**
- Return a 200 response immediately after creating the `linting_runs` row and validating inputs
- Move the Analyzer API call and result processing into a background task
- Wrap the background task in try/catch to mark the run as `failed` on errors

**`src/components/AppCard.tsx`**
- After calling the edge function successfully, start polling `linting_runs` for the run ID
- Poll every 5 seconds until status is no longer `running`
- On `completed`: show success toast, invalidate queries
- On `failed`: show error toast
- Show a spinning indicator on the button during the entire process

**Cleanup the stuck run**
- Update the existing stuck `linting_runs` row (id: `e91f12cb-...`) to status `failed` so it does not confuse the UI

### Flow After Fix

```text
User clicks "Run Linting"
    |
    v
Edge function creates linting_runs (status: running)
Edge function returns { runId, status: "started" }
Edge function continues in background...
    |                                    |
    v                                    v
Frontend starts polling              Analyzer API processes
linting_runs every 5s                (can take 60-120s)
    |                                    |
    v                                    v
Status still "running"...           Results come back
    |                                    |
    v                                    v
Poll detects "completed"  <-----  Edge fn writes results
    |                                & updates run status
    v
Invalidate queries, show results
```

