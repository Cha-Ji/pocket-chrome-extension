// ============================================================
// Platform Adapter Interfaces
// ============================================================
// 플랫폼 독립적인 자동매매를 위한 추상화 레이어.
// 새 플랫폼(PO Real, Quotex 등) 추가 시 이 인터페이스만 구현하면 된다.
// ============================================================

import type { Tick, Direction, AccountType } from '../types';

// ============================================================
// Candle (플랫폼 공통)
// ============================================================

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ============================================================
// Asset (플랫폼 공통)
// ============================================================

export interface Asset {
  /** 플랫폼 내부 ID (예: PO의 asset code) */
  id: string;
  /** 사람이 읽을 수 있는 이름 (예: "EUR/USD OTC") */
  name: string;
  /** OTC 여부 */
  isOTC: boolean;
  /** 현재 페이아웃 (0-100, null이면 미확인) */
  payout: number | null;
}

// ============================================================
// Trade Execution Result
// ============================================================

export interface TradeExecutionResult {
  success: boolean;
  /** 플랫폼이 부여한 거래 ID (있을 경우) */
  tradeId?: string;
  error?: string;
  /** 실제 체결된 방향 */
  direction?: Direction;
  /** 실제 체결 금액 */
  amount?: number;
  /** 체결 시각 */
  executedAt?: number;
}

// ============================================================
// Confidence Level
// ============================================================

export type Confidence = 'high' | 'medium' | 'low';

// ============================================================
// Unsubscribe Helper
// ============================================================

export type Unsubscribe = () => void;

// ============================================================
// Timeframe
// ============================================================

/** 캔들 주기 (초 단위) */
export type Timeframe = number;

// ============================================================
// IDataSource - 가격 데이터 수집 추상화
// ============================================================

export interface IDataSource {
  /** 틱 데이터 구독 */
  subscribeTicks(callback: (tick: Tick) => void): Unsubscribe;

  /** 캔들 데이터 구독 */
  subscribeCandles(
    timeframe: Timeframe,
    callback: (ticker: string, candle: Candle) => void,
  ): Unsubscribe;

  /** 현재 가격 조회 */
  getCurrentPrice(): { price: number; ticker: string } | null;

  /** 현재 활성 자산 이름 */
  getCurrentAsset(): Asset | null;

  /** 거래 가능한 자산 목록 (페이아웃 포함) */
  getAvailableAssets(): Asset[];

  /** 특정 자산의 현재 페이아웃 조회 */
  getPayout(assetName: string): number | null;

  /** 데이터 수집 시작 */
  start(): void;

  /** 데이터 수집 중지 */
  stop(): void;

  /** 수집 중 여부 */
  readonly isRunning: boolean;
}

// ============================================================
// IExecutor - 거래 실행 추상화
// ============================================================

export interface IExecutor {
  /** 거래 실행 (CALL/PUT) */
  execute(direction: Direction, amount: number): Promise<TradeExecutionResult>;

  /** 거래 금액 설정 */
  setAmount(amount: number): Promise<void>;

  /** 만기 시간 설정 (초 단위) */
  setExpiration(seconds: number): Promise<void>;

  /** 현재 잔액 조회 */
  getBalance(): Promise<number | null>;

  /** 자산 전환 */
  switchAsset(assetName: string): Promise<boolean>;

  /** 현재 거래 가능 상태인지 */
  canTrade(): Promise<boolean>;
}

// ============================================================
// ISafetyGuard - 안전 장치 추상화
// ============================================================

export interface ISafetyGuard {
  /** 현재 계정 타입 (데모/리얼) */
  getAccountType(): { type: AccountType; confidence: Confidence };

  /** 데모 모드 여부 (간편 체크) */
  isDemoMode(): boolean;

  /** 계정 타입 변경 감지 */
  onAccountTypeChange(callback: (type: AccountType) => void): Unsubscribe;

  /** 거래 허용 여부 판단 (데모 체크 + 추가 안전장치) */
  canExecuteTrade(amount: number): { allowed: boolean; reason?: string };
}

// ============================================================
// IPlatformAdapter - 플랫폼 어댑터 (위 3개를 조합)
// ============================================================

export interface IPlatformAdapter {
  /** 플랫폼 고유 ID (예: 'pocket-option-demo', 'pocket-option-real') */
  readonly platformId: string;

  /** 사람이 읽을 수 있는 이름 (예: 'Pocket Option (Demo)') */
  readonly platformName: string;

  /** 데이터 수집 */
  readonly dataSource: IDataSource;

  /** 거래 실행 */
  readonly executor: IExecutor;

  /** 안전 장치 */
  readonly safety: ISafetyGuard;

  /** 초기화 (DOM 준비 대기, 셀렉터 검증 등) */
  initialize(): Promise<void>;

  /** 정리 (옵저버 해제, 인터벌 정리 등) */
  dispose(): void;

  /** 플랫폼이 초기화 완료되었는지 */
  readonly isReady: boolean;
}

// ============================================================
// IPlatformDetector - 현재 페이지의 플랫폼 감지
// ============================================================

export interface IPlatformDetector {
  /** 이 감지기가 담당하는 플랫폼 ID */
  readonly platformId: string;

  /** URL + DOM으로 플랫폼 감지 (0=불일치, 1=확실) */
  detect(url: string, doc: Document): number;

  /** 감지 성공 시 어댑터 생성 */
  createAdapter(): IPlatformAdapter;
}
