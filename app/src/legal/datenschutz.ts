// Datenschutzerklärung. Facts follow the code: supabase/migrations, supabase/functions, sdk/src, app/src and the
// READMEs/sources of the xox and handwriting sites. Keep this text in line when data handling changes.
import type { LegalDoc } from './types.ts';

const KONTO = '#/konto';
const TERMS = '#/nutzungsbedingungen';

export const datenschutz: LegalDoc = {
  title: 'Datenschutzerklärung',
  stand: '10. November 2026',
  intro: [
    {
      p: 'Diese Erklärung gilt für die Seiten auf yezun.de, die das gemeinsame yezun.de-Konto nutzen: die Konto-Seite (yezun.de/konto), das Spiel XOX (yezun.de/xox) und die Handschrift-App (yezun.de/handwriting). Sie beschreibt, welche personenbezogenen Daten dabei verarbeitet werden, wozu und wie lange.',
    },
    {
      p: 'Kurz gesagt: Wir speichern nur, was für Konto und Funktionen nötig ist. Es gibt keine Werbung, keine Analyse- oder Tracking-Dienste und keine Cookies. Schriften werden von yezun.de selbst ausgeliefert, nicht von Drittanbietern.',
    },
  ],
  sections: [
    {
      heading: 'Verantwortlicher',
      blocks: [
        { p: 'Verantwortlich für die Datenverarbeitung auf diesen Seiten ist:' },
        { p: [{ field: 'name' }] },
        { p: ['E-Mail: ', { field: 'email', mailto: true }] },
        {
          p: 'yezun.de ist ein privates, nicht kommerzielles Hobbyprojekt. Für Fragen zum Datenschutz und zur Ausübung deiner Rechte genügt eine E-Mail an die oben genannte Adresse.',
        },
      ],
    },
    {
      heading: 'Bereitstellung der Webseiten (GitHub Pages)',
      blocks: [
        {
          p: 'Die Seiten auf yezun.de werden über GitHub Pages ausgeliefert, einen Dienst der GitHub Inc. (USA). Beim Aufruf einer Seite verarbeitet GitHub technisch notwendige Daten, insbesondere deine IP-Adresse, Datum und Uhrzeit des Abrufs, die aufgerufene Adresse sowie Angaben zu Browser und Betriebssystem, und speichert sie in Server-Protokollen. Wir haben auf diese Protokolle keinen Zugriff.',
        },
        {
          p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: Unser berechtigtes Interesse ist die sichere und zuverlässige Auslieferung der Seiten. Die Speicherdauer der Protokolle legt GitHub fest.',
        },
      ],
    },
    {
      heading: 'Das yezun.de-Konto',
      blocks: [
        {
          p: 'Mit einem Konto meldest du dich auf allen Seiten von yezun.de und auf mehreren Geräten an. Bei der Registrierung mit Benutzername und Passwort verarbeiten wir:',
        },
        {
          ul: [
            'den Benutzernamen (3–20 Zeichen), mit dem du dich anmeldest;',
            'dein Passwort, das ausschließlich als Hash-Wert (bcrypt) gespeichert wird – im Klartext kennt es niemand, auch wir nicht;',
            'eine interne Anmeldeadresse der Form benutzername@users.yezun-games.invalid. Sie ist keine echte E-Mail-Adresse und dient nur der technischen Anmeldung;',
            'deine E-Mail-Adresse samt Bestätigungsstatus und Zeitpunkten. Wir nutzen sie nur, um dir den Bestätigungslink und auf Wunsch einen Link zum Zurücksetzen des Passworts zu schicken. Sie ist für niemanden sichtbar und wird nicht für Werbung oder Newsletter verwendet. Du kannst sie in deinem Konto ändern;',
            'technische Kontodaten wie Erstellungszeitpunkt, letzte Anmeldung und deine Anmeldesitzungen. Der Anmeldedienst (Supabase Auth) protokolliert dabei auch IP-Adresse und Browserkennung, um Sitzungen zu verwalten und Missbrauch zu erkennen.',
          ],
        },
        {
          p: 'Meldest du dich mit Google an, gilt zusätzlich Abschnitt 7. Ein Konto mit Google hat kein Passwort; an die Stelle der bestätigten E-Mail-Adresse tritt die Adresse deines Google-Kontos.',
        },
        {
          p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung des Kontos gemäß den Nutzungsbedingungen). Die Daten bleiben gespeichert, bis du dein Konto löschst.',
        },
        { h3: 'Links in E-Mails' },
        {
          p: 'Bestätigungs- und Passwort-Links enthalten einen zufälligen, einmal verwendbaren Code. Gespeichert werden nur dessen Hash-Wert, die Adresse, an die der Link ging, und die Gültigkeitsdauer: 24 Stunden für Bestätigungslinks, 1 Stunde für Passwort-Links. Abgelaufene Einträge werden stündlich automatisch gelöscht.',
        },
        { h3: 'Schutz vor Missbrauch' },
        {
          p: 'Um Passwort-Rateversuche, das Ausprobieren vergebener Benutzernamen und massenhaften E-Mail-Versand zu verhindern, gelten Begrenzungen. Dafür speichern wir:',
        },
        {
          ul: [
            'fehlgeschlagene Passwortprüfungen und Versuche, einen Benutzernamen festzulegen (nur Konto und Zeitpunkt) – gelöscht nach einem Tag;',
            'für versendete E-Mails nur einen Hash-Wert (SHA-256) der Empfängeradresse und den Zeitpunkt, nicht die Adresse selbst – gelöscht nach zwei Tagen.',
          ],
        },
        { p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist die Sicherheit der Konten und des Dienstes.' },
      ],
    },
    {
      heading: 'Gastkonten',
      blocks: [
        {
          p: 'Du kannst XOX ohne Registrierung als Gast nutzen. Dafür wird automatisch ein anonymes Gastkonto angelegt – ohne Benutzername, E-Mail-Adresse oder Passwort. Daran hängen nur die Daten, die beim Spielen entstehen (Abschnitt 5).',
        },
        {
          p: 'Gastkonten, die 30 Tage lang nicht genutzt wurden, werden mit allen zugehörigen Daten automatisch gelöscht (außer während einer laufenden Partie). Du kannst deine Gastdaten jederzeit selbst auf der Konto-Seite löschen. Registrierst du dich als Gast, werden Fortschritt und Spitzname in das neue Konto übernommen.',
        },
        { p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.' },
      ],
    },
    {
      heading: 'XOX',
      blocks: [
        { p: 'Beim Online-Spielen verarbeiten wir:' },
        {
          ul: [
            'deinen Spitznamen (3–16 Zeichen). Er ist für deine Gegner sichtbar;',
            'deine Wertung je Spiel sowie die Zahl deiner Partien und Siege;',
            'deine Online-Partien: beteiligte Konten mit Spitznamen und Wertung, Spielverlauf, Ergebnis und Zeitpunkte. Eine Partie bleibt gespeichert, bis eines der beiden beteiligten Konten gelöscht wird;',
            'kurzzeitig einen Eintrag in der Warteschlange der Spielersuche, der beim Start einer Partie oder beim Verlassen der Suche entfernt wird;',
            'Chatnachrichten in Partien zwischen zwei Menschen (höchstens 200 Zeichen). Sie sind nur für die beiden Beteiligten der Partie lesbar, werden vor dem Speichern automatisch auf Beleidigungen und Links geprüft und nach 24 Stunden automatisch gelöscht.',
          ],
        },
        {
          p: 'Spitznamen und Chatnachrichten werden automatisch auf anstößige Wörter geprüft; ein Treffer verhindert nur das Speichern des betreffenden Textes. Einstellungen wie Farbschema und Ton speichert XOX nur in deinem Browser.',
        },
        { p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für die Prüfung von Texten Art. 6 Abs. 1 lit. f DSGVO (Schutz der Spielenden vor Beleidigungen).' },
      ],
    },
    {
      heading: 'Handschrift',
      blocks: [
        {
          ul: [
            'Mit einem registrierten Konto werden deine erfassten Zeichen (die Stiftstriche je Zeichen und Variante) und einige Einstellungen (z. B. Ligaturen, Abstände, Strichbreiten) in deinem Konto gespeichert, damit du sie auf allen Geräten nutzen kannst. Nur du hast Zugriff darauf.',
            'Als Gast oder ohne Anmeldung bleiben Zeichen und Einstellungen ausschließlich im Speicher deines Browsers (localStorage) und werden nicht an uns übertragen. Nach einer Anmeldung fragt die App, ob sie vorhandene Zeichen in dein Konto übernehmen soll.',
            'Der Text, den du umwandelst, und die erzeugte Datei werden nur in deinem Browser verarbeitet und nicht hochgeladen. Ein Entwurf des Textes bleibt lokal in deinem Browser gespeichert.',
          ],
        },
        { p: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Die Daten im Konto bleiben gespeichert, bis du sie in der App oder mit deinem Konto löschst.' },
      ],
    },
    {
      heading: 'Anmeldung mit Google',
      blocks: [
        {
          p: 'Wenn du „Mit Google anmelden“ oder „Mit Google registrieren“ wählst, wirst du zu Google weitergeleitet (Google Ireland Limited bzw. Google LLC, USA). Die Anmeldung dort findet zwischen dir und Google statt; dein Google-Passwort erhalten wir nicht. Für die Verarbeitung bei Google gilt dessen Datenschutzerklärung.',
        },
        {
          p: 'Nach der Anmeldung übermittelt Google an unseren Anmeldedienst deine Google-Kennung (ID), deine E-Mail-Adresse und die Angaben deines Google-Profils (Name und Adresse des Profilbilds). Diese Angaben werden im Konto gespeichert; verwendet werden nur Kennung und E-Mail-Adresse, um dein Konto zuzuordnen. Den Benutzernamen wählst du anschließend selbst.',
        },
        {
          p: 'Diese Art der Anmeldung ist freiwillig; Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du durch die Wahl der Google-Anmeldung erteilst, sowie Art. 6 Abs. 1 lit. b DSGVO für das so angelegte Konto. Du kannst die Verbindung beenden, indem du dein Konto löschst; den Zugriff kannst du außerdem in deinem Google-Konto widerrufen.',
        },
      ],
    },
    {
      heading: 'Speicher im Browser, keine Cookies',
      blocks: [
        { p: 'Die Seiten setzen keine Cookies. Im Speicher deines Browsers (localStorage) legen sie ab:' },
        {
          ul: [
            'deine Anmeldesitzung (Zugangs-Token). Alle Seiten auf yezun.de teilen sich diesen Eintrag, deshalb bist du überall gleichzeitig angemeldet. Er wird beim Abmelden entfernt;',
            'Einstellungen wie das Farbschema und – je nach Seite – die oben genannten lokalen Daten.',
          ],
        },
        {
          p: 'Während einer Anmeldung mit Google wird kurzzeitig ein technischer Vermerk im Sitzungsspeicher (sessionStorage) abgelegt. Diese Speicherungen sind für die von dir gewünschten Funktionen unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Es gibt keine Analyse, kein Tracking und keine Werbung.',
        },
      ],
    },
    {
      heading: 'Dienstleister und Empfänger',
      blocks: [
        { p: 'Wir setzen folgende Dienstleister ein, die Daten in unserem Auftrag verarbeiten:' },
        {
          ul: [
            [
              'Supabase Inc. (USA): Datenbank, Anmeldedienst und Serverfunktionen. Das Projekt liegt in der Region ',
              { field: 'supabaseRegion' },
              '; die Daten werden also in der EU gespeichert. Als US-Unternehmen kann Supabase dennoch Zugriff auf die Daten haben.',
            ],
            'Resend Inc. (USA): Versand der Konto-E-Mails (Bestätigungs- und Passwort-Links) im Namen von konto@yezun.de. Resend erhält dafür die Empfängeradresse und den Inhalt der E-Mail.',
            'GitHub Inc. (USA): Auslieferung der Webseiten (Abschnitt 2).',
          ],
        },
        {
          p: 'Google erhält Daten nur, wenn du die Google-Anmeldung wählst (Abschnitt 7). Andere Spielende sehen in XOX deinen Spitznamen, deine Wertung, den Partieverlauf und deine Chatnachrichten in gemeinsamen Partien. Darüber hinaus geben wir keine Daten weiter und verkaufen keine Daten.',
        },
        { h3: 'Übermittlung in die USA' },
        {
          p: 'Bei den genannten US-Unternehmen kann eine Übermittlung in die USA oder ein Zugriff von dort stattfinden. Sie stützt sich auf den Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework (Art. 45 DSGVO), soweit das jeweilige Unternehmen danach zertifiziert ist, und andernfalls auf die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO).',
        },
      ],
    },
    {
      heading: 'Speicherdauer im Überblick',
      blocks: [
        {
          ul: [
            'Kontodaten, Spitzname, Wertung, Partien und Handschrift-Daten: bis zur Löschung deines Kontos (Partien: bis eines der beiden beteiligten Konten gelöscht wird);',
            'Gastkonten: bis zur Löschung durch dich, spätestens nach 30 Tagen ohne Nutzung;',
            'Chatnachrichten: 24 Stunden;',
            'Links in E-Mails: 24 Stunden bzw. 1 Stunde gültig, danach innerhalb einer Stunde gelöscht;',
            'Protokolle zur Missbrauchsabwehr: ein bis zwei Tage;',
            'Daten im Browser: bis du sie löschst oder dich abmeldest.',
          ],
        },
      ],
    },
    {
      heading: 'Deine Rechte',
      blocks: [
        { p: 'Du hast im Rahmen der gesetzlichen Voraussetzungen das Recht auf:' },
        {
          ul: [
            'Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO);',
            'Berichtigung unrichtiger Daten (Art. 16 DSGVO);',
            'Löschung (Art. 17 DSGVO);',
            'Einschränkung der Verarbeitung (Art. 18 DSGVO);',
            'Datenübertragbarkeit (Art. 20 DSGVO);',
            'Widerspruch gegen Verarbeitungen, die auf Art. 6 Abs. 1 lit. f DSGVO beruhen, aus Gründen, die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO);',
            'Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO);',
            'Beschwerde bei einer Datenschutz-Aufsichtsbehörde, insbesondere in dem Mitgliedstaat deines Aufenthaltsorts (Art. 77 DSGVO).',
          ],
        },
        {
          p: [
            'Dein Konto oder deine Gastdaten kannst du jederzeit selbst auf der ',
            { text: 'Konto-Seite', href: KONTO },
            ' löschen. Dabei werden alle zugehörigen Daten entfernt, einschließlich Benutzername, E-Mail-Adresse, Wertungen, Partien und Handschrift-Daten. Für alle anderen Anliegen schreib an ',
            { field: 'email', mailto: true },
            '.',
          ],
        },
      ],
    },
    {
      heading: 'Pflicht zur Angabe, keine automatisierten Entscheidungen',
      blocks: [
        {
          p: 'Für ein Konto mit Passwort sind Benutzername, Passwort und E-Mail-Adresse erforderlich; ohne sie kann kein Konto angelegt werden. XOX kannst du auch ohne diese Angaben als Gast spielen.',
        },
        {
          p: 'Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt. Die automatische Wortprüfung von Spitznamen und Chatnachrichten verhindert lediglich das Speichern einzelner Texte.',
        },
      ],
    },
    {
      heading: 'Änderungen',
      blocks: [
        {
          p: [
            'Wir passen diese Erklärung an, wenn sich die Seiten oder die Rechtslage ändern. Es gilt die jeweils hier veröffentlichte Fassung. Siehe auch die ',
            { text: 'Nutzungsbedingungen', href: TERMS },
            '.',
          ],
        },
      ],
    },
  ],
};
