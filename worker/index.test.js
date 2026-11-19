import { describe, it, expect } from 'vitest'
import worker, { androidDownload, RELEASE_PAGE } from './index'

const github = (body, ok = true) => async () => ({ ok, json: async () => body })
const apk = (name) => ({
  name,
  browser_download_url: `https://github.com/wyserian/archespace-mobile/releases/download/v1.7.0/${name}`,
})

describe('android download', () => {
  it('sends the browser to the latest arm64 APK, whatever its name', async () => {
    const res = await androidDownload(github({
      assets: [apk('archespace-v1.7.0-abc1234.apk'), apk('archespace-v1.7.0-abc1234-arm64.apk'), apk('archespace-v1.7.0-abc1234-arm64.apk.sha256')],
    }))
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(
      'https://github.com/wyserian/archespace-mobile/releases/download/v1.7.0/archespace-v1.7.0-abc1234-arm64.apk',
    )
  })

  it('falls back to the release page when GitHub fails or has no arm64 APK', async () => {
    for (const fetchImpl of [
      github({}, false),
      github({ assets: [apk('archespace-v1.7.0-abc1234.apk')] }),
      async () => { throw new TypeError('network down') },
    ]) {
      expect((await androidDownload(fetchImpl)).headers.get('Location')).toBe(RELEASE_PAGE)
    }
  })

  it('never redirects anywhere but GitHub downloads', async () => {
    const res = await androidDownload(github({
      assets: [{ name: 'x-arm64.apk', browser_download_url: 'https://evil.example/x-arm64.apk' }],
    }))
    expect(res.headers.get('Location')).toBe(RELEASE_PAGE)
  })

  it('serves everything else from the site files', async () => {
    const env = { ASSETS: { fetch: async () => new Response('page') } }
    const res = await worker.fetch(new Request('https://archespace.app/app'), env)
    expect(await res.text()).toBe('page')
  })
})
