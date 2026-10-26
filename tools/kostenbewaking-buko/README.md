# Kostenbewaking BUKO verkeersmaatregelen

Online dashboard (claude.ai-artifact) om de kosten van de verkeersmaatregelen van BUKO te bewaken.
Live versie: https://claude.ai/artifact/3KdYuHxHvqrvh73cJ3Bjhk

## Invoer

Sleep de Excel-bestanden (.xlsx, .xls, .csv) in het tabblad **Importeren**:

| Onderdeel | Herkende kolommen |
| --- | --- |
| Offerteoverzicht | offertenummer, datum, leverancier, omschrijving, kostenpost, bedrag excl. btw, status |
| Facturenoverzicht | factuurnummer, datum, offertenummer, omschrijving, kostenpost, bedrag excl. btw, betaalstatus |
| Kostenraming | code, kostenpost, omschrijving, hoeveelheid, eenheid, eenheidsprijs, bedrag |
| Kostenbudget | kostenpost, budget |

De kopregel en kolommen worden automatisch herkend en zijn aan te passen. Totaal- en subtotaalregels
worden overgeslagen. Een nieuwe import vervangt het vorige bestand van dat onderdeel.

## Berekening per kostenpost

- **Opdracht** = som van offertes met status akkoord/opdracht/gegund
- **Gefactureerd** = som van facturen; een factuur zonder kostenpost krijgt de post van de offerte waarnaar hij verwijst
- **Prognose eindkosten** = hoogste van raming, opdracht en gefactureerd
- **Ruimte** = budget − prognose; signaal vanaf instelbaar percentage (standaard 90 %)

Aandachtspunten: post of project boven budget, opdracht boven raming, gefactureerd boven offertebedrag,
factuur op een offerte zonder opdracht, onbekend of ontbrekend offertenummer, dubbele factuurnummers,
offertes/facturen zonder kostenpost.

Export van het overzicht naar Excel via de knop rechtsboven.
