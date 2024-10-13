import { updatePageState } from '../storage.js';

const fetchDocumentListApi = async (updatedAfter = null, location = null) => {
  const fullData = [];
  let nextPageCursor = null;
  const { authToken } = await chrome.storage.local.get('authToken');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const queryParams = new URLSearchParams();
    if (nextPageCursor) {
      queryParams.append('pageCursor', nextPageCursor);
    }
    if (updatedAfter) {
      queryParams.append('updatedAfter', updatedAfter);
    }
    if (location) {
      queryParams.append('location', location);
    }
    console.log(`Making export api request with params ${queryParams.toString()}`);

    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`https://readwise.io/api/v3/list/?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Token ${authToken}`,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    const responseJson = await response.json();
    fullData.push(...responseJson.results);
    nextPageCursor = responseJson.nextPageCursor;
    if (!nextPageCursor) {
      break;
    }
  }
  return fullData;
};

async function syncState() {
  function mapProperties(page, status) {
    return {
      id: page.id,
      title: page.title,
      status,
      location: page.location,
    };
  }

  const doneDocuments = await fetchDocumentListApi(null, 'archive');
  const newDocuments = await fetchDocumentListApi(null, 'new');
  const laterDocuments = await fetchDocumentListApi(null, 'later');

  for (const doc of doneDocuments) {
    // eslint-disable-next-line no-await-in-loop
    await updatePageState(doc.url, mapProperties(doc, 'done'));
  }
  for (const doc of [...newDocuments, ...laterDocuments]) {
    // eslint-disable-next-line no-await-in-loop
    await updatePageState(doc.url, mapProperties(doc, 'todo'));
  }
}

document.querySelector('#loginForm button').addEventListener('click', async () => {
  const token = document.querySelector('#loginForm input').value;
  await chrome.storage.local.set({ authToken: token });

  await syncState();
  document.querySelector('#loginForm #submitStatus').textContent = 'Synced!';
});
