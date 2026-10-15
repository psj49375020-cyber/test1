#!/usr/bin/env python3
"""앱 해외 접속 트래픽 분석.

지원 입력:
  - nginx/Apache combined 로그, AWS ALB 로그 (공백 구분, 따옴표 포함)
  - CSV (헤더 필수; ip/country/timestamp/path/status 컬럼명은 별칭 자동 인식)
  - JSON Lines (CSV와 같은 키 별칭)

국가 판별 우선순위:
  1. 레코드에 국가 컬럼이 있으면 그 값 사용 (GA/Firebase/CloudFront 내보내기 등)
  2. --mmdb 로 MaxMind GeoLite2-Country.mmdb 를 주면 IP로 조회 (pip install maxminddb)

사용 예:
  python3 overseas_traffic.py access.log --mmdb GeoLite2-Country.mmdb
  python3 overseas_traffic.py export.csv --domestic KR --json report.json
"""
import argparse
import csv
import gzip
import itertools
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ALIASES = {
    "ip": ["ip", "client_ip", "clientip", "remote_addr", "c-ip", "c_ip", "ip_address", "client"],
    "country": ["country", "country_code", "geo_country", "countryiso", "country_id", "국가"],
    "ts": ["timestamp", "time", "datetime", "date", "@timestamp", "event_time", "시간"],
    "path": ["path", "uri", "url", "request_uri", "cs-uri-stem", "cs_uri_stem", "endpoint", "page_path", "screen"],
    "status": ["status", "status_code", "sc-status", "sc_status", "elb_status_code", "response_code"],
}

COMBINED_RE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\] "(?P<req>[^"]*)" (?P<status>\d{3}) \S+'
)
ALB_RE = re.compile(
    r'^\S+ (?P<ts>\S+) \S+ (?P<ip>[^:\s]+):\d+ \S+ \S+ \S+ \S+ (?P<status>\d{3}) \S+ \S+ \S+ "(?P<req>[^"]*)"'
)


def open_any(path):
    if path == "-":
        return sys.stdin
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "r", encoding="utf-8", errors="replace", newline="")


def parse_ts(s):
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{10}(\.\d+)?", s):
        return datetime.fromtimestamp(float(s), tz=timezone.utc)
    if re.fullmatch(r"\d{13}", s):
        return datetime.fromtimestamp(int(s) / 1000, tz=timezone.utc)
    for fmt in ("%d/%b/%Y:%H:%M:%S %z",):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y%m%d%H%M%S"):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                dt = None
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def pick(row, kind):
    lowered = {k.strip().lower(): v for k, v in row.items() if k}
    for name in ALIASES[kind]:
        if name.lower() in lowered and lowered[name.lower()] not in (None, ""):
            return lowered[name.lower()]
    return None


def detect_format(path, first_line):
    if path.endswith((".csv", ".csv.gz")):
        return "csv"
    if path.endswith((".jsonl", ".ndjson", ".jsonl.gz")):
        return "jsonl"
    if first_line.lstrip().startswith("{"):
        return "jsonl"
    if COMBINED_RE.match(first_line) or ALB_RE.match(first_line):
        return "log"
    return "csv"


def iter_records(path, fmt):
    f = open_any(path)
    with f:
        if fmt == "auto":
            first = f.readline()
            fmt = detect_format(path, first)
            stream = itertools.chain([first], f)
        else:
            stream = f
        if fmt == "csv":
            for row in csv.DictReader(stream):
                yield {k: pick(row, k) for k in ALIASES}
        elif fmt == "jsonl":
            for line in stream:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                yield {k: pick(row, k) for k in ALIASES}
        else:
            for line in stream:
                m = COMBINED_RE.match(line) or ALB_RE.match(line)
                if not m:
                    continue
                parts = m.group("req").split(" ")
                p = parts[1] if len(parts) > 1 else None
                if p and "://" in p:  # ALB logs full URL
                    p = "/" + p.split("://", 1)[1].split("/", 1)[-1]
                yield {"ip": m.group("ip"), "country": None, "ts": m.group("ts"),
                       "path": p, "status": m.group("status")}


class Geo:
    def __init__(self, mmdb):
        self.reader = None
        if mmdb:
            try:
                import maxminddb
            except ImportError:
                sys.exit("--mmdb 사용에는 'pip install maxminddb' 가 필요합니다.")
            self.reader = maxminddb.open_database(mmdb)
        self.cache = {}

    def lookup(self, ip):
        if not self.reader or not ip:
            return None
        if ip in self.cache:
            return self.cache[ip]
        try:
            rec = self.reader.get(ip)
            cc = (rec or {}).get("country", {}).get("iso_code") or \
                 (rec or {}).get("registered_country", {}).get("iso_code")
        except ValueError:
            cc = None
        self.cache[ip] = cc
        return cc


def normalize_country(c):
    if c is None:
        return None
    c = str(c).strip()
    if not c:
        return None
    names = {"south korea": "KR", "korea": "KR", "republic of korea": "KR", "대한민국": "KR",
             "한국": "KR", "united states": "US", "japan": "JP", "china": "CN",
             "일본": "JP", "중국": "CN", "미국": "US"}
    return names.get(c.lower(), names.get(c, c.upper() if len(c) == 2 else c))


