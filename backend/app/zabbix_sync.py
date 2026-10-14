#!/usr/bin/env python3
"""
Sinkronkan daftar Netwatch MikroTik -> host ICMP di Zabbix.

Zabbix menyimpan riwayat problem (mulai/pulih) tanpa tergantung backend dashboard,
jadi perangkat yang dipantau Zabbix punya riwayat down/up yang lengkap.

Aturan:
- Hanya router yang disebut di --router (default: "HO Duta Garden", satu LAN dengan
  Zabbix server). Site jauh TIDAK di-sync: Zabbix mem-ping lewat VPN, jadi VPN putus
  akan terbaca sebagai semua perangkat down.
- Entri ISP / IP publik (mis. 8.8.8.8, 1.1.1.1) dilewati. Itu harus tetap diukur
  Netwatch dari router lokal supaya yang terukur ISP site itu sendiri.
- Host yang IP-nya sudah ada di Zabbix tidak dibuat ulang; kalau namanya beda dari
  Netwatch, namanya disamakan (Netwatch = acuan). Tidak pernah menghapus host.

Pakai:
    python zabbix_sync.py                      # dry-run, cuma menampilkan rencana
    python zabbix_sync.py --apply              # benar-benar membuat host
    python zabbix_sync.py --router "HO Duta Garden" --router "Gudang Jatake"
"""

import argparse
import ipaddress
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
load_dotenv(Path(__file__).resolve().with_name(".env"))

from mikrotik import get_netwatch  # noqa: E402

ZABBIX_URL = os.getenv("ZABBIX_URL", "http://192.168.1.233/zabbix")
API_TOKEN = os.getenv("ZABBIX_API_TOKEN", "")
TEMPLATE_NAME = "ICMP Ping"
DEFAULT_ROUTERS = ["HO Duta Garden"]


def zbx(method, params=None):
    r = requests.post(
        f"{ZABBIX_URL}/api_jsonrpc.php",
        json={"jsonrpc": "2.0", "method": method, "params": params or {}, "id": 1},
        headers={"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json-rpc"},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"{method}: {data['error'].get('data') or data['error']}")
    return data["result"]


def is_private(ip):
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def group_name_for(name):
    return "Access Point" if "access point" in name.lower() or name.lower().startswith("accesss") else "Switch"


def ensure_group(name, apply, cache):
    if name in cache:
        return cache[name]
    found = zbx("hostgroup.get", {"filter": {"name": [name]}, "output": ["groupid"]})
    if found:
        cache[name] = found[0]["groupid"]
    elif apply:
        cache[name] = zbx("hostgroup.create", {"name": name})["groupids"][0]
    else:
        cache[name] = None  # akan dibuat saat --apply
    return cache[name]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--router", action="append", help="nama router (boleh berulang)")
    ap.add_argument("--apply", action="store_true", help="buat host di Zabbix (default: dry-run)")
    args = ap.parse_args()
    routers = set(args.router or DEFAULT_ROUTERS)

    tpl = zbx("template.get", {"filter": {"name": [TEMPLATE_NAME]}, "output": ["templateid"]})
    if not tpl:
        sys.exit(f"Template '{TEMPLATE_NAME}' tidak ditemukan di Zabbix")
    templateid = tpl[0]["templateid"]

    existing = zbx("host.get", {"output": ["hostid", "host", "name"], "selectInterfaces": ["ip"]})
    by_ip = {i["ip"]: h for h in existing for i in h["interfaces"] if i.get("ip")}
    names = {h["name"].lower() for h in existing} | {h["host"].lower() for h in existing}

    rows = [r for r in get_netwatch(timeout=6) if r.get("router_name") in routers]
    if not rows:
        sys.exit("Netwatch kosong / router tidak terbaca -- tidak ada yang dikerjakan")

    groups, plan, created, renames = {}, [], 0, []
    for r in rows:
        ip, name = r.get("host"), (r.get("name") or "").strip()
        if not ip or not name or r.get("error"):
            continue
        if not is_private(ip):
            plan.append(("LEWATI", name, ip, "IP publik / ISP -> tetap Netwatch"))
            continue
        if ip in by_ip:
            h = by_ip[ip]
            if h["name"] == name:
                plan.append(("ADA", name, ip, "sudah ada"))
            else:
                plan.append(("RENAME", name, ip, f"nama di Zabbix: '{h['name']}'"))
                renames.append((h, name))
            continue
        if name.lower() in names:
            plan.append(("BENTROK", name, ip, "nama sudah dipakai host lain dengan IP berbeda -- cek manual"))
            continue
        gname = group_name_for(name)
        plan.append(("BUAT", name, ip, f"grup {gname}"))
        if args.apply:
            gid = ensure_group(gname, True, groups)
            zbx("host.create", {
                "host": name, "name": name,
                "interfaces": [{"type": 1, "main": 1, "useip": 1, "ip": ip, "dns": "", "port": "10050"}],
                "groups": [{"groupid": gid}],
                "templates": [{"templateid": templateid}],
            })
            created += 1
            names.add(name.lower())

    # Netwatch jadi acuan nama. Zabbix menolak nama ganda, jadi host yang namanya
    # dilepas host lain harus diganti lebih dulu: urutkan supaya nama tujuan yang
    # masih dipakai host lain (yang juga akan diganti) diproses sesudahnya.
    renamed = 0
    if args.apply:
        pending = list(renames)
        for _ in range(len(pending) + 1):
            left = []
            for h, new in pending:
                if any(o["name"].lower() == new.lower() and o["hostid"] != h["hostid"] for o in existing):
                    left.append((h, new))
                    continue
                zbx("host.update", {"hostid": h["hostid"], "host": new, "name": new})
                h["name"] = new
                renamed += 1
            if not left or len(left) == len(pending):
                break
            pending = left
        for h, new in pending:
            if h["name"] != new:
                print(f"GAGAL rename '{h['name']}' -> '{new}': nama tujuan masih dipakai host lain")

    for act, name, ip, note in plan:
        print(f"{act:8} {ip:16} {name}  [{note}]")
    todo = sum(1 for p in plan if p[0] == "BUAT")
    print(f"\n{'DIBUAT' if args.apply else 'DRY-RUN: akan dibuat'}: {created if args.apply else todo} host, "
          f"{'DIGANTI NAMANYA' if args.apply else 'akan diganti namanya'}: {renamed if args.apply else len(renames)} "
          f"({len(plan)} entri Netwatch dari {sorted(routers)})")
    if not args.apply and (todo or renames):
        print("Jalankan lagi dengan --apply untuk membuatnya.")


if __name__ == "__main__":
    main()
