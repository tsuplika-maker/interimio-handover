import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.jsx";
import { useSettings } from "./SettingsContext.jsx";

export function Impressum() {
  const { settings } = useSettings();
  const s = settings || {};
  const has = (k) => s[k] && String(s[k]).trim().length > 0;
  return (
    <section className="section" data-testid="impressum-page">
      <div className="mx-auto max-w-3xl px-6">
        <Card>
          <CardHeader>
            <CardTitle>Impressum</CardTitle>
            <CardDescription>Angaben gemäß § 5 TMG</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed">
            <div>
              <h3 className="font-semibold mb-1">Anbieter</h3>
              <p>
                {has("impressum_company") ? s.impressum_company : "Interimio"}<br />
                {has("impressum_address") ? s.impressum_address.split("\n").map((l,i)=>(<span key={i}>{l}<br/></span>)) : <span className="opacity-50">[Bitte Anschrift im Admin → Inhalte ergänzen]</span>}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Kontakt</h3>
              <p>
                E-Mail: <a className="text-blue-700 underline" href={`mailto:${s.impressum_email || "kontakt@interimio.eu"}`}>{s.impressum_email || "kontakt@interimio.eu"}</a><br />
                {has("impressum_phone") && <>Telefon: {s.impressum_phone}</>}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Vertretungsberechtigte Person</h3>
              <p>{has("impressum_responsible") ? s.impressum_responsible : <span className="opacity-50">[Name der vertretungsberechtigten Person — im Admin → Inhalte ergänzen]</span>}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Registereintrag</h3>
              <p>
                Registergericht: {has("impressum_register_court") ? s.impressum_register_court : <span className="opacity-50">[ggf. ergänzen]</span>}<br />
                Registernummer: {has("impressum_register_number") ? s.impressum_register_number : <span className="opacity-50">[ggf. ergänzen]</span>}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Streitschlichtung</h3>
              <p>
                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:&nbsp;
                <a className="text-blue-700 underline" target="_blank" rel="noopener noreferrer" href="https://ec.europa.eu/consumers/odr/">https://ec.europa.eu/consumers/odr/</a>.<br />
                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Haftung für Inhalte</h3>
              <p>
                Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich.
                Manager-Profile werden vor Veröffentlichung sichtgeprüft, Selbstauskünfte der Manager bleiben jedoch in deren Verantwortung.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function Datenschutz() {
  return (
    <section className="section" data-testid="datenschutz-page">
      <div className="mx-auto max-w-3xl px-6">
        <Card>
          <CardHeader>
            <CardTitle>Datenschutzerklärung</CardTitle>
            <CardDescription>Informationen nach Art. 13/14 DSGVO</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed">
            <div>
              <h3 className="font-semibold mb-1">1. Verantwortlicher</h3>
              <p>
                Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website ist:<br />
                Interimio — eine Marke der MiLi Beteiligungs-Holding GmbH · Franz-Joseph-Str. 11, 80801 München · E-Mail: kontakt@interimio.eu
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">2. Erhebung und Verarbeitung</h3>
              <p>
                Wir verarbeiten personenbezogene Daten nur, soweit dies für die Bereitstellung der Plattform und der vertraglichen Leistungen erforderlich ist (Art. 6 Abs. 1 lit. b DSGVO),
                Sie eingewilligt haben (Art. 6 Abs. 1 lit. a DSGVO) oder ein berechtigtes Interesse vorliegt (Art. 6 Abs. 1 lit. f DSGVO).
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Registrierungsdaten: E-Mail, Passwort (gehashed), Rolle, Firmenname.</li>
                <li>Manager-Profil: Name, Titel, Standort, Tagessatz, Bio, Foto, Skills.</li>
                <li>Anfrage-Daten (Leads): Firma, Kontaktperson, E-Mail, Projektdauer.</li>
                <li>Zahlungsdaten: über Stripe — wir speichern keine Kartendaten.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-1">3. Auftragsverarbeiter & Drittlandtransfer</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Stripe Payments Europe Ltd.</b> (Irland) — Zahlungsabwicklung.</li>
                <li><b>Resend (Resend.com Inc.)</b> — Transaktionale E-Mails (OTP, Bestätigungen).</li>
                <li><b>Anthropic (Claude)</b> — KI-Matching von Projekten zu Managern; Daten werden zur Inferenz übermittelt und nicht zum Modelltraining verwendet.</li>
                <li><b>MongoDB</b> — Datenbank-Hosting innerhalb der EU.</li>
              </ul>
              <p className="mt-2">Mit allen genannten Auftragsverarbeitern bestehen AV-Verträge gem. Art. 28 DSGVO. Bei Drittlandtransfers (USA) erfolgen diese auf Basis von Standardvertragsklauseln und Angemessenheitsbeschluss DPF.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">4. Cookies & Tracking</h3>
              <p>
                Wir setzen technisch notwendige Cookies (Session, Sprache). Für Analyse nutzen wir PostHog (EU-Region) mit pseudonymisierten Daten.
                Sie können der Verarbeitung jederzeit widersprechen.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">5. Ihre Rechte</h3>
              <p>Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21).
                Es besteht ein Beschwerderecht bei der zuständigen Aufsichtsbehörde.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">6. Speicherdauer</h3>
              <p>Nutzungsdaten werden so lange gespeichert, wie ein aktiver Vertrag besteht, zzgl. handels- und steuerrechtlicher Aufbewahrungspflichten (bis zu 10 Jahre).</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">7. Kontakt</h3>
              <p>Anfragen zum Datenschutz: <a className="text-blue-700 underline" href="mailto:datenschutz@interimio.eu">datenschutz@interimio.eu</a></p>
            </div>
            <div className="text-xs opacity-60 pt-4 border-t">
              Stand: {new Date().toLocaleDateString("de-DE", { year: "numeric", month: "long" })}.
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function AGB() {
  return (
    <section className="section" data-testid="agb-page">
      <div className="mx-auto max-w-3xl px-6">
        <Card>
          <CardHeader>
            <CardTitle>Allgemeine Geschäftsbedingungen</CardTitle>
            <CardDescription>Geltungsbereich, Leistungen, Vergütung, Haftung</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed">
            <div>
              <h3 className="font-semibold mb-1">§ 1 Geltungsbereich</h3>
              <p>Diese AGB regeln das Vertragsverhältnis zwischen der Interimio-Plattform (nachfolgend „Plattform") und ihren Nutzer:innen (Interim Manager und Unternehmen).</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 2 Leistungen</h3>
              <p>Die Plattform vermittelt Kontakt zwischen Unternehmen und Interim Managern. Die Plattform wird nicht selbst Vertragspartei eines Mandats, sondern stellt ausschließlich die technische Infrastruktur sowie Profilsichtung und Qualitätssicherung bereit.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 3 Manager-Mitgliedschaft</h3>
              <p>Interim Manager schließen eine Mitgliedschaft mit der Plattform ab. <b>Aktionszeitraum:</b> Bei Registrierung bis zum 30.09.2026 ist die Mitgliedschaft im Rahmen eines Jahresvertrags kostenfrei bis zum 31.12.2026. Danach beträgt der Mitgliedsbeitrag €1.999/Jahr (gesamt) oder €199/Monat (jeweils netto zzgl. ges. USt.). Die Mitgliedschaft beginnt mit Aktivierung. Der Jahresvertrag hat eine feste Laufzeit von 12 Monaten und ist während der Laufzeit nicht ordentlich kündbar; er endet automatisch nach 12 Monaten, sofern keine Verlängerung erfolgt. Die monatliche Mitgliedschaft kann mit einer Frist von 14 Tagen zum Monatsende gekündigt werden. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 4 Vermittlungsgebühr</h3>
              <p>Bei erfolgreicher Vermittlung zahlt das beauftragende Unternehmen eine Vermittlungsgebühr in Höhe von 20–30 % auf den vereinbarten Tagessatz × Einsatzdauer. Die konkrete Höhe wird individuell vereinbart. Die Gebühr wird mit Auftragsbeginn fällig.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 5 Pflichten der Nutzer:innen</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Wahrheitsgemäße Angaben in Profil, Anfrage und Bewertung.</li>
                <li>Keine unmittelbare Vermittlung außerhalb der Plattform mit dem Ziel, die Vermittlungsgebühr zu umgehen (gilt für 12 Monate ab Erstkontakt).</li>
                <li>Vertraulichkeit aller über die Plattform erhaltenen Informationen.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 6 Haftung</h3>
              <p>Die Plattform haftet nicht für die Erbringung der vereinbarten Manager-Leistung, deren Qualität oder den geschäftlichen Erfolg eines Mandats. Eine Haftung für Vorsatz und grobe Fahrlässigkeit bleibt unberührt.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 7 Widerrufsrecht</h3>
              <p>Da sich die Plattform ausschließlich an Unternehmer und selbstständige Manager (B2B) richtet, besteht kein gesetzliches Verbraucher-Widerrufsrecht.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">§ 8 Schlussbestimmungen</h3>
              <p>Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist München, soweit gesetzlich zulässig. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen davon unberührt.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
