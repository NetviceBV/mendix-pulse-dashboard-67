## Doel

Twee knoppen toevoegen in `MendixCredentials.tsx`, naast de "fake checks" checkbox, om historische test-data te genereren voor alle apps van de ingelogde user:

1. **"Vul Linting History"** — per app 20 random `linting_runs` met bijbehorende `linting_results`, waarvan minstens 4 volledig groen.
2. **"Vul OWASP History"** — per app 20 random `owasp_check_runs` met bijbehorende `owasp_check_results`, waarvan minstens 4 volledig groen.

## Gedrag

- **Scope**: alle apps van de huidige user (`mendix_apps` waar `user_id = auth.uid()`).
- **Bestaande data**: niet wissen. Toevoegen.
- **Datums**: gespreid over de laatste 5 maanden. Als er al een run voor een app/check bestaat, moeten de gegenereerde records een `started_at` / `run_started_at` < oudste bestaande run hebben, zodat ze er chronologisch voor komen.
- **Groen garanderen**: per app minimaal 4 runs met `failed = 0` / `overall_status = 'pass'` en alle results op `pass`. De overige runs krijgen een random mix van pass/fail/warning.

## Implementatie

### 1. `src/components/MendixCredentials.tsx`

- Voeg twee `Button`s toe direct onder de fake-checks checkbox.
- Elke knop heeft eigen loading state (`seedingLinting`, `seedingOwasp`).
- Click handler haalt alle apps van de user op en delegeert het genereren naar een helper.
- Toast bij start, succes en fout. Bij succes invalidateQueries van `linting`, `linting-runs`, en (voor OWASP) trigger via `setOwaspReloadTrigger` patroon — of simpelweg `queryClient.invalidateQueries` als die hooks daarop draaien.

### 2. Nieuwe helper `src/lib/seedHistory.ts`

Twee exported functies:

```text
seedLintingHistoryForApp(userId, appId)
seedOwaspHistoryForApp(userId, appId)
```

#### Linting seed (per app)

1. Lees `linting_policies` van de user als bron voor `rule_name` / `chapter` / `severity`. Als er geen policies zijn: gebruik een kleine ingebouwde fallback-set (≈10 rules over 3 chapters) zodat de seed altijd werkt.
2. Bepaal startdatum: `min(started_at)` van bestaande runs voor deze app, anders `now()`. Het 5-maands venster eindigt vlak vóór die datum.
3. Genereer 15 timestamps random verdeeld over `(end - 5 maanden, end)`, oplopend gesorteerd.
4. Kies 4 indices random als "all green" runs.
5. Voor elke run:
  - Insert `linting_runs` met `app_id`, `user_id`, `status: 'completed'`, `started_at`, `completed_at = started_at + 30s`, `total_rules = N`.
  - Voor green runs: alle results `status: 'pass'`. Voor andere runs: random per rule pass/fail/warning (~70/20/10), zorg dat tellingen kloppen.
  - Update `passed_rules` / `failed_rules` op de run.
  - Insert results in `linting_results` met `run_id`, `app_id`, `user_id`, `chapter`, `rule_name`, `rule_description`, `status`, `severity`, `details`, `checked_at = started_at`.

#### OWASP seed (per app)

1. Lees `owasp_items` voor de user (10 stuks via `initialize_default_owasp_items`).
2. Voor elk item: zorg dat er een `owasp_steps` rij is (gebruik de bestaande "noop" upgrade-logica uit AppCard's fake-OWASP blok, of een eenvoudigere variant die enkel actieve steps verzamelt). Voor seed-doel: één step per item is genoeg.
3. Bepaal startdatum: `min(run_started_at)` van bestaande `owasp_check_runs` voor deze app, anders `now()`. 5-maands venster ervoor.
4. Genereer 20 timestamps, kies 4 als all-green.
5. Per run:
  - Insert `owasp_check_runs` (`app_id = mendix_apps.project_id`, `environment_name = 'Production'`, `run_started_at`, `run_completed_at = +30s`, totals).
  - Per (item → step) een rij in `owasp_check_results` met `status` pass/fail/warning (green run = altijd pass), `details: ''`, `checked_at = run_started_at`, `execution_time_ms` random 50–500.
  - Update run-totalen + `overall_status` (`pass` als geen fails, `fail` anders).

### 3. Geen DB-migratie nodig

We hergebruiken bestaande tabellen en RLS-policies; alle inserts gebeuren namens de ingelogde user en voldoen aan de bestaande "user_id = auth.uid()" insert policies.

### 4. UI invalidatie

Na seeding `queryClient.invalidateQueries({ queryKey: ['linting'] })`, `['linting-runs']` en hetzelfde voor OWASP-hooks zodat AppCard en de history-modals direct verversen.

## Edge cases

- Geen apps: toon "Geen apps gevonden" toast en doe niets.
- Geen `linting_policies`: gebruik fallback rule-set.
- Geen `owasp_items`: roep server-side `initialize_default_owasp_items` aan via `supabase.rpc` voordat geseed wordt.
- Foutafhandeling per app, niet stoppen bij eerste fout; eindrapport in toast ("12/14 apps gevuld").