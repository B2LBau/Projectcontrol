# ProjectMelder

App voor iOS, Android en web (desktop) waarmee het team en onderaannemers via **spraak en foto’s**
acties, besluiten, constateringen, afwijkingen, gereedmeldingen en verkeersmaatregelen melden. Alles komt
in één bewaakte lijst met termijnen, herinneringen en escalatie. Gebouwd volgens het functioneel ontwerp
`docs/Functioneel_ontwerp_ProjectMelder.docx`.

- **App:** Expo (SDK 58) / React Native + React Native Web, Expo Router.
- **Server:** Supabase (EU-regio): Postgres met rijbeveiliging, sms-login, realtime, opslag, Edge Functions en pg_cron.
- **AI-voorstel:** Claude (Anthropic API) via de serverfunctie `suggest`; zonder verbinding gebruikt de app lokale regels.
- **Spraak naar tekst:** op het toestel (iOS/Android spraakherkenning via `expo-speech-recognition`); de audio wordt als bewijs bewaard.

## Wat zit erin (MVP)

| Onderdeel | FO | Waar |
|---|---|---|
| Inloggen met mobiel nummer + sms-code, uitnodigen op nummer, toegang aanvragen | §5.1 | `src/app/login.tsx`, `onboarding.tsx`, `project/members.tsx`, `claim_invites()` |
| Tijd, GPS (± nauwkeurigheid), kompasrichting bij foto’s; start/eindtijd en positie bij spraak; offline het werkelijke opnamemoment | §5.2 | `src/lib/media.ts`, `src/components/VoiceRecorder.tsx` |
| Chat per project (algemeen, intern, per onderaannemer) met tekst, foto, spraak; lang indrukken → melding; intrekken i.p.v. verwijderen | §5.3 | `src/app/channel/[id].tsx` |
| Melden met spraak (ingedrukt houden of tikken), AI-voorstel, meerdere meldingen uit één opname, altijd bevestigen | §5.4 | `src/app/(tabs)/melden.tsx`, `item/new.tsx`, `supabase/functions/suggest` |
| Overlegmodus: acties/besluiten inspreken, aanwezigheid, open acties uit eerdere overleggen, verslag PDF/Word | §5.6 | `src/app/meeting/` |
| 8 meldingstypen met statusmodel, rechten per rol, verificatie door een ander dan de hersteller | §4, §6 | `src/domain/status.ts`, `item_set_status()` |
| Centrale lijst per project of over **alle projecten**, sorteerbare **tabel** (desktop) of kaarten (mobiel), kerncijfers (open, te laat, vandaag, urgent), snelfilters, zoeken in ingesproken tekst, live bijwerken, export PDF/Word/CSV | §5.12 | `src/app/(tabs)/lijst.tsx`, `src/components/ItemTable.tsx`, `src/domain/overview.ts`, `src/report/` |
| Mijn taken per termijn (te laat, vandaag, deze week) | §3.2 | `src/app/(tabs)/taken.tsx` |
| Termijnen in werkdagen (incl. feestdagen), herinneringen 2 werkdagen vóór / op de dag / 1 dag na, escalatie, dagelijkse samenvatting, stille uren | §5.13 | `src/domain/deadlines.ts`, `supabase/functions/reminders` |
| Push bij toewijzing, kritieke afwijking, gereedmelding, statuswijziging en chat | §5.14 | `supabase/functions/notify`, `src/lib/notifications.ts` |
| Offline wachtrij voor meldingen, berichten en bestanden | §5.15 | `src/lib/outbox.ts` |
| Audit trail: wijzigingen alleen via databasefuncties, elke wijziging in `item_events` | NFE-06 | `supabase/migrations/` |

Nog niet gebouwd (fase 2/3 in het FO): controlerondes met checklistsjablonen, verkeersmaatregelenregister met
controle-interval, foto-annotatie, kaartweergave, kanban, dashboard met grafieken, Microsoft 365-koppelingen, vertaling,
controle van de toesteltijd tegen de servertijd. De meldingstypen *controleronde* en *verkeersmaatregel* zijn wel
al als gewone melding met statusmodel te gebruiken.

## Installatie

De volledige stap-voor-stap-handleiding (accounts, sms-login, pushberichten, publiceren, ingebruikname,
problemen oplossen) staat in `docs/Installatiehandleiding_ProjectMelder.docx` / `.pdf`. Hieronder de korte versie.

### 1. Supabase-project
1. Maak een project op supabase.com in regio **EU (Frankfurt)**.
2. **Authentication → Providers → Phone**: aanzetten en een sms-dienst koppelen (Twilio, MessageBird, Vonage of Textlocal).
3. Database inrichten met de Supabase CLI (vanuit `projectmelder/`):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push            # voert supabase/migrations/*.sql uit
   ```
4. Geheimen voor de serverfuncties:
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=<sleutel>
   npx supabase functions deploy suggest notify reminders
   ```
5. In de SQL-editor (eenmalig, voor push en termijnbewaking):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service_role key>', 'service_role_key');
   ```

### 2. App
```bash
cd projectmelder
npm install
cp .env.example .env.local      # vul URL en anon/publishable key in
npx expo start                  # web: druk op w
```
Spraakherkenning, pushberichten en de camera hebben een **development build** nodig (niet Expo Go):
```bash
npx eas-cli@latest init         # koppelt het EAS-project (nodig voor pushberichten)
npx eas-cli@latest build --profile development --platform all
```

### 3. Eerste gebruik
De eerste gebruiker logt in met het eigen mobiele nummer, vult de naam in, richt de eigen organisatie in en maakt
het eerste project aan. Daarna: **Meer → Deelnemers** om collega’s en onderaannemers op telefoonnummer uit te nodigen.
Bij hun eerste inlog wordt het nummer herkend en krijgen ze direct toegang met de juiste rol.

## Controleren

```bash
npm run typecheck && npm run lint && npm test          # app en domeinlogica
PGHOST=... PGUSER=postgres supabase/tests/run.sh       # migraties + rechten-scenario op lokale PostgreSQL 15+
deno check supabase/functions/*/index.ts               # serverfuncties
node scripts/sync-shared.js                            # na wijziging in src/domain/{types,workdays,deadlines}.ts
```

## Privacy en beveiliging
- Locatie wordt alleen vastgelegd op het moment van opname/melden, nooit continu.
- Foto’s komen niet in de fotogalerij van het toestel; opslag is privé (`media`-bucket), alleen voor projectleden.
- Onderaannemers zien alleen meldingen van hun eigen organisatie, aan hen toegewezen meldingen en hun eigen kanaal;
  “alleen intern” meldingen en het interne kanaal nooit.
- Transcripties worden voor het AI-voorstel naar de Anthropic API gestuurd; sluit hiervoor een verwerkersovereenkomst af.
