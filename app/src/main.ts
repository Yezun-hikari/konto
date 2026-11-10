import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './style.css';
import { currentUser, isConfigured, isOAuthReturn, onAuthChange, safeReturnUrl } from '../../sdk/src/index.ts';
import { returnTarget, shortUrl } from './dom.ts';
import { href, onRoute, refreshRoute, registerScreen, setGuard, startRouter } from './router.ts';
import { kontoScreen } from './screens/konto.ts';
import { loginScreen } from './screens/login.ts';
import { oauthReturnScreen, usernameScreen } from './screens/oauth.ts';
import { resetRequestScreen, resetScreen } from './screens/reset.ts';
import { unverifiedScreen } from './screens/unverified.ts';
import { verifyScreen } from './screens/verify.ts';
import { initTheme } from './theme.ts';

registerScreen('konto', kontoScreen);
registerScreen('login', loginScreen);
registerScreen('reset', resetScreen);
registerScreen('reset-request', resetRequestScreen);
registerScreen('verify-email', verifyScreen);
registerScreen('anmeldung', oauthReturnScreen);
registerScreen('benutzername', usernameScreen);
registerScreen('bestaetigen', unverifiedScreen);

// Redirect back from Google (`/konto/?return=…&code=…`): the SDK captures the parameters when its client is
// created; `?code` stays in the URL until supabase-js has exchanged it, the screen #/anmeldung cleans up.
if (isConfigured() && isOAuthReturn()) {
  const ret = safeReturnUrl(new URLSearchParams(location.search).get('return'), location.origin);
  history.replaceState(null, '', location.pathname + location.search + href('anmeldung', { return: ret }));
}

// An account whose email is not confirmed yet only sees the confirmation screen (except the link target itself).
const OPEN_FOR_UNVERIFIED = new Set(['verify-email', 'anmeldung', 'bestaetigen']);
setGuard((id) => (currentUser()?.status === 'unverified' && !OPEN_FOR_UNVERIFIED.has(id) ? 'bestaetigen' : null));

initTheme(document.querySelector<HTMLButtonElement>('#theme-toggle')!);
// Header: "Zurück zu …" only for a validated return URL (text via textContent, href already checked).
const back = document.querySelector<HTMLAnchorElement>('#return-link')!;
onRoute((params) => {
  const ret = returnTarget(params);
  back.hidden = !ret;
  if (ret) {
    back.href = ret;
    back.textContent = `Zurück zu ${shortUrl(ret)}`;
  } else {
    back.removeAttribute('href');
    back.textContent = '';
  }
});
startRouter(document.querySelector<HTMLElement>('#app')!);

let blocked = false;
onAuthChange((u) => {
  const now = u?.status === 'unverified';
  if (now === blocked) return;
  blocked = now;
  refreshRoute();
});
