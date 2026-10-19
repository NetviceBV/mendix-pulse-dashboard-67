# Overstappen van Mendix API-key naar Personal Access Token (PAT)

Mendix stopt per 1 januari 2027 met API-keys. Alle calls naar de Deploy API v1/v2, Backups API en Build API gaan voortaan via `Authorization: MxToken {PAT}`.

## Wat er verandert

1. Een gedeelde helper `supabase/functions/_shared/mendix-auth.ts` met `mendixAuthHeaders(credential)`:
   - Gebruikt de PAT als die is ingevuld -> `Authorization: MxToken <pat>`.
   - Geen PAT? Tijdelijke fallback naar de oude `Mendix-Username` + `Mendix-ApiKey` headers (werkt nog tot 2027), met een waarschuwing in de logs.
   - Nooit meer de PAT in de `Mendix-ApiKey` header stoppen (dat veroorzaakte waarschijnlijk de 401 in productie).
2. Alle plekken die nu `Mendix-Username`/`Mendix-ApiKey` sturen gaan deze helper gebruiken:
   - start-mendix-environment, stop-mendix-environment
   - cloud-action-steps (7 calls: stop/start/backup/deploy/transport e.d.)
   - run-cloud-actions-backup (11 calls)
   - download-mendix-logs (2 calls)
   - get-mendix-packages
   - refresh-mendix-environment-status
   - vulnerability-scan-environment
3. Functies die al MxToken gebruiken (fetch-mendix-apps, get-mendix-branches, get-mendix-commits, run-linting-checks) blijven ongewijzigd.
4. In Credentials: korte hint bij het API-key veld dat dit verouderd is en een PAT aangeraden wordt.
5. Alle aangepaste functies opnieuw deployen en een start/stop test doen.

## Wat jij moet doen

Maak in Mendix een PAT aan met de benodigde scopes (o.a. `mx:deployment:read`, `mx:deployment:write`, `mx:backups:read/write`, `mx:app:metadata:read`) en vul die in bij je credentials, in beide omgevingen.
