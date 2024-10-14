import { normalizeUrl, PageInfo } from './global.js';

export async function isAuthenticated() {
  const { authToken } = await chrome.storage.local.get('authToken');
  return authToken?.length > 2;
}
/**
 * get state of a page
 * @param url
 * @return {Promise<PageInfo>}
 */
export async function getPageState(url) {
  if (!url || !url.startsWith('http')) {
    return null;
  }
  url = normalizeUrl(url);

  const valueWrapper = await chrome.storage.local.get(url);
  if (!valueWrapper || Object.keys(valueWrapper).length === 0) {
    return null;
  }
  return readPageStateFromStorageValue(url, valueWrapper[url]);
}

export async function clearAllPages() {
  const { authToken } = await chrome.storage.local.get('authToken');
  chrome.storage.local.clear();
  await chrome.storage.local.set({ authToken });
}

/**
 * Update the status of a page
 * @param url {string}
 * @param properties {object}
 * @return {Promise<*>}
 */
export async function updatePageState(url, properties) {
  url = normalizeUrl(url);
  const state = await getPageState(url);
  const existingProperties = state?.properties || {};
  const mergedProperties = { ...existingProperties, ...properties };
  if (!mergedProperties.created) {
    mergedProperties.created = new Date().toISOString();
  }
  mergedProperties.modified = new Date().toISOString();
  await chrome.storage.local.set({ [url]: mergedProperties });
  return mergedProperties;
}

/**
 * Update the status of a page
 * @param url {string}
 * @param properties {object}
 * @return {Promise<*>}
 */
export async function internalReplacePageState(url, properties) {
  await chrome.storage.local.set({ [url]: properties });
}

export async function removePageState(url) {
  url = normalizeUrl(url);
  await chrome.storage.local.remove(url);
}

function readPageStateFromStorageValue(url, value) {
  if (!value) {
    return null;
  }
  return new PageInfo(url, value);
}

/**
 @returns {Promise<Map<string,Array.<PageInfo>>>}
 */
export async function listPages() {
  const allItems = await chrome.storage.local.get(null);
  return Object.entries(allItems)
    .filter(([key]) => key.startsWith('http'))
    .map(([url, value]) => new PageInfo(url, value))
    .sort();
}

/**
 * @param origin {string} e.g. new URL(url).origin
 * @return {Promise<PageInfo[]>}
 */
export async function listPagesForDomain(origin) {
  if (!origin) {
    return [];
  }
  const allItems = await chrome.storage.local.get(null);
  return Object.entries(allItems)
    .filter(([key]) => key.startsWith(origin))
    .map(([key, value]) => readPageStateFromStorageValue(key, value));
}
