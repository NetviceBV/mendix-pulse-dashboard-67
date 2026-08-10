# Opruimen van `net._http_response` (479 MB)

Ja — dit kun je prima zelf handmatig in de Supabase SQL Editor doen. Er is geen codewijziging nodig.

## Wat er aan de hand is

- `net._http_response` bevat maar **1080 rijen**, maar beslaat **479 MB**.
- De bestaande cron-job `cleanup-cron-history` (dagelijks 03:00) doet al `DELETE FROM net._http_response WHERE created < NOW() - INTERVAL '1 day';`
- Een `DELETE` geeft in Postgres géén schijfruimte terug — de dode rijen blijven als "bloat" staan. Daarom groeit het bestand door terwijl er nauwelijks rijen in staan.
- `TRUNCATE` geeft de ruimte wél direct terug.

De inhoud van die tabel is voor deze app niet nodig: alle cron-calls naar edge functions zijn fire-and-forget en niets leest die tabel uit.

## Stap 1 — nu meteen ruimte terugwinnen

Voer in de Supabase SQL Editor uit:

```sql
TRUNCATE net._http_response;
```

Dit geeft de ~479 MB direct terug.

## Stap 2 — de cron-job aanpassen

Vervang de bestaande job door een variant die elk uur draait en TRUNCATE gebruikt:

```sql
SELECT cron.unschedule('cleanup-cron-history');

SELECT cron.schedule(
  'cleanup-cron-history',
  '0 * * * *',
  $$
    TRUNCATE net._http_response;
    DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '2 days';
    DELETE FROM public.mendix_logs WHERE created_at < NOW() - INTERVAL '5 days';
  $$
);
```

Let op: dit gooit ook responses weg die op dat moment nog geen uur oud zijn. Dat is hier veilig, omdat geen enkele code de responses uitleest.

## Controle achteraf

```sql
SELECT pg_size_pretty(pg_total_relation_size('net._http_response'));
```

## Wil je dat ik het doe?

Als je liever hebt dat ik dit uitvoer in plaats van handmatig, keur dan dit plan goed — dan zet ik dezelfde twee stappen voor je klaar via de database-tool.
