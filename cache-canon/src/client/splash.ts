import { navigateTo, context, requestExpandedMode } from '@devvit/web/client';

const docsLink = document.getElementById('docs-link') as HTMLDivElement;
const playtestLink = document.getElementById('playtest-link') as HTMLDivElement;
const startButton = document.getElementById('start-button') as HTMLButtonElement;

startButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

docsLink.addEventListener('click', () => {
  navigateTo('https://developers.reddit.com/docs');
});

playtestLink.addEventListener('click', () => {
  navigateTo('https://www.reddit.com/r/Devvit');
});

const welcomeMessage = document.getElementById('welcome-message') as HTMLHeadingElement;

function init() {
  if (welcomeMessage) {
    welcomeMessage.textContent = `Hey ${context.username ?? 'Hunter'} 👋`;
  }
}

init();
