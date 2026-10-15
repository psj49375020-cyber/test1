# test1

## 앱 해외 접속 트래픽 분석

`overseas_traffic.py` — 접속 로그/내보낸 데이터에서 해외 접속 비율, 국가별·경로별·시간대별 분포, 급증 구간, 상위 IP를 집계합니다. 표준 라이브러리만 사용합니다.

```bash
# 국가 컬럼이 있는 CSV/JSONL (GA, Firebase, CloudFront 내보내기 등)
python3 overseas_traffic.py export.csv

# IP만 있는 nginx/ALB 로그 → GeoLite2로 국가 조회
pip install maxminddb
python3 overseas_traffic.py access.log.gz --mmdb GeoLite2-Country.mmdb --json report.json
```

주요 옵션: `--domestic KR`(국내 기준), `--tz-offset 9`(시간대 집계), `--spike-ratio 3`(급증 판정), `--top 10`.
