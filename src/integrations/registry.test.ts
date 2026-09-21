import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getIntegration, listIntegrations } from './registry.ts'

describe('listIntegrations', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('lists Dialpad, GoHighLevel and Housecall Pro, all not_configured', () => {
    const integrations = listIntegrations()
    const ids = integrations.map((i) => i.id).sort()
    expect(ids).toEqual(['dialpad', 'ghl', 'hcp'])
    for (const integration of integrations) {
      expect(integration.status()).toBe('not_configured')
    }
  })

  it('never calls fetch to determine status', () => {
    for (const integration of listIntegrations()) {
      integration.status()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getIntegration returns the matching adapter or null', () => {
    expect(getIntegration('dialpad')?.name).toBe('Dialpad')
    expect(getIntegration('ghl')?.name).toBe('GoHighLevel')
    expect(getIntegration('hcp')?.name).toBe('Housecall Pro')
  })
})
