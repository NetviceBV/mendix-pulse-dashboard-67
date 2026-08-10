# Opruimen van `net._http_response` (479 MB)

## Wat er aan de hand is

Gemeten in de database:

- `net._http_response` bevat maar **1080 rijen**, maar beslaat **479 MB**.
- Oudste rij is van vanochtend 04:20, nieuwste van 10:19 — dus de opschoning verwijdert de rijen wél.

De cron-job `cleanup-cron-history` (dagelijks 03:00) doet al:

```sql
DELETE FROM net._http_response WHERE created < NOW() - INTERVAL '1 day';
```

Het probleem is dat een `DELETE` in Postgres geen schijfruimte teruggeeft — de dode rijen blijven als "bloat" in het bestand staan. Omdat elke minuut drie cron-jobs via `pg_net` HTTP-calls doen (orchestrator, log monitoring, owasp jobs) en de responses volledig worden opgeslagen, groeit die bloat door. Autovacuum ruimt de rijen op maar krimpt het bestand niet.

De inhoud van `net._http_response` is voor deze app niet nodig: alle cron-calls naar edge functions zijn fire-and-forget, er wordt nergens uit die tabel gelezen.

## Aanpak

1. **Direct ruimte terugwinnen**: `TRUNCATE net._http_response;` — dit geeft de volledige 479 MB meteen terug (in tegenstelling tot DELETE).
2. **Voorkomen dat het terugkomt**: de dagelijkse cleanup-job aanpassen zodat hij `net._http_response` niet meer met DELETE opruimt maar met `TRUNCATE`, en hem vaker laten draaien (elk uur in plaats van 1x per dag). Zo blijft de tabel structureel klein.
3. **Response-bewaartijd verkorten**: `pg_net`-instelling `pg_net.ttl` terugzetten naar een paar minuten, zodat pg_net zelf ook minder bewaart.
4. `cron.job_run_details` (12 MB) blijft zoals nu: DELETE ouder dan 2 dagen, maar we voegen daar ook een periodieke opschoning aan toe zodat die niet dezelfde bloat opbouwt.

## Technische details

Eén migratie die:

- `TRUNCATE net._http_response;` uitvoert.
- De job `cleanup-cron-history` herdefinieert (`cron.unschedule` + `cron.schedule`) naar schema `0 * * * *` met:
  - `TRUNCATE net._http_response;`
  - `DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '2 days';`
  - `DELETE FROM public.mendix_logs WHERE created_at < NOW() - INTERVAL '5 days';`
  (de laatste twee alleen nog 1x per dag laten uitvoeren via een tijdcheck, of gewoon elk uur — verwaarloosbaar qua kosten)

Geen wijzigingen aan applicatiecode of edge functions nodig; de cron-jobs blijven ongewijzigd draaien.

## Risico

`TRUNCATE net._http_response` wist alleen HTTP-response-historie van pg_net. Er is geen code in dit project die die tabel uitleest, dus er gaat geen functionaliteit verloren.
