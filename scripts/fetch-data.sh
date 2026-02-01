#!/bin/bash
# Binance Historical Data Fetcher
# 대량의 과거 데이터를 수집하여 JSON으로 저장

DATA_DIR="$(dirname "$0")/../data"
mkdir -p "$DATA_DIR"

BINANCE_API="https://api.binance.com/api/v3/klines"

# 함수: 데이터 가져오기
fetch_data() {
    local symbol=$1
    local interval=$2
    local limit=$3
    local end_time=$4
    
    local url="${BINANCE_API}?symbol=${symbol}&interval=${interval}&limit=${limit}"
    if [ -n "$end_time" ]; then
        url="${url}&endTime=${end_time}"
    fi
    
    curl -s "$url"
}

# 함수: 여러 페이지 데이터 수집
fetch_all_pages() {
    local symbol=$1
    local interval=$2
    local pages=$3
    local output_file="${DATA_DIR}/${symbol}_${interval}.json"
    
    echo "[Fetcher] $symbol $interval - $pages 페이지 수집 중..."
    
    local all_data="["
    local end_time=""
    local first=true
    
    for ((i=1; i<=pages; i++)); do
        local data=$(fetch_data "$symbol" "$interval" 1000 "$end_time")
        
        if [ "$data" == "[]" ] || [ -z "$data" ]; then
            echo "  Page $i: 데이터 없음"
            break
        fi
        
        # 첫 캔들의 타임스탬프를 다음 요청의 endTime으로 사용
        local first_ts=$(echo "$data" | jq -r '.[0][0]')
        end_time=$((first_ts - 1))
        
        # JSON 배열 합치기
        if [ "$first" = true ]; then
            all_data+=$(echo "$data" | jq -c '.[]' | paste -sd,)
            first=false
        else
            all_data+=","$(echo "$data" | jq -c '.[]' | paste -sd,)
        fi
        
        local count=$(echo "$data" | jq 'length')
        echo "  Page $i: $count 캔들 수집"
        
        sleep 0.5  # Rate limit 방지
    done
    
    all_data+="]"
    
    # 파일 저장
    echo "$all_data" | jq -c '
        sort_by(.[0]) | 
        unique_by(.[0]) | 
        {
            symbol: "'"$symbol"'",
            interval: "'"$interval"'",
            fetchedAt: (now | todate),
            count: length,
            candles: [.[] | {
                timestamp: .[0],
                open: (.[1] | tonumber),
                high: (.[2] | tonumber),
                low: (.[3] | tonumber),
                close: (.[4] | tonumber),
                volume: (.[5] | tonumber)
            }]
        }
    ' > "$output_file"
    
    local total=$(jq '.count' "$output_file")
    echo "[Fetcher] 저장: $output_file ($total 캔들)"
}

echo "========================================"
echo "Binance Data Fetcher"
echo "========================================"

# BTC 데이터 (5m, 약 10일치 = 2880 캔들)
fetch_all_pages "BTCUSDT" "5m" 3

# ETH 데이터
fetch_all_pages "ETHUSDT" "5m" 3

# BNB 데이터
fetch_all_pages "BNBUSDT" "5m" 2

# SOL 데이터
fetch_all_pages "SOLUSDT" "5m" 2

# 1분 데이터 (더 짧은 기간)
fetch_all_pages "BTCUSDT" "1m" 2
fetch_all_pages "ETHUSDT" "1m" 2

echo ""
echo "[Fetcher] 완료!"
ls -la "$DATA_DIR"/*.json 2>/dev/null || echo "No JSON files found"
