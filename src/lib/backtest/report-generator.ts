// ============================================================
// Backtest Report Generator
// ============================================================
// Generates HTML reports with charts and statistics
// ============================================================

import { BacktestTrade } from './types';

export interface ReportData {
  title: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  strategy: string;
  stats: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netProfit: number;
    profitFactor: number;
    maxDrawdown: number;
    expectancy: number;
  };
  trades: BacktestTrade[];
  equityCurve: { timestamp: number; balance: number }[];
}

export function generateHTMLReport(data: ReportData): string {
  const equityChartData = data.equityCurve.map((e) => ({
    x: new Date(e.timestamp).toLocaleDateString(),
    y: e.balance,
  }));

  const tradesByHour = new Array(24).fill(0);
  const winsByHour = new Array(24).fill(0);
  data.trades.forEach((t) => {
    const hour = new Date(t.entryTime).getHours();
    tradesByHour[hour]++;
    if (t.result === 'WIN') winsByHour[hour]++;
  });
  const winRateByHour = tradesByHour.map((t, i) => (t > 0 ? (winsByHour[i] / t) * 100 : 0));

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title} - Backtest Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #4ade80; margin-bottom: 10px; }
    .subtitle { color: #888; margin-bottom: 30px; }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #1a1a2e;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: bold; color: #fff; }
    .stat-label { font-size: 12px; color: #888; margin-top: 5px; }
    .stat-positive { color: #4ade80; }
    .stat-negative { color: #f87171; }
    
    .chart-container {
      background: #1a1a2e;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .chart-title { font-size: 16px; margin-bottom: 15px; color: #fff; }
    
    .trades-table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1a2e;
      border-radius: 12px;
      overflow: hidden;
    }
    .trades-table th, .trades-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #2a2a3e;
    }
    .trades-table th { background: #0f0f1a; color: #888; font-weight: 500; }
    .trades-table tr:hover { background: #2a2a3e; }
    .win { color: #4ade80; }
    .loss { color: #f87171; }
    .call { color: #4ade80; }
    .put { color: #f87171; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 ${data.title}</h1>
    <p class="subtitle">${data.symbol} | ${data.timeframe} | ${data.strategy}</p>
    <p class="subtitle">${data.startDate} ~ ${data.endDate}</p>
    
    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${data.stats.totalTrades}</div>
        <div class="stat-label">Total Trades</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${data.stats.winRate >= 53 ? 'stat-positive' : 'stat-negative'}">
          ${data.stats.winRate.toFixed(1)}%
        </div>
        <div class="stat-label">Win Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${data.stats.netProfit >= 0 ? 'stat-positive' : 'stat-negative'}">
          $${data.stats.netProfit.toFixed(0)}
        </div>
        <div class="stat-label">Net Profit</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.stats.profitFactor.toFixed(2)}</div>
        <div class="stat-label">Profit Factor</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-negative">${data.stats.maxDrawdown.toFixed(1)}%</div>
        <div class="stat-label">Max Drawdown</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${data.stats.expectancy >= 0 ? 'stat-positive' : 'stat-negative'}">
          $${data.stats.expectancy.toFixed(2)}
        </div>
        <div class="stat-label">Expectancy</div>
      </div>
    </div>
    
    <!-- Equity Curve -->
    <div class="chart-container">
      <div class="chart-title">📈 Equity Curve</div>
      <canvas id="equityChart"></canvas>
    </div>
    
    <!-- Win Rate by Hour -->
    <div class="chart-container">
      <div class="chart-title">⏰ Win Rate by Hour</div>
      <canvas id="hourChart"></canvas>
    </div>
    
    <!-- Recent Trades -->
    <div class="chart-container">
      <div class="chart-title">📋 Recent Trades (Last 50)</div>
      <table class="trades-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Direction</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Result</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          ${data.trades
            .slice(-50)
            .reverse()
            .map(
              (t) => `
            <tr>
              <td>${new Date(t.entryTime).toLocaleString()}</td>
              <td class="${t.direction.toLowerCase()}">${t.direction}</td>
              <td>$${t.entryPrice.toFixed(2)}</td>
              <td>$${t.exitPrice.toFixed(2)}</td>
              <td class="${t.result.toLowerCase()}">${t.result}</td>
              <td class="${t.profit >= 0 ? 'win' : 'loss'}">$${t.profit.toFixed(2)}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>
  
  <script>
    // Equity Chart
    new Chart(document.getElementById('equityChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(equityChartData.map((e) => e.x))},
        datasets: [{
          label: 'Balance',
          data: ${JSON.stringify(equityChartData.map((e) => e.y))},
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74, 222, 128, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#2a2a3e' } },
          y: { grid: { color: '#2a2a3e' } }
        }
      }
    });
    
    // Hour Chart
    new Chart(document.getElementById('hourChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(Array.from({ length: 24 }, (_, i) => `${i}:00`))},
        datasets: [{
          label: 'Win Rate %',
          data: ${JSON.stringify(winRateByHour)},
          backgroundColor: ${JSON.stringify(winRateByHour.map((r) => (r >= 53 ? 'rgba(74, 222, 128, 0.6)' : 'rgba(248, 113, 113, 0.6)')))}
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#2a2a3e' } },
          y: { grid: { color: '#2a2a3e' }, max: 100 }
        }
      }
    });
  </script>
</body>
</html>
`;
}

export function generateConsoleReport(data: ReportData): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔════════════════════════════════════════════════════════╗');
  lines.push(`║  ${data.title.padEnd(52)}  ║`);
  lines.push('╚════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`📊 ${data.symbol} | ${data.timeframe} | ${data.strategy}`);
  lines.push(`📅 ${data.startDate} ~ ${data.endDate}`);
  lines.push('');
  lines.push('─'.repeat(58));
  lines.push('');

  const winStatus = data.stats.winRate >= 53 ? '✅' : '❌';
  const profitStatus = data.stats.netProfit >= 0 ? '📈' : '📉';

  lines.push(`  Total Trades:   ${data.stats.totalTrades}`);
  lines.push(`  Win Rate:       ${data.stats.winRate.toFixed(1)}% ${winStatus}`);
  lines.push(`  Net Profit:     $${data.stats.netProfit.toFixed(0)} ${profitStatus}`);
  lines.push(`  Profit Factor:  ${data.stats.profitFactor.toFixed(2)}`);
  lines.push(`  Max Drawdown:   ${data.stats.maxDrawdown.toFixed(1)}%`);
  lines.push(`  Expectancy:     $${data.stats.expectancy.toFixed(2)}`);
  lines.push('');
  lines.push('─'.repeat(58));
  lines.push('');

  // Direction breakdown
  const calls = data.trades.filter((t) => t.direction === 'CALL');
  const puts = data.trades.filter((t) => t.direction === 'PUT');
  const callWins = calls.filter((t) => t.result === 'WIN').length;
  const putWins = puts.filter((t) => t.result === 'WIN').length;

  lines.push('  Direction Breakdown:');
  lines.push(
    `    CALL: ${calls.length} trades (${calls.length > 0 ? ((callWins / calls.length) * 100).toFixed(1) : 0}% win)`,
  );
  lines.push(
    `    PUT:  ${puts.length} trades (${puts.length > 0 ? ((putWins / puts.length) * 100).toFixed(1) : 0}% win)`,
  );
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// Export to JSON
// ============================================================

export function exportToJSON(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}
