import './style.css';
import { registerScreen, startRouter } from './router.ts';
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
startRouter(document.querySelector<HTMLElement>('#app')!);
