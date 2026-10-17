# Kabelcontrole 20 kV

Mobiele app (iOS en Android) voor civiel grondwerk en elektrotechnische montage bij de aanleg van
20 kV-kabels in de grond. Met de app toon je **tijdig** aan – dus vóórdat de sleuf wordt aangevuld –
dat aan de technische eisen is voldaan.

## Hoe het werkt

1. **Project** aanmaken per kabelverbinding (projectnummer, opdrachtgever/netbeheerder, locatie).
2. Het tracé opdelen in **tracédelen** (bijv. per 50 m of per mofput) en per tracédeel kiezen welke
   eisen aangetoond moeten worden.
3. Per eis een **registratie** maken in de sleuf: meetwaarden invullen, foto's maken. De app toetst
   direct aan de normwaarde en legt naam, datum/tijd en GPS-positie vast.
4. Zodra alle eisen die vóór het aanvullen gelden voldoen, kan het tracédeel worden **vrijgegeven voor
   aanvullen**. Zolang dat niet zo is, toont de app welke eisen nog openstaan.
5. Een **bewijsdossier** exporteren als PDF en als Word (.docx), inclusief foto's, en delen via mail,
   WhatsApp, Teams, enz.

Een afwijking wordt opgeslagen als "Voldoet niet". Na herstel registreer je de eis opnieuw; de laatste
registratie per eis telt, de eerdere blijft in de historie staan.

## Eisen en standaardwaarden

| Eis | Toetsing | Standaard | Vóór aanvullen |
| --- | --- | --- | --- |
| Gronddekking | dekking ≥ minimum per ligging | berm 0,80 m · rijbaan 1,00 m · landbouw 1,00 m | ja |
| Zandbed en omhulling | zand onder/boven ≥ minimum, steenvrij | 10 cm / 10 cm | ja |
| Afdekking en markeringslint | lint aanwezig, hoogte binnen bereik | 20–40 cm boven kabel | ja |
| Kruising met kabel/leiding | verticale afstand ≥ minimum, of scheidingsplaat/mantelbuis | 0,20 m | ja |
| Parallelligging | horizontale afstand ≥ minimum | 0,30 m | ja |
| Buigstraal | R ≥ n × D | 15 × D | ja |
| Trekkracht bij intrekken | F ≤ σ × A × n | Al 30 N/mm² · Cu 50 N/mm² | nee |
| Legtemperatuur | temperatuur ≥ minimum | −5 °C | nee |
| Mof / eindsluiting montage | checklist + mofnummer, type, monteur, min. 3 foto's | – | ja |
| Mantelbeproeving | DC-spanning en duur ≥ minimum, geen doorslag | 5 kV · 1 min | ja |
| Hoogspanningsbeproeving (VLF) | U ≥ factor × U0, duur ≥ minimum, geen doorslag | 3 × 12 kV · 30 min | nee |

De standaardwaarden zijn gangbare uitgangspunten. **Het bestek en de specificatie van de netbeheerder
zijn altijd leidend**: pas de waarden per project aan via *Project → Normwaarden voor dit project*.
Elke registratie bewaart de normwaarden waarmee getoetst is, zodat het dossier achteraf klopt.

De eisen zijn gedefinieerd in [`src/domain/requirements.ts`](src/domain/requirements.ts); een eis
toevoegen is één object in die lijst.

## Techniek

- [Expo](https://expo.dev) SDK 58 / React Native, TypeScript, Expo Router (`src/app/`)
- Werkt volledig offline; gegevens staan lokaal op het toestel (AsyncStorage), foto's in de
  documentenmap van de app
- Camera (`expo-image-picker`), GPS (`expo-location`), PDF (`expo-print`), Word (`docx`),
  delen (`expo-sharing`)

```
src/
  app/          schermen (Expo Router)
  components/   UI-bouwstenen
  domain/       eisen, toetsing en status (zonder UI, met tests)
  report/       bewijsdossier naar PDF en .docx
  services/     camera/foto's en GPS
  storage/      lokale opslag
```

## Ontwikkelen

```bash
npm install
npx expo start          # scan de QR-code met Expo Go of een development build
npm test                # unit tests van toetsing en rapportage
npm run typecheck
```

## Bouwen voor iOS en Android

Met [EAS Build](https://docs.expo.dev/build/introduction/) (geen Xcode of Android Studio nodig):

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android   # .apk om direct te installeren
npx eas-cli@latest build --profile production --platform all    # voor App Store en Google Play
npx eas-cli@latest submit --platform all
```

Bundle-identifier / package: `nl.projectbeheerst.kabelcontrole20kv` (aan te passen in `app.json`).
