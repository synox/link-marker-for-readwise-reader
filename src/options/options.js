import { isAuthenticated, setAuthToken } from '../storage.js';

const PLACEHOLDER = '******************************************';

async function syncReadwiseData() {
  const response = await chrome.runtime.sendMessage({ type: 'sync-data' });
  const message = response === 'done' ? 'Synced!' : 'Oops, something went wrong!';
  document.querySelector('#loginForm #submitStatus').textContent = message;
}

document.querySelector('#loginForm button').addEventListener('click', async () => {
  const token = document.querySelector('#loginForm input').value;
  if (token === PLACEHOLDER || !token.trim()) {
    document.querySelector('#loginForm #submitStatus').textContent = 'Token missing!';
    return;
  }
  await setAuthToken(token);
  await syncReadwiseData();
});

async function initLoginForm() {
  if (await isAuthenticated()) {
    document.querySelector('#loginForm input').value = PLACEHOLDER;
  }
}

// noinspection JSIgnoredPromiseFromCall
initLoginForm();

document.querySelector('#reloadData').addEventListener('click', async () => {
  await syncReadwiseData();
});
