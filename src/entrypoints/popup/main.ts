import './style.css';
import { initPopup } from './popup';

initPopup(document).catch((error: unknown) => {
  console.warn('[manga-reader]', 'popup', error);
});
