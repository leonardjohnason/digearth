const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_RETRIES = 2

function base() {
  return getApp().globalData.apiBase.replace(/\/$/, '')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function wxRequest(url, method, data, timeout) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      timeout,
      header: { 'content-type': 'application/json' },
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data)
        else reject(new Error((res.data && res.data.error) || `HTTP ${res.statusCode}`))
      },
      fail: reject
    })
  })
}

async function request(path, method = 'GET', data = {}, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS
  const retries = options.retries == null ? DEFAULT_RETRIES : options.retries
  const url = `${base()}${path}`
  let lastError

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await wxRequest(url, method, data, timeout)
    } catch (err) {
      lastError = err
      if (attempt === retries) break
      await sleep(350 * Math.pow(2, attempt))
    }
  }
  throw lastError || new Error('Request failed')
}

module.exports = { request, DEFAULT_TIMEOUT_MS, DEFAULT_RETRIES }
