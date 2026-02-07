import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Increase max listeners to prevent warnings during parallel tests
if (typeof process !== 'undefined') {
  process.setMaxListeners(15)
}

// Mock Chrome APIs
const chromeMock = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(null),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: vi.fn().mockResolvedValue(null),
  },
  sidePanel: {
    setPanelBehavior: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
}

// @ts-ignore
globalThis.chrome = chromeMock

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
