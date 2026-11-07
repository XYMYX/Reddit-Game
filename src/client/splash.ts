import { requestExpandedMode } from '@devvit/web/client';

document.getElementById('start-button')?.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});
