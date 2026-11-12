const databaseName = 'aarogya-offline-v1';
const databaseVersion = 1;
const queueStore = 'syncQueue';
const keyStore = 'cryptoKeys';
const articleStore = 'education';

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Offline storage is not available in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(queueStore)) database.createObjectStore(queueStore, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(keyStore)) database.createObjectStore(keyStore, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(articleStore)) database.createObjectStore(articleStore, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open private offline storage.'));
  });
}

function transaction(database, stores, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    const result = action(tx);
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error || new Error('Offline storage operation failed.'));
    tx.onabort = () => reject(tx.error || new Error('Offline storage operation was cancelled.'));
  });
}

async function localEncryptionKey(database) {
  const cached = await new Promise((resolve, reject) => {
    const tx = database.transaction(keyStore, 'readonly');
    const request = tx.objectStore(keyStore).get('device-key');
    request.onsuccess = () => resolve(request.result?.key);
    request.onerror = () => reject(request.error || new Error('Could not read the offline encryption key.'));
  });
  if (cached) return cached;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await transaction(database, [keyStore], 'readwrite', tx => tx.objectStore(keyStore).put({ id: 'device-key', key }));
  return key;
}

async function encryptPayload(database, value) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure offline encryption is not available in this browser.');
  const key = await localEncryptionKey(database);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: Array.from(iv), ciphertext };
}

async function decryptPayload(database, entry) {
  const key = await localEncryptionKey(database);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(entry.iv) }, key, entry.ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function announceQueueChanged() {
  window.dispatchEvent(new CustomEvent('aarogya:offline-queue-changed'));
}

export async function saveOfflineScreeningDraft({ userId, patientId, symptoms, capturedAt, consentGranted }) {
  if (!userId || !patientId || consentGranted !== true) throw new Error('Sign in and record patient consent before saving an offline screening draft.');
  const database = await openDatabase();
  const id = crypto.randomUUID();
  const sealed = await encryptPayload(database, { patientId, symptoms, capturedAt, consentGranted: true });
  await transaction(database, [queueStore], 'readwrite', tx => tx.objectStore(queueStore).put({
    id, userId, type: 'screening-metadata', status: 'pending', createdAt: new Date().toISOString(),
    ...sealed, message: ''
  }));
  announceQueueChanged();
  return id;
}

export async function saveOfflinePatientDraft({ userId, patient, consentGranted }) {
  if (!userId || consentGranted !== true) throw new Error('Sign in and record patient consent before saving an offline registration draft.');
  const database = await openDatabase();
  const id = crypto.randomUUID();
  const sealed = await encryptPayload(database, { patient: { ...patient, consentGiven: true } });
  await transaction(database, [queueStore], 'readwrite', tx => tx.objectStore(queueStore).put({
    id, userId, type: 'patient-registration', status: 'pending', createdAt: new Date().toISOString(),
    ...sealed, message: ''
  }));
  announceQueueChanged();
  return id;
}

export async function listOfflineQueue(userId) {
  const database = await openDatabase();
  const entries = await new Promise((resolve, reject) => {
    const tx = database.transaction(queueStore, 'readonly');
    const request = tx.objectStore(queueStore).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read offline sync queue.'));
  });
  return entries.filter(entry => entry.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function updateQueueEntry(database, entry) {
  await transaction(database, [queueStore], 'readwrite', tx => tx.objectStore(queueStore).put(entry));
  announceQueueChanged();
}

export async function discardOfflineEntry(id, userId) {
  const database = await openDatabase();
  const entry = await new Promise((resolve, reject) => {
    const request = database.transaction(queueStore, 'readonly').objectStore(queueStore).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not read the offline draft.'));
  });
  if (entry?.userId === userId) await transaction(database, [queueStore], 'readwrite', tx => tx.objectStore(queueStore).delete(id));
  announceQueueChanged();
}

export async function retryOfflineEntry(id, userId) {
  const database = await openDatabase();
  const entry = await new Promise((resolve, reject) => {
    const request = database.transaction(queueStore, 'readonly').objectStore(queueStore).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not read the offline draft.'));
  });
  if (!entry || entry.userId !== userId) throw new Error('Offline draft not found for this account.');
  await updateQueueEntry(database, { ...entry, status: 'pending', message: '' });
}

export async function syncOfflineQueue(userId, submitters) {
  if (!navigator.onLine) return;
  const database = await openDatabase();
  const entries = await listOfflineQueue(userId);
  for (const entry of entries.filter(item => ['pending', 'failed'].includes(item.status))) {
    const started = { ...entry, status: 'syncing', message: '' };
    await updateQueueEntry(database, started);
    try {
      const payload = await decryptPayload(database, started);
      if (started.type === 'screening-metadata') await submitters.screeningMetadata({ ...payload, clientRequestId: started.id });
      else if (started.type === 'patient-registration') await submitters.patientRegistration({ ...payload.patient, clientRequestId: started.id });
      else throw new Error('This offline draft type is not supported.');
      await updateQueueEntry(database, { ...started, status: 'synced', message: '' });
    } catch (error) {
      const conflict = error.statusCode === 409;
      await updateQueueEntry(database, { ...started, status: conflict ? 'conflict' : 'failed', message: error.message || 'Synchronization failed.' });
      if (error.statusCode === 401) break;
    }
  }
}

export async function cachePublishedEducation(articles, language) {
  if (!Array.isArray(articles)) return;
  const database = await openDatabase();
  await transaction(database, [articleStore], 'readwrite', tx => {
    const store = tx.objectStore(articleStore);
    for (const article of articles) {
      if (article.status !== 'published' || article.reviewStatus !== 'reviewed' || !article.content?.[language]) continue;
      store.put({ id: `${language}:${article.slug}`, language, article: { ...article, imageUrl: '' }, cachedAt: new Date().toISOString() });
    }
  });
}

export async function readCachedEducation({ language, query = '', category = '' }) {
  const database = await openDatabase();
  const entries = await new Promise((resolve, reject) => {
    const request = database.transaction(articleStore, 'readonly').objectStore(articleStore).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read offline education content.'));
  });
  const term = query.trim().toLocaleLowerCase(language);
  return entries.filter(entry => entry.language === language)
    .map(entry => entry.article)
    .filter(article => article.status === 'published' && article.reviewStatus === 'reviewed')
    .filter(article => !category || article.category === category)
    .filter(article => !term || `${article.content?.[language]?.title || ''} ${article.content?.[language]?.summary || ''} ${(article.keywords || []).join(' ')}`.toLocaleLowerCase(language).includes(term));
}

export async function clearOfflineDeviceData() {
  const database = await openDatabase();
  await transaction(database, [queueStore, articleStore, keyStore], 'readwrite', tx => {
    tx.objectStore(queueStore).clear();
    tx.objectStore(articleStore).clear();
    tx.objectStore(keyStore).clear();
  });
  announceQueueChanged();
}
