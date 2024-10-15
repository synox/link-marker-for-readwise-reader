import { normalizeUrl } from './global.js';

/** @type {Map<string, PageInfo>} */
let pagesCache = null; // intentionally null to detect when not initialized properly

export async function initStorage() {
  const result = await chrome.storage.local.get('pages');
  if (result?.pages) {
    pagesCache = new Map(JSON.parse(result.pages));
  } else {
    pagesCache = new Map();
  }
}

export async function replacePagesState(pages) {
  if (!pagesCache) await initStorage();

  pagesCache = new Map(pages.map((page) => [page.url, page]));
  console.log('replacing pages state with', pagesCache.size, 'entries');
  await chrome.storage.local.set({ pages: JSON.stringify(Array.from(pagesCache.entries())) });
}

export async function updatePagesState(pages) {
  if (!pagesCache) await initStorage();

  for (const page of pages) {
    pagesCache.set(page.url, page);
  }

  console.log('updating pages state with', pages, 'entries');
  await chrome.storage.local.set({ pages: JSON.stringify(Array.from(pagesCache.entries())) });
}

export async function isAuthenticated() {
  const { authToken } = await chrome.storage.local.get('authToken');
  return authToken?.length > 2;
}

export async function setAuthToken(authToken) {
  await chrome.storage.local.set({ authToken });
}

export async function getLastUpdateTime() {
  const { lastUpdateTime } = await chrome.storage.local.get('lastUpdateTime');
  return lastUpdateTime;
}

export async function setLastUpdateTime(lastUpdateTime) {
  await chrome.storage.local.set({ lastUpdateTime });
}

/**
 * get state of a page
 * @param url
 * @return {Promise<PageInfo|null>}
 */
export async function getPageState(url) {
  if (!pagesCache) await initStorage();

  if (!url || !url.startsWith('http')) {
    return null;
  }
  url = normalizeUrl(url);

  return pagesCache.get(url);
}

/**
 @returns {Promise<Array.<PageInfo>>}
 */
export async function listPages() {
  if (!pagesCache) await initStorage();

  return Array.from(pagesCache.keys())
    .filter((key) => key.startsWith('http'))
    .map((url) => pagesCache.get(url))
    .sort();
}

/**
 * @param origin {string} e.g. new URL(url).origin
 * @return {Promise<PageInfo[]>}
 */
export async function listPagesForDomain(origin) {
  if (!pagesCache) await initStorage();

  if (!origin) {
    return [];
  }
  return Array.from(pagesCache.keys())
    .filter((key) => key.startsWith(origin))
    .map((url) => pagesCache.get(url));
}
