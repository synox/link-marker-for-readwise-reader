document.querySelector('#loginForm button').addEventListener('click', async () => {
  const token = document.querySelector('#loginForm input').value;
  await chrome.storage.local.set({ authToken: token });

  await chrome.runtime.sendMessage({ type: 'sync-data' });

  document.querySelector('#loginForm #submitStatus').textContent = 'Synced!';
});
