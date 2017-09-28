/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Shaka Player demo, service worker.
 */


/**
 * The name of the cache for this version of the application.
 * This should be updated when old, unneded application resources could be
 * cleaned up by a newer version of the application.
 *
 * @const {string}
 */
var CACHE_NAME = 'shaka-player-v2';


/**
 * The prefix of all cache versions that belong to this application.
 * This is used to identify old caches to clean up.  Must match CACHE_NAME
 * above.
 *
 * @const {string}
 */
var CACHE_NAME_PREFIX = 'shaka-player';


console.assert(CACHE_NAME.indexOf(CACHE_NAME_PREFIX) == 0,
               'Cache name does not match prefix!');


/**
 * The maximum number of seconds to wait for an updated version of something
 * if we have a cached version we could use instead.
 *
 * @const {number}
 */
var NETWORK_TIMEOUT = 2;


/**
 * An array of resources that MUST be cached to make the application
 * available offline.
 *
 * @const {!Array.<string>}
 */
var CRITICAL_RESOURCES = [
  '.',  // this resolves to the page
  'index.html',  // another way to access the page
  'app_manifest.json',

  'demo.css',
  'https://fonts.googleapis.com/css?family=Roboto',
  'https://fonts.googleapis.com/css?family=Roboto+Condensed',

  'common/controls.css',
  'https://fonts.googleapis.com/icon?family=Material+Icons',

  'load.js',
  '../dist/shaka-player.compiled.js',
  '../dist/demo.compiled.js'
];


/**
 * An array of resources that SHOULD be cached, but which are not critical.
 *
 * @const {!Array.<string>}
 */
var OPTIONAL_RESOURCES = [
  'favicon.ico',
  '//shaka-player-demo.appspot.com/assets/poster.jpg',
  '//shaka-player-demo.appspot.com/assets/audioOnly.gif'
];


/**
 * An array of resources that SHOULD be cached, but which must use the no-cors
 * flag because of CORS restrictions.  They will be cached as "opaque" resources
 * whose contents cannot be read by JavaScript.
 *
 * @const {!Array.<string>}
 */
var NO_CORS_RESOURCES = [
  '//www.gstatic.com/cv/js/sender/v1/cast_sender.js'
];


/**
 * This event fires when the service worker is installed.
 * @param {!InstallEvent} event
 */
function onInstall(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
    // Optional resources: failure on these will NOT fail the Promise chain.
    cache.addAll(OPTIONAL_RESOURCES).catch(function() {});

    // No-cors resources: failure on these will NOT fail the Promise chain.
    // For some reason, this doesn't work with addAll, so we use fetchAndCache.
    NO_CORS_RESOURCES.forEach(function(url) {
      fetchAndCache(cache, new Request(url, { mode: 'no-cors' }));
    });

    // Critical resources: failure on these will fail the Promise chain.
    return cache.addAll(CRITICAL_RESOURCES);
  }));
}


/**
 * This event fires when the service worker is activated.
 * This can be after installation installation or upgrade.
 *
 * @param {!ExtendableEvent} event
 */
function onActivate(event) {
  // Delete old caches to save space.
  event.waitUntil(caches.keys().then(function(cacheNames) {
    return Promise.all(cacheNames.filter(function(cacheName) {
      // Return true on all the caches we want to clean up.
      // Note that caches are shared across the origin, so only remove
      // caches we are sure we created.
      if (cacheName.indexOf(CACHE_NAME_PREFIX) == 0 &&
          cacheName != CACHE_NAME) {
        return true;
      }
    }).map(function(cacheName) {
      return caches.delete(cacheName);
    }));
  }));
}


/**
 * This event fires when any resource is fetched.
 * This is where we can use the cache to respond offline.
 *
 * @param {!FetchEvent} event
 */
function onFetch(event) {
  event.respondWith(caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(event.request).then(function(cachedResponse) {
      if (cachedResponse ||
          event.request.referrer.startsWith('https://fonts.googleapis.com')) {
        // This is one of our cached resources, or a Google web font which
        // should be implicitly cached when first seen.

        if (!navigator.onLine) {
          // We are offline, and we know it.  Just return the cached response,
          // to avoid a bunch of pointless errors in the JS console that will
          // confuse us developers.
          return cachedResponse;
        }

        // Try to fetch a live version and update the cache, but limit how long
        // we will wait for the updated version.
        return timeout(NETWORK_TIMEOUT, fetchAndCache(cache, event.request))
            .catch(function() {
              // We tried to fetch a live version, but it either failed or took
              // too long.  If it took too long, the fetch and cache operation
              // will continue in the background.  In both cases, we should go
              // ahead with a cached version.
              return cachedResponse;
            });
      } else {
        // This is not one of our cached resources.  Fetch a live version and
        // do not cache it.
        return fetch(event.request);
      }
    });
  }));
}


/**
 * Fetch the resource from the network, then store this new version in the
 * cache.
 *
 * @param {!Cache} cache
 * @param {!Request} request
 * @return {!Promise.<!Response>}
 */
function fetchAndCache(cache, request) {
  return fetch(request).then(function(response) {
    cache.put(request, response.clone());
    return response;
  });
}


/**
 * Returns a Promise which is resolved only if |asyncProcess| is resolved, and
 * only if it is resolved in less than |seconds| seconds.
 *
 * If the returned Promise is resolved, it returns the same value as
 * |asyncProcess|.
 *
 * If |asyncProcess| fails, the returned Promise is rejected.
 * If |asyncProcess| takes too long, the returned Promise is rejected, but
 * |asyncProcess| is still allowed to complete.
 *
 * @param {number} seconds
 * @param {!Promise.<T>} asyncProcess
 * @return {!Promise.<T>}
 * @template T
 */
function timeout(seconds, asyncProcess) {
  return Promise.race([
    asyncProcess,
    new Promise(function(_, reject) {
      setTimeout(reject, seconds * 1000);
    })
  ]);
}


self.addEventListener('install', /** @type {function(!Event)} */(onInstall));
self.addEventListener('activate', /** @type {function(!Event)} */(onActivate));
self.addEventListener('fetch', /** @type {function(!Event)} */(onFetch));