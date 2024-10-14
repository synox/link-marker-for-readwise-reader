// eslint-disable-next-line no-unused-vars,import/no-extraneous-dependencies
import { expect, test } from '@jest/globals';
import {
  getPageState,
  listPages,
  listPagesForDomain,
} from './storage.js';

test('getPageState exists', async () => {
  chrome.storage.local.get.mockReturnValueOnce({
    'https://www.google.com/': {
      status: 'done',
      title: 'Google',
      modified: '2021-03-21T12:00:00.000Z',
      created: '2021-02-21T12:00:00.000Z',
    },
  });

  const state = await getPageState('https://www.google.com/');

  expect(state.url).toBe('https://www.google.com/');
  expect(state.properties.status).toBe('done');
  expect(state.properties.title).toBe('Google');
  expect(state.properties.modified).toBe('2021-03-21T12:00:00.000Z');
  expect(state.properties.created).toBe('2021-02-21T12:00:00.000Z');
});

test('getPageState invalid url', async () => {
  const state = await getPageState('file://a/b/c');

  expect(state).toBeNull();
});

test('getPageState not found', async () => {
  const state = await getPageState('https://www.facebook.com/');

  expect(state).toBeNull();
});

test('listPagesForDomain', async () => {
  chrome.storage.local.get.mockReturnValueOnce({
    'https://www.google.com/': {
      status: 'todo',
      title: 'Google',
    },
    'https://www.google.com/search': {
      status: 'done',
      title: 'Google Search',
    },
    'https://www.facebook.com/maps': {
      status: 'todo',
      title: 'Facebook Maps',
    },
  });

  const entries = await listPagesForDomain('https://www.google.com/');

  expect(entries).toHaveLength(2);
  expect(entries[0].url).toBe('https://www.google.com/');
  expect(entries[0].properties.status).toBe('todo');
  expect(entries[1].url).toBe('https://www.google.com/search');
  expect(entries[1].properties.status).toBe('done');
});

test('listPages', async () => {
  chrome.storage.local.get.mockReturnValueOnce({
    'https://www.google.com/home': {
      status: 'todo',
      title: 'Google',
    },
    'https://www.google.com/search': {
      status: 'done',
      title: 'Google Search',
    },
    'https://www.facebook.com/maps': {
      status: 'todo',
      title: 'Facebook Maps',
    },
  });

  const pages = await listPages();

  expect(Object.keys(pages)).toHaveLength(3);
  expect(pages[0].url).toBe('https://www.google.com/home');
  expect(pages[1].url).toBe('https://www.google.com/search');
  expect(pages[2].url).toBe('https://www.facebook.com/maps');
});
