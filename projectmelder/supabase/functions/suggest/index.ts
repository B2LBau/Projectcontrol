// AI-voorstel: zet ingesproken/getypte tekst om in één of meer gestructureerde meldingen
// (type, titel, eigenaar, termijn, locatie, ernst). De melder bevestigt altijd zelf (FO §5.4).
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { z } from 'npm:zod@4.6.7';

import { corsHeaders, json, userClient } from '../_shared/clients.ts';
import { END_OF_DAY_HOUR } from '../_shared/deadlines.ts';
import { amsterdamParts, amsterdamTime } from '../_shared/workdays.ts';

const MODEL = 'claude-opus-5-5';
const MAX_TEXT = 8000;

const ItemSchema = z.object({
  type: z.enum(['actie', 'besluit', 'constatering', 'controleronde', 'verkeersmaatregel', 'gereedmelding', 'afwijking', 'vraag']),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['laag', 'normaal', 'hoog', 'kritiek']),
  owner_user_id: z.string().nullable(),
  due_date: z.string().nullable(),
  due_time: z.string().nullable(),
  location_label: z.string().nullable(),
});
const ResultSchema = z.object({ items: z.array(ItemSchema) });

const SYSTEM = `Je helpt medewerkers op bouw- en montageprojecten (kabels, leidingen, civiel, elektrotechniek) om gesproken meldingen vast te leggen. Je krijgt de transcriptie van wat iemand in het veld of tijdens een overleg heeft ingesproken. Zet dit om in gestructureerde meldingen voor het projectlogboek.

Meldingstypen:
- actie: iemand moet iets doen.
- besluit: er is iets besloten of afgesproken.
- constatering: een waarneming zonder directe afwijking van eisen.
- afwijking: afwijking van ontwerp, eisen, vergunning, veiligheid of afspraak.
- gereedmelding: werk of een locatie is klaar en moet beoordeeld worden.
- verkeersmaatregel: plaatsing, controle, wijziging, schade of verwijdering van tijdelijke verkeersmaatregelen.
- controleronde: verslag van een inspectieronde.
- vraag: een vraag aan iemand of informatie ter kennisname.

Regels:
- Maak alleen meerdere meldingen als er duidelijk meerdere afzonderlijke acties, besluiten of bevindingen worden genoemd. Meestal is het er één.
- title: kort en zakelijk (max. 80 tekens), in het Nederlands, zonder het type ervoor.
- description: de inhoud netjes geformuleerd, zonder informatie weg te laten of toe te voegen. Spreektaal en herhalingen mag je opschonen; maatvoering, aantallen en namen niet wijzigen.
- severity: 'kritiek' alleen bij direct gevaar voor personen of een gevaarlijke situatie die stilleggen vereist; 'hoog' bij urgent/spoed of veiligheidsrisico; 'laag' als expliciet geen haast; anders 'normaal'.
- owner_user_id: alleen een id uit de lijst met projectleden, als de eigenaar/actiehouder duidelijk genoemd wordt (naam, rol of bedrijf). Anders null. Verzin nooit een id.
- due_date: alleen als er een termijn genoemd wordt; reken relatieve termijnen ("morgen", "vóór donderdag" = uiterlijk woensdag, "eind van de week" = vrijdag, "over twee weken") om naar YYYY-MM-DD vanaf de opgegeven datum. Anders null.
- due_time: HH:MM alleen als een tijdstip genoemd wordt, anders null.
- location_label: de genoemde plek (bijv. "mofput 12", "Dorpsstraat 14", "tracédeel 3"), anders null.
- Gebruik alleen informatie uit de tekst; vul niets aan dat niet gezegd is.`;

type Member = { user_id: string; full_name: string; role: string; organisation_name: string | null };

function parseDue(date: string | null, time: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const m = time?.match(/^(\d{1,2}):(\d{2})$/);
  const hour = m ? Math.min(Number(m[1]), 23) : END_OF_DAY_HOUR;
  const minute = m ? Math.min(Number(m[2]), 59) : 0;
  return amsterdamTime(date, hour, minute).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405);

  let body: { project_id?: string; text?: string; type_hint?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ongeldige JSON' }, 400);
  }
  const text = (body.text ?? '').trim();
  if (!body.project_id || !text) return json({ error: 'project_id en text zijn verplicht' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'Tekst is te lang' }, 413);

  // Leden ophalen met de rechten van de gebruiker: geen lid = geen resultaat.
  const supabase = userClient(req);
  const { data: members, error } = await supabase
    .from('member_directory')
    .select('user_id, full_name, role, organisation_name')
    .eq('project_id', body.project_id)
    .eq('active', true);
  if (error) return json({ error: error.message }, 400);
  if (!members || members.length === 0) return json({ error: 'Geen toegang tot dit project' }, 403);

  const now = new Date();
  const today = amsterdamParts(now).date;
  const weekday = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: 'Europe/Amsterdam' }).format(now);
  const memberList = (members as Member[])
    .map((m) => `- id ${m.user_id}: ${m.full_name} (${m.role}${m.organisation_name ? ', ' + m.organisation_name : ''})`)
    .join('\n');
  const hint = body.type_hint ? `\nDe melder heeft vooraf type "${body.type_hint}" gekozen; gebruik dat voor de (eerste) melding.` : '';

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ResultSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Vandaag: ${weekday} ${today}.${hint}\n\nProjectleden:\n${memberList}\n\nTranscriptie:\n<transcriptie>\n${text}\n</transcriptie>`,
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'AI tijdelijk druk, probeer opnieuw' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI-fout ${e.status}` }, 502);
    throw e;
  }

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return json({ error: 'Geen voorstel mogelijk' }, 422);
  }

  const ids = new Set((members as Member[]).map((m) => m.user_id));
  const suggestions = response.parsed_output.items.slice(0, 10).map((s) => ({
    type: s.type,
    title: s.title.slice(0, 300) || 'Melding',
    description: s.description,
    severity: s.severity,
    owner_id: s.owner_user_id && ids.has(s.owner_user_id) ? s.owner_user_id : null,
    due_at: parseDue(s.due_date, s.due_time),
    location_label: s.location_label,
    source: 'ai' as const,
  }));
  return json({ suggestions });
});
