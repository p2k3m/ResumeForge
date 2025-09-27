const DB_NAME = 'resumeforge-offline'
const STORE_NAME = 'upload-queue'
const SYNC_TAG = 'resumeForgeUpload'
const TARGET_ENDPOINT = '/api/process-cv'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      await replayQueuedRequests()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'POST') return

  const requestUrl = new URL(request.url)
  if (!requestUrl.pathname.endsWith(TARGET_ENDPOINT)) return

  event.respondWith(handleUploadRequest(event))
})

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return
  event.waitUntil(replayQueuedRequests())
})

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return
  if (event.data.type === 'RETRY_UPLOADS') {
    event.waitUntil(replayQueuedRequests())
  }
})

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAllQueued(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const results = []
    const cursorRequest = store.openCursor()

    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        results.push(cursor.value)
        cursor.continue()
      } else {
        resolve(results)
      }
    }

    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
}

async function deleteQueued(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function createId() {
  if (self.crypto && typeof self.crypto.randomUUID === 'function') {
    return self.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

async function serializeRequest(request) {
  const headers = {}
  request.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase()
    if (normalizedKey === 'content-length') return
    headers[normalizedKey] = value
  })

  const cloned = request.clone()
  const contentType = (request.headers.get('content-type') || '').toLowerCase()

  if (contentType.includes('multipart/form-data')) {
    const formData = await cloned.formData()
    const entries = []

    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        entries.push({ key, value, kind: 'string' })
      } else {
        const arrayBuffer = await value.arrayBuffer()
        entries.push({
          key,
          kind: 'file',
          name: value.name,
          type: value.type,
          lastModified: value.lastModified,
          data: arrayBuffer,
        })
      }
    }

    delete headers['content-type']

    return {
      id: createId(),
      url: request.url,
      method: request.method,
      headers,
      body: {
        type: 'form-data',
        entries,
      },
      timestamp: Date.now(),
    }
  }

  const blob = await cloned.blob()
  const arrayBuffer = await blob.arrayBuffer()

  return {
    id: createId(),
    url: request.url,
    method: request.method,
    headers,
    body: {
      type: 'blob',
      mimeType: blob.type,
      data: arrayBuffer,
    },
    timestamp: Date.now(),
  }
}

async function storeRequest(request) {
  const db = await openDatabase()
  const entry = await serializeRequest(request)

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const addRequest = store.add(entry)
    addRequest.onsuccess = () => resolve(entry)
    addRequest.onerror = () => reject(addRequest.error)
  })
}

async function buildBody(stored) {
  if (!stored || !stored.body) return undefined

  if (stored.body.type === 'form-data') {
    const formData = new FormData()
    for (const entry of stored.body.entries) {
      if (entry.kind === 'file') {
        const blob = new Blob([entry.data], { type: entry.type || 'application/octet-stream' })
        if (typeof File === 'function') {
          const file = new File([blob], entry.name || 'upload', {
            type: entry.type || 'application/octet-stream',
            lastModified: entry.lastModified || Date.now(),
          })
          formData.append(entry.key, file)
        } else {
          formData.append(entry.key, blob, entry.name || 'upload')
        }
      } else {
        formData.append(entry.key, entry.value)
      }
    }
    return formData
  }

  if (stored.body.type === 'blob') {
    return new Blob([stored.body.data], { type: stored.body.mimeType || 'application/octet-stream' })
  }

  return undefined
}

async function notifyClients(message) {
  const clientList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const client of clientList) {
    client.postMessage(message)
  }
}

async function handleUploadRequest(event) {
  try {
    const networkResponse = await fetch(event.request.clone())
    return networkResponse
  } catch (err) {
    try {
      const entry = await storeRequest(event.request)
      const registration = await self.registration.ready
      if ('sync' in registration) {
        await registration.sync.register(SYNC_TAG)
      }
      return new Response(
        JSON.stringify({
          queued: true,
          message: 'You are offline. The upload will resume automatically when connectivity is restored.',
          queuedAt: entry.timestamp,
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (queueErr) {
      return new Response(
        JSON.stringify({
          error: 'Unable to queue upload for retry.',
          detail: queueErr?.message || String(queueErr || 'Unknown error'),
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }
}

async function replayQueuedRequests() {
  try {
    const db = await openDatabase()
    const queued = await readAllQueued(db)
    if (!queued.length) return

    for (const item of queued) {
      try {
        const body = await buildBody(item)
        const headers = new Headers(item.headers || {})
        if (item.body?.type === 'form-data') {
          headers.delete('content-type')
        }

        const response = await fetch(item.url, {
          method: item.method,
          headers,
          body,
          credentials: 'same-origin',
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const cloned = response.clone()
        const contentType = response.headers.get('content-type') || ''
        let payload
        if (contentType.includes('application/json')) {
          payload = await cloned.json()
        } else {
          payload = { raw: await cloned.text() }
        }

        await deleteQueued(db, item.id)

        await notifyClients({
          type: 'OFFLINE_UPLOAD_COMPLETE',
          message: 'An offline upload has finished processing.',
          payload: normalizePayload(payload),
        })
      } catch (error) {
        await notifyClients({
          type: 'OFFLINE_UPLOAD_FAILED',
          message:
            error?.message || 'A queued upload could not be processed automatically. Please try submitting again.',
        })
      }
    }
  } catch (err) {
    await notifyClients({
      type: 'OFFLINE_UPLOAD_FAILED',
      message: err?.message || 'Unable to process queued uploads.',
    })
  }
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { raw: payload }
  }

  const match = payload.table || payload.addedSkills || payload.missingSkills
    ? {
        table: payload.table || [],
        addedSkills: payload.addedSkills || [],
        missingSkills: payload.missingSkills || [],
        originalScore: payload.originalScore || 0,
        enhancedScore: payload.enhancedScore || 0,
        originalTitle: payload.originalTitle || '',
        modifiedTitle: payload.modifiedTitle || '',
      }
    : null

  return {
    urls: Array.isArray(payload.urls) ? payload.urls : [],
    match,
    message: typeof payload.message === 'string' ? payload.message : '',
  }
}
