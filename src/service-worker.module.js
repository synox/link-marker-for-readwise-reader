import {
  getPageState,
  listPagesForDomain,
  replacePagesState,
  listPages,
  getLastUpdateTime,
  updatePagesState,
  setLastUpdateTime,
} from './storage.js';
import { getOrigin, normalizeUrl, PageInfo } from './global.js';

const MINUTES = 1000 * 60;

function main() {
  chrome.action.setPopup({ popup: 'src/popup/popup.html' });

  /** on tab activation: update popup and icon, and inject scripts */
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
      if (changeInfo.status === 'loading') {
        const url = changeInfo.url || tab.url;
        const pageInfo = await getPageState(normalizeUrl(url));
        await updateIcon(tabId, pageInfo?.properties.status || 'none');
        // not waiting for the injection to complete:
        injectContentScripts(tab).catch(console.error);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  });

  /** react to messages from the popup, settings and content scripts */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Status changed in popup

    if (message.type === 'sync-data') {
      // noinspection JSIgnoredPromiseFromCall
      syncState(sendResponse, message.fullReload);
    }

    if (message.type === 'get-status') {
      // noinspection JSIgnoredPromiseFromCall
      handleGetStatusMessage(message, sendResponse);
    }
    if (message.type === 'batch-get-status') {
      // noinspection JSIgnoredPromiseFromCall
      handleGetStatusMessageAsBatch(message, sendResponse);
    }
    if (message.type === 'list-all-pages') {
      // noinspection JSIgnoredPromiseFromCall
      handleListAllPagesMessage(message, sendResponse);
    }
    if (message.type === 'list-pages-for-domain') {
      // noinspection JSIgnoredPromiseFromCall
      handleListPagesForDomainMessage(message, sendResponse);
    }

    // Return true to indicate that the response should be sent asynchronously
    return true;
  });

  setInterval(syncState, 15 * MINUTES);
}

// API docs: https://readwise.io/reader_api
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
  return fullData.filter((doc) => !doc.parent_id);
};

async function syncState(sendResponse, fullReload = false) {
  function mapProperties(page, status) {
    return {
      id: page.id,
      title: page.title,
      status,
      location: page.location,
      readwiseReaderUrl: page.url,
      created_at: page.created_at,
      updated_at: page.updated_at,
    };
  }
  try {
    let updatedAfter = await getLastUpdateTime();
    if (fullReload) {
      updatedAfter = null;
    }
    const updatedDocs = Array.from(await fetchDocumentListApi(updatedAfter))
      // ignore non-web links
      .filter((doc) => doc.source_url && !doc.source_url.startsWith('https://readwise.io/reader'))
      .filter((doc) => ['new', 'later', 'archive'].includes(doc.location))
      .map((doc) => {
        let status;
        if (doc.location === 'new' || doc.location === 'later') status = 'todo';
        if (doc.location === 'archive') status = 'done';

        return new PageInfo(normalizeUrl(doc.source_url), mapProperties(doc, status));
      })
      .filter((doc) => doc !== null);

    if (updatedDocs.length === 0) {
      console.log('no new docs');
      return sendResponse('done');
    }
    if (!updatedAfter || fullReload) {
      // first load or full reload
      await replacePagesState(updatedDocs);
    } else {
      await updatePagesState(updatedDocs);
    }

    // get newest updated time
    const newestUpdatedTime = updatedDocs.reduce((acc, doc) => {
      if (new Date(doc.properties.updated_at) > new Date(acc)) {
        return doc.properties.updated_at;
      }
      return acc;
    }, new Date(0).toISOString());
    await setLastUpdateTime(newestUpdatedTime);

    await updateLinksInAllTabs();

    console.log('sync done with', updatedDocs.length, 'docs');
    return sendResponse('done');
  } catch (e) {
    console.error('cannot load readwise data', e);
    return sendResponse('error');
  }
}

/**
 * @param url {string}
 * @return {Promise<boolean>}
 */
async function hasAnyEntriesForDomain(url) {
  const pageStates = await listPagesForDomain(getOrigin(url));
  return pageStates.length > 0;
}

function isAllowedDomain(url) {
  return url && url.startsWith('http');
}

async function injectContentScripts(tab) {
  // Only inject script if there are already any entries for the current domain
  if (await isAllowedDomain(tab.url) && await hasAnyEntriesForDomain(tab.url)) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/inject/mark-as-done-content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['/src/inject/mark-as-done-content.css'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'update-content' });
  }
}

async function handleGetStatusMessage(message, sendResponse) {
  const pageInfo = await getPageState(normalizeUrl(message.url));
  sendResponse(pageInfo?.properties?.status || 'none');
}

async function handleListAllPagesMessage(message, sendResponse) {
  const pages = await listPages();
  sendResponse(pages);
}

async function handleListPagesForDomainMessage(message, sendResponse) {
  const pages = await listPagesForDomain(message.origin);
  sendResponse(pages);
}

async function handleGetStatusMessageAsBatch(message, sendResponse) {
  const urls = message.urls.map(normalizeUrl);
  const resultMap = {};
  await Promise.all(urls.map(async (url) => {
    const pageInfo = await getPageState(normalizeUrl(url));
    if (pageInfo) {
      resultMap[url] = pageInfo.properties.status;
    }
  }));
  sendResponse(resultMap);
}

/**
 * @param tabId {string}
 * @param status {LinkStatus}
 * @return {Promise<void>}
 */
async function updateIcon(tabId, status) {
  await chrome.action.setIcon({ tabId, path: `/images/icon-${status}.png` });

  // the following is an experiment, and it does not look good. Maybe we come back to this later.
  // const imageData = await createDynamicIcon(status);
  // await chrome.action.setIcon({ imageData });
}

/**
 * react to changes in the storage: update all tabs
 */
async function updateLinksInAllTabs() {
  console.debug('storage changed, updating all tabs');
  const tabs = await chrome.tabs.query({});
  // we don't wait until the other tabs are updated.
  // noinspection ES6MissingAwait
  tabs
    .filter((tab) => isAllowedDomain(tab.url))
    .forEach(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'update-content' });
      } catch (e) {
        if (e.message !== 'Could not establish connection. Receiving end does not exist.') {
          console.warn('error updating tab', tab.url, e);
        }
      }
    });
}

main();
