import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './style.css';
import { returnTarget, shortUrl } from './dom.ts';
import { onRoute, registerScreen, startRouter } from './router.ts';
import { kontoScreen } from './screens/konto.ts';
import { loginScreen } from './screens/login.ts';
import { resetRequestScreen, resetScreen } from './screens/reset.ts';
import { verifyScreen } from './screens/verify.ts';
import { initTheme } from './theme.ts';

registerScreen('konto', kontoScreen);
registerScreen('login', loginScreen);
registerScreen('reset', resetScreen);
registerScreen('reset-request', resetRequestScreen);
registerScreen('verify-email', verifyScreen);

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
