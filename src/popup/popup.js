import {
  isAuthenticated, listPagesForDomain,
} from '../storage.js';
import {
  getOrigin, isValidUrl, normalizeUrl, STATUS_NONE,
} from '../global.js';
import { filterPages, sortWithCurrentFirst } from '../filter-utils.js';

class Popup {
  constructor() {
    this.tab = null;
    this.pageInfo = null;

    // unsaved updates, use this to show the user the changes immediately
    this.optimisticUpdates = {};
  }

  async start() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    // eslint-disable-next-line prefer-destructuring
    this.tab = tabs[0];
    this.pageInfo = await chrome.runtime.sendMessage({ type: 'get-status', url: this.tab.url });

    this.initEventHandlers();

    await this.updatePopup();
  }

  showOnlyCurrentDomain() {
    const currentDomainFilter = document.getElementById('current-domain-filter');
    return isValidUrl(this.tab.url) && currentDomainFilter.checked;
  }

  initEventHandlers() {
    document.getElementById('settings-button').addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('current-domain-filter').addEventListener('change', () => this.replacePagesInPopup());
    document.querySelector('[role="search"]').addEventListener('change', () => this.replacePagesInPopup());
  }

  async updatePopup() {
    if (!(await isAuthenticated())) {
      document.getElementById('warnings').textContent = 'Please open the settings and sign in to use this extension.';
      document.getElementById('warnings').style.display = 'block';
      document.body.classList.remove('body-hidden');
      return;
    }
    const currentDomainFilter = document.getElementById('current-domain-filter');
    if (isValidUrl(this.tab.url)) {
      currentDomainFilter.closest('label').querySelector('span').textContent = new URL(this.tab.url).hostname;
    } else {
      document.getElementById('filters').classList.add('hidden');
    }

    await this.replacePagesInPopup();

    // popup content is hidden until rendered for the first time
    document.body.classList.remove('body-hidden');
  }

  async replacePagesInPopup() {
    const filteredPages = await this.loadPagesToDisplay();

    let unreadCount = 0;
    let finishedCount = 0;

    document.querySelector('main section.unread .pages').innerHTML = '';
    document.querySelector('main section.finished .pages').innerHTML = '';

    for (const page of filteredPages) {
      const pageElement = this.createPageElement(page);
      if (page.properties.status === 'todo') {
        document.querySelector('main section.unread .pages').append(pageElement);
        unreadCount += 1;
      } else if (page.properties.status === 'done') {
        document.querySelector('main section.finished .pages').append(pageElement);
        finishedCount += 1;
      } else {
        // ignore "none" status
      }
    }

    document.querySelector('main section.unread h2 .counter').textContent = `(${unreadCount})`;
    document.querySelector('main section.finished h2 .counter').textContent = `(${finishedCount})`;
  }

  async loadPagesToDisplay() {
    let pages;
    if (this.showOnlyCurrentDomain()) {
      pages = await listPagesForDomain(getOrigin(this.tab.url));
    } else {
      pages = await chrome.runtime.sendMessage({ type: 'list-all-pages' });
    }

    console.log('pages', pages);
    // use unsaved data from optimistic updates
    // eslint-disable-next-line guard-for-in
    for (const url in this.optimisticUpdates) {
      const page = pages.find((p) => p.url === url);
      if (page) {
        page.properties = { ...page.properties, ...this.optimisticUpdates[url].properties };
      } else {
        pages.push(this.optimisticUpdates[url]);
      }
    }

    const filteredPages = filterPages(pages, { search: document.querySelector('filter-search')?.value });
    sortWithCurrentFirst(filteredPages, normalizeUrl(this.tab.url));
    return filteredPages;
  }

  /**
   * @param page {PageInfo}
   * @return {HTMLElement}
   */
  createPageElement(page) {
    const entry = document.createElement('page-entry');
    entry.setAttribute('title', page.properties.title || new URL(page.url).pathname);
    entry.setAttribute('url', page.url);
    entry.setAttribute('date', page.properties.modified);
    entry.setAttribute('status', page.properties.status);
    entry.setAttribute('is-current', page.url === this.tab.url);
    entry.setAttribute('readwiseReaderUrl', page.properties.readwiseReaderUrl);

    entry.addEventListener('remove', () => {
      this.removePageState(page.url);
    });

    return entry;
  }

  removePageState(url) {
    // not waiting for response to not block user interaction
    chrome.runtime.sendMessage({
      type: 'remove-page', url, tabUrl: this.tab.url, tabId: this.tab.id,
    });

    // do optimistic local data update, assuming the change will be successful
    if (this.pageInfo && this.pageInfo.url === url) {
      this.pageInfo = null;
    }
    this.optimisticUpdates[url] = { url, properties: { status: STATUS_NONE } };

    // noinspection ES6MissingAwait
    this.updatePopup();

    setTimeout(window.close, 800);
  }
}

if (window.chrome?.tabs) {
  // running as the extension
  new Popup().start().catch(console.error);
} else {
  // running as a standalone page for testing
  document.body.classList.remove('body-hidden');
}