def pct(a, b):
    return f"{a / b * 100:5.1f}%" if b else "  n/a"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="로그/CSV/JSONL 파일 (.gz 가능, '-' 는 stdin)")
    ap.add_argument("--format", choices=["auto", "log", "csv", "jsonl"], default="auto")
    ap.add_argument("--mmdb", help="MaxMind GeoLite2-Country.mmdb 경로 (IP→국가)")
    ap.add_argument("--domestic", default="KR", help="국내로 간주할 국가 코드 (기본 KR)")
    ap.add_argument("--tz-offset", type=float, default=9, help="시간대별 집계 UTC 오프셋 (기본 +9, KST)")
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--spike-ratio", type=float, default=3.0,
                    help="시간당 해외 요청이 해외 평균의 N배 이상이면 급증으로 표시 (기본 3)")
    ap.add_argument("--json", help="결과를 JSON 파일로 저장")
    args = ap.parse_args()

    geo = Geo(args.mmdb)
    dom = args.domestic.upper()
    tz = timezone(timedelta(hours=args.tz_offset))

    total = unknown = bad_ts = 0
    by_country = Counter()
    seg = {"domestic": Counter(), "overseas": Counter()}
    seg_err = {"domestic": Counter(), "overseas": Counter()}
    paths = defaultdict(Counter)
    hours = Counter()          # overseas per hour bucket
    hours_all = Counter()
    ips_overseas = Counter()
    tmin = tmax = None

    for fp in args.files:
        for r in iter_records(fp, args.format):
            total += 1
            cc = normalize_country(r["country"]) or geo.lookup(r["ip"])
            if not cc:
                unknown += 1
                continue
            cc = normalize_country(cc)
            s = "domestic" if cc == dom else "overseas"
            by_country[cc] += 1
            seg[s]["n"] += 1
            st = str(r["status"] or "")
            if st[:1] in ("4", "5"):
                seg_err[s]["n"] += 1
            if r["path"]:
                paths[s][str(r["path"]).split("?")[0]] += 1
            dt = parse_ts(r["ts"])
            if dt:
                b = dt.astimezone(tz).replace(minute=0, second=0, microsecond=0)
                hours_all[b] += 1
                tmin = b if tmin is None or b < tmin else tmin
                tmax = b if tmax is None or b > tmax else tmax
                if s == "overseas":
                    hours[b] += 1
            else:
                bad_ts += 1
            if s == "overseas" and r["ip"]:
                ips_overseas[r["ip"]] += 1

    known = total - unknown
    ov, dm = seg["overseas"]["n"], seg["domestic"]["n"]
    if total == 0:
        sys.exit("읽은 레코드가 없습니다. --format 을 지정하거나 입력 파일을 확인하세요.")
    if known == 0:
        sys.exit("국가를 판별할 수 없습니다. country 컬럼이 있는 데이터를 쓰거나 --mmdb 를 지정하세요.")

    print(f"== 해외 접속 트래픽 요약 (국내 기준: {dom}) ==")
    print(f"전체 레코드 {total:,} / 국가 판별 {known:,} / 판별 불가 {unknown:,}"
          + (f" / 시각 파싱 실패 {bad_ts:,}" if bad_ts else ""))
    if tmin:
        print(f"기간: {tmin:%Y-%m-%d %H:%M} ~ {tmax:%Y-%m-%d %H:%M} (UTC{args.tz_offset:+g})")
    print(f"국내 {dm:,} ({pct(dm, known)})  |  해외 {ov:,} ({pct(ov, known)})")
    for s, label in (("domestic", "국내"), ("overseas", "해외")):
        n = seg[s]["n"]
        print(f"  {label} 오류율(4xx/5xx): {pct(seg_err[s]['n'], n)}")

    print(f"\n-- 국가별 상위 {args.top} (해외만) --")
    for cc, n in [(c, n) for c, n in by_country.most_common() if c != dom][: args.top]:
        print(f"  {cc:<6} {n:>10,}  {pct(n, ov)} of overseas  {pct(n, known)} of all")

    print(f"\n-- 해외 요청 상위 경로 {args.top} --")
    for p, n in paths["overseas"].most_common(args.top):
        print(f"  {n:>10,}  {p}")

    spikes = []
    if hours:
        avg = ov / max(len(hours), 1)
        print(f"\n-- 시간대별 해외 비중 (해외 시간당 평균 {avg:,.0f}건) --")
        by_hod = Counter()
        for b, n in hours.items():
            by_hod[b.hour] += n
        peak = max(by_hod.values())
        for h in range(24):
            n = by_hod.get(h, 0)
            print(f"  {h:02d}시 {n:>9,} {'#' * round(n / peak * 30)}")
        spikes = sorted(((b, n) for b, n in hours.items() if n >= avg * args.spike_ratio),
                        key=lambda x: -x[1])[:args.top]
        if spikes:
            print(f"\n-- 급증 구간 (해외 평균의 {args.spike_ratio:g}배 이상) --")
            for b, n in spikes:
                print(f"  {b:%Y-%m-%d %H시}  해외 {n:,}건 (해당 시간 전체 대비 {pct(n, hours_all[b])})")

    if ips_overseas:
        print(f"\n-- 해외 상위 IP {args.top} (비정상/봇 후보 확인용) --")
        for ip, n in ips_overseas.most_common(args.top):
            print(f"  {n:>10,}  {ip}  ({pct(n, ov)} of overseas)")

    if args.json:
        out = {
            "domestic_country": dom, "total": total, "known": known, "unknown": unknown,
            "domestic": dm, "overseas": ov,
            "overseas_ratio": ov / known,
            "error_rate": {s: (seg_err[s]["n"] / seg[s]["n"] if seg[s]["n"] else None) for s in seg},
            "countries": dict(by_country.most_common()),
            "overseas_top_paths": paths["overseas"].most_common(args.top),
            "overseas_top_ips": ips_overseas.most_common(args.top),
            "overseas_spikes": [(b.isoformat(), n) for b, n in spikes],
        }
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, indent=2)
        print(f"\nJSON 저장: {args.json}")


if __name__ == "__main__":
    main()
