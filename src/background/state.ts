/**
 * 자동 매매 상태 관리
 */

export type TradingState = 'idle' | 'running' | 'paused' | 'error';

export interface TradingSession {
  state: TradingState;
  activeTabId: number | null;
  startTime: number | null;
  tradesCount: number;
  wins: number;
  losses: number;
}

export class TradingStateManager {
  private session: TradingSession = {
    state: 'idle',
    activeTabId: null,
    startTime: null,
    tradesCount: 0,
    wins: 0,
    losses: 0,
  };

  getState(): TradingState {
    return this.session.state;
  }

  getSession(): TradingSession {
    return { ...this.session };
  }

  start(tabId: number): boolean {
    if (this.session.state !== 'idle' && this.session.state !== 'paused') {
      return false;
    }

    this.session = {
      ...this.session,
      state: 'running',
      activeTabId: tabId,
      startTime: this.session.startTime ?? Date.now(),
    };

    console.log('[State] Trading started', this.session);
    return true;
  }

  pause(): boolean {
    if (this.session.state !== 'running') {
      return false;
    }

    this.session.state = 'paused';
    console.log('[State] Trading paused');
    return true;
  }

  stop(): void {
    this.session = {
      state: 'idle',
      activeTabId: null,
      startTime: null,
      tradesCount: 0,
      wins: 0,
      losses: 0,
    };
    console.log('[State] Trading stopped');
  }

  recordTrade(win: boolean): void {
    this.session.tradesCount++;
    if (win) {
      this.session.wins++;
    } else {
      this.session.losses++;
    }
  }

  onTabReady(tabId: number): void {
    if (this.session.activeTabId === tabId && this.session.state === 'paused') {
      // 탭이 준비되면 자동 재개 가능
      console.log('[State] Tab ready, can resume trading');
    }
  }

  onTabClosed(tabId: number): void {
    if (this.session.activeTabId === tabId) {
      this.session.state = 'error';
      this.session.activeTabId = null;
      console.log('[State] Active tab closed, trading stopped');
    }
  }
}
