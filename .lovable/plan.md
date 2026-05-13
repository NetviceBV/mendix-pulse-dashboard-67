## Probleem

In `handleRunOwaspChecks` (fake-mode tak) worden `owasp_check_results` rijen weggeschreven met `app_id: app.app_id`, terwijl `loadOwaspData` filtert op `app_id = app.project_id`. Hierdoor ziet de UI de gefakete resultaten nooit.

Daarnaast geeft een tweede fake-run een unique-constraint error op `owasp_check_results_unique_user_app_env_step` (zie memory `database/owasp-results-upsert-handling`).

## Fix

In `src/components/AppCard.tsx`, fake-OWASP blok:

1. `app_id` zowel in `owasp_check_runs` als `owasp_check_results` zetten op `app.project_id` (i.p.v. `app.app_id`).
2. `supabase.from('owasp_check_results').insert(...)` vervangen door `.upsert(..., { onConflict: 'user_id,app_id,environment_name,owasp_step_id' })`.

Geen andere wijzigingen nodig — de delay van 5–10s en pass-state blijven hetzelfde, en de loader zal de nieuwe pass-resultaten nu correct tonen na `setOwaspReloadTrigger`.
