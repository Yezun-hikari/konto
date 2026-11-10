// Nutzungsbedingungen for the yezun.de account and the sites that use it.
import type { LegalDoc } from './types.ts';

const KONTO = '#/konto';
const PRIVACY = '#/datenschutz';

export const nutzungsbedingungen: LegalDoc = {
  title: 'Nutzungsbedingungen',
  stand: '10. November 2026',
  intro: [
    {
      p: 'Diese Bedingungen gelten für das yezun.de-Konto und für die Seiten, die es nutzen: die Konto-Seite, XOX und die Handschrift-App.',
    },
  ],
  sections: [
    {
      heading: 'Anbieter und Art des Angebots',
      blocks: [
        { p: ['Anbieter ist ', { field: 'name' }, ', erreichbar per E-Mail an ', { field: 'email', mailto: true }, '.'] },
        {
          p: 'yezun.de ist ein privates, nicht kommerzielles Hobbyprojekt ohne Werbung. Die Nutzung ist kostenlos; es gibt keine kostenpflichtigen Leistungen.',
        },
      ],
    },
    {
      heading: 'Leistungen und Verfügbarkeit',
      blocks: [
        {
          p: 'Das Konto ermöglicht die Anmeldung auf allen Seiten von yezun.de. XOX bietet Partien zu zweit, online gegen andere oder gegen einen Bot, mit Wertung und Chat. Die Handschrift-App wandelt Text in Dateien in deiner eigenen Handschrift um.',
        },
        {
          p: 'Es besteht kein Anspruch auf eine bestimmte Verfügbarkeit oder auf den Fortbestand einzelner Funktionen. Funktionen können geändert, eingeschränkt oder eingestellt werden, und die Seiten können – etwa für Wartung oder wegen Störungen bei Dienstleistern – zeitweise nicht erreichbar sein.',
        },
      ],
    },
    {
      heading: 'Konto',
      blocks: [
        {
          ul: [
            'Jedes Konto ist für eine Person bestimmt. Gib es nicht an andere weiter.',
            'Gib bei der Registrierung eine E-Mail-Adresse an, über die du selbst verfügst.',
            'Halte dein Passwort geheim. Vermutest du, dass jemand anderes Zugriff hat, ändere es auf der Konto-Seite.',
            'Mehrere Konten, um Wertungen zu beeinflussen oder Sperren zu umgehen, sind nicht erlaubt.',
            'XOX kannst du ohne Registrierung als Gast nutzen. Ungenutzte Gastkonten werden nach 30 Tagen gelöscht.',
          ],
        },
      ],
    },
    {
      heading: 'Benutzernamen und Spitznamen',
      blocks: [
        {
          p: 'Benutzernamen und Spitznamen dürfen nicht beleidigend, obszön, diskriminierend, extremistisch oder sonst rechtswidrig sein, nicht über die Identität täuschen (etwa durch Nachahmen anderer Personen oder des Anbieters) und keine Werbung enthalten.',
        },
        {
          p: 'Spitznamen und Chatnachrichten werden automatisch auf anstößige Wörter geprüft. Diese Prüfung ist nicht vollständig; für deine Namen und Texte bist du trotzdem selbst verantwortlich.',
        },
      ],
    },
    {
      heading: 'Verhalten im Chat',
      blocks: [
        {
          p: 'Der Chat in XOX ist für freundliche Nachrichten zur Partie gedacht. Nicht erlaubt sind insbesondere Beleidigungen, Belästigung, Drohungen, Hassrede, Spam, Werbung sowie das Veröffentlichen persönlicher Daten anderer. Links werden nicht zugelassen.',
        },
      ],
    },
    {
      heading: 'Unzulässige Nutzung',
      blocks: [
        { p: 'Nicht erlaubt ist insbesondere:' },
        {
          ul: [
            'die Seiten automatisiert zu nutzen, etwa mit Skripten oder Programmen, die Partien spielen, Konten anlegen oder massenhaft Anfragen senden;',
            'Angriffe auf die Seiten oder ihre Dienste, das Ausnutzen von Sicherheitslücken und das Umgehen von Begrenzungen oder Schutzmaßnahmen;',
            'Wertungen oder Partien zu manipulieren, etwa durch abgesprochene Partien;',
            'auf Konten oder Daten anderer zuzugreifen;',
            'die Seiten für rechtswidrige Zwecke zu verwenden.',
          ],
        },
        { p: 'Gefundene Sicherheitslücken meldest du bitte per E-Mail an den Anbieter.' },
      ],
    },
    {
      heading: 'Deine Inhalte',
      blocks: [
        {
          p: 'Deine Handschrift, die Texte, die du umwandelst, und die daraus erzeugten Dateien gehören dir. Du räumst dem Anbieter nur die Rechte ein, die nötig sind, um deine Inhalte für dich zu speichern und – bei Spitznamen und Chatnachrichten – deinen Mitspielenden anzuzeigen.',
        },
        {
          p: 'Du bist für die Inhalte verantwortlich, die du eingibst, und stellst sicher, dass du dazu berechtigt bist. Sichere Dateien, die du behalten möchtest, selbst; ein Anspruch auf dauerhafte Speicherung besteht nicht.',
        },
      ],
    },
    {
      heading: 'Maßnahmen bei Verstößen',
      blocks: [
        {
          p: 'Bei Verstößen gegen diese Bedingungen kann der Anbieter Inhalte löschen, Namen zurücksetzen und Konten vorübergehend sperren oder löschen. Dabei werden die Schwere des Verstoßes und deine berechtigten Interessen berücksichtigt.',
        },
      ],
    },
    {
      heading: 'Beendigung',
      blocks: [
        {
          p: [
            'Du kannst die Nutzung jederzeit beenden, indem du dein Konto oder deine Gastdaten auf der ',
            { text: 'Konto-Seite', href: KONTO },
            ' löschst. Dabei werden alle zugehörigen Daten gelöscht.',
          ],
        },
        {
          p: 'Der Anbieter kann das Angebot insgesamt oder einzelne Seiten einstellen. Er kündigt das, soweit möglich, mit angemessener Frist auf den Seiten an.',
        },
      ],
    },
    {
      heading: 'Haftung',
      blocks: [
        {
          p: 'Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach dem Produkthaftungsgesetz.',
        },
        {
          p: 'Bei leichter Fahrlässigkeit haftet der Anbieter nur für die Verletzung wesentlicher Pflichten, also solcher, deren Erfüllung die Nutzung erst ermöglicht und auf deren Einhaltung du vertrauen darfst. In diesem Fall ist die Haftung auf den vorhersehbaren, typischerweise eintretenden Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.',
        },
      ],
    },
    {
      heading: 'Änderungen dieser Bedingungen',
      blocks: [
        {
          p: 'Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern, etwa wenn sich Funktionen oder die Rechtslage ändern. Änderungen werden rechtzeitig vorher auf den Seiten angekündigt. Bist du nicht einverstanden, kannst du dein Konto jederzeit löschen.',
        },
      ],
    },
    {
      heading: 'Schlussbestimmungen',
      blocks: [
        {
          p: 'Es gilt das Recht der Bundesrepublik Deutschland. Bist du Verbraucher mit gewöhnlichem Aufenthalt in einem anderen Staat, bleiben die zwingenden Verbraucherschutzvorschriften dieses Staates unberührt.',
        },
        { p: 'Sollte eine Bestimmung unwirksam sein, bleiben die übrigen Bestimmungen wirksam.' },
        { p: ['Wie wir mit deinen Daten umgehen, steht in der ', { text: 'Datenschutzerklärung', href: PRIVACY }, '.'] },
      ],
    },
  ],
};
