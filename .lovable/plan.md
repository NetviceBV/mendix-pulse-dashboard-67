## Doel

Een checkbox (zonder label) toevoegen onder het "Mendix Password" veld in de credential-formulieren (zowel toevoegen als bewerken). Wanneer deze aanstaat voor een credential, gedragen de knoppen **Run OWASP** en **Run Linting** zich alsof alle checks zijn geslaagd — zonder dat er daadwerkelijk een analyse wordt uitgevoerd.

## Wijzigingen

### 1. Database

Nieuwe migratie die een kolom toevoegt aan `mendix_credentials`:

- `fake_checks_enabled boolean not null default false`

### 2. UI — `src/components/MendixCredentials.tsx`

- State `newCredential` en `editCredential` uitbreiden met `fake_checks_enabled: boolean`.
- Direct onder het Mendix Password veld een ongelabelde `<Checkbox>` (shadcn) tonen, alleen in edit formulier.
- Update queries naar Supabase meegeven met de nieuwe vlag.
- `MendixCredential` interface uitbreiden.

### 3. Run-knoppen — `src/components/AppCard.tsx`

In `handleRunLintingChecks` en `handleRunOwaspChecks`: vóór het aanroepen van de edge function de credential ophalen (`mendix_credentials.fake_checks_enabled`). Als `true`:

**Linting (fake):**

- Sla een nieuwe rij op in `linting_runs` met `status='completed'`, `total_rules` = aantal enabled policies (of 1), `passed_rules = total_rules`, `failed_rules = 0`, `started_at` en `completed_at` op nu.
- Voor elke enabled policy een rij in `linting_run_results` met `passed=true` (schema verifiëren tijdens implementatie).
- Toon success toast en invalideer queries — geen edge function call.

**OWASP (fake):**

- Roep edge function niet aan. In plaats daarvan: alle bestaande OWASP-resultaten voor deze app+production environment markeren als `pass` (of nieuwe pass-records schrijven afhankelijk van schema, te bevestigen tijdens implementatie via een korte schema-check op `owasp_*` tabellen).
- Trigger `setOwaspReloadTrigger(prev => prev + 1)` zodat de UI de groene status toont.

Graag een delay inbouwen die variabel tussen de 5 en 10 seconden laadtijd nabootst.

### 4. Types

`src/integrations/supabase/types.ts` wordt automatisch bijgewerkt door de migratie.

## Technische notities

- De vlag staat per credential, dus verschillende credentials kunnen onafhankelijk in "fake mode" staan.
- De feature is volledig client-side voor de run-knoppen — geen edge function aanpassingen nodig — wat rollback eenvoudig maakt.
- Tijdens implementatie eerst schemata van `linting_run_results` en de OWASP resultaattabellen inlezen om de juiste velden te schrijven.