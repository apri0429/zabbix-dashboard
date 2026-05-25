import os
import socket
from pathlib import Path

import routeros_api
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().with_name(".env"))


def _parse_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "y", "on")


def _parse_int(value, default):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def get_mikrotik_configs():
    routers = []
    index = 1

    while True:
        host = os.getenv(f"MIKROTIK_{index}_HOST")
        user = os.getenv(f"MIKROTIK_{index}_USER")
        password = os.getenv(f"MIKROTIK_{index}_PASS")
        port = os.getenv(f"MIKROTIK_{index}_PORT")
        name = os.getenv(f"MIKROTIK_{index}_NAME", f"MikroTik {index}")
        use_ssl = os.getenv(f"MIKROTIK_{index}_USE_SSL", "false")
        timeout = os.getenv(f"MIKROTIK_{index}_TIMEOUT", "10")

        if not host:
            break

        routers.append({
            "id": index,
            "name": name.strip(),
            "host": host.strip(),
            "user": (user or "").strip(),
            "password": (password or "").strip(),
            "port": _parse_int(port, 8728),
            "use_ssl": _parse_bool(use_ssl, False),
            "timeout": _parse_int(timeout, 10),
        })
        index += 1

    # fallback kalau masih pakai format env lama (single router)
    if not routers:
        single_host = os.getenv("MIKROTIK_HOST")
        single_user = os.getenv("MIKROTIK_USER")
        single_password = os.getenv("MIKROTIK_PASS")
        single_port = os.getenv("MIKROTIK_PORT", "8728")
        single_name = os.getenv("MIKROTIK_NAME", "MikroTik 1")
        single_use_ssl = os.getenv("MIKROTIK_USE_SSL", "false")
        single_timeout = os.getenv("MIKROTIK_TIMEOUT", "10")

        if single_host:
            routers.append({
                "id": 1,
                "name": single_name.strip(),
                "host": single_host.strip(),
                "user": (single_user or "").strip(),
                "password": (single_password or "").strip(),
                "port": _parse_int(single_port, 8728),
                "use_ssl": _parse_bool(single_use_ssl, False),
                "timeout": _parse_int(single_timeout, 10),
            })

    return routers


def get_router_list():
    routers = get_mikrotik_configs()
    return [
        {
            "router_id": router["id"],
            "router_name": router["name"],
            "router_host": router["host"],
            "router_port": router["port"],
            "router_use_ssl": router.get("use_ssl", False),
        }
        for router in routers
    ]


def get_router_by_id(router_id):
    routers = get_mikrotik_configs()
    for router in routers:
        if router["id"] == router_id:
            return router
    return None


def connect_mikrotik(router_config):
    if not router_config:
        raise ValueError("Konfigurasi router tidak ditemukan")

    host = (router_config.get("host") or "").strip()
    user = (router_config.get("user") or "").strip()
    password = (router_config.get("password") or "").strip()
    port = _parse_int(router_config.get("port", 8728), 8728)
    use_ssl = _parse_bool(router_config.get("use_ssl", False), False)
    timeout = _parse_int(router_config.get("timeout", 10), 10)

    if not host:
        raise ValueError("MIKROTIK host kosong")
    if not user:
        raise ValueError(f"Username MikroTik kosong untuk host {host}")

    try:
        with socket.create_connection((host, port), timeout=timeout):
            pass
    except ConnectionRefusedError:
        raise ConnectionError(
            f"Koneksi ke MikroTik ditolak ({host}:{port}). "
            f"Pastikan IP/port benar dan service API MikroTik aktif."
        )
    except socket.timeout:
        raise TimeoutError(
            f"Koneksi ke MikroTik timeout ({host}:{port}). "
            f"Pastikan router bisa dijangkau dari server."
        )
    except OSError as e:
        raise ConnectionError(
            f"Gagal terhubung ke MikroTik {host}:{port} - {e}"
        )

    try:
        connection = routeros_api.RouterOsApiPool(
            host,
            username=user,
            password=password,
            port=port,
            plaintext_login=not use_ssl,
            use_ssl=use_ssl,
            ssl_verify=False if use_ssl else True,
        )
        return connection
    except Exception as e:
        raise ConnectionError(
            f"Gagal login ke MikroTik {host}:{port} - {e}"
        )


def get_interfaces(router_id=None):
    routers = get_mikrotik_configs()
    results = []

    if router_id is not None:
        selected_router = get_router_by_id(router_id)
        if not selected_router:
            raise ValueError(f"Router dengan id {router_id} tidak ditemukan")
        routers = [selected_router]

    for router in routers:
        conn = None
        try:
            conn = connect_mikrotik(router)
            api = conn.get_api()
            data = api.get_resource("/interface").get()
            results.append({
                "router_id": router["id"],
                "router_name": router["name"],
                "router_host": router["host"],
                "router_port": router["port"],
                "router_use_ssl": router.get("use_ssl", False),
                "data": data,
            })
        finally:
            if conn:
                conn.disconnect()

    return results


def get_dhcp_active(router_id=None):
    routers = get_mikrotik_configs()
    results = []

    if router_id is not None:
        selected_router = get_router_by_id(router_id)
        if not selected_router:
            raise ValueError(f"Router dengan id {router_id} tidak ditemukan")
        routers = [selected_router]

    for router in routers:
        conn = None
        try:
            conn = connect_mikrotik(router)
            api = conn.get_api()
            leases = api.get_resource("/ip/dhcp-server/lease").get()

            for item in leases:
                status = (item.get("status") or "").lower()

                if status == "bound":
                    results.append({
                        "router_id": router["id"],
                        "router_name": router["name"],
                        "router_host": router["host"],
                        "router_port": router["port"],
                        "router_use_ssl": router.get("use_ssl", False),
                        ".id": item.get(".id"),
                        "address": item.get("address"),
                        "mac-address": item.get("mac-address"),
                        "host-name": item.get("host-name"),
                        "server": item.get("server"),
                        "status": item.get("status"),
                        "comment": item.get("comment"),
                        "last-seen": item.get("last-seen"),
                    })
        finally:
            if conn:
                conn.disconnect()

    return results


def get_queue_tree(router_id=None):
    routers = get_mikrotik_configs()
    results = []

    if router_id is not None:
        selected_router = get_router_by_id(router_id)
        if not selected_router:
            raise ValueError(f"Router dengan id {router_id} tidak ditemukan")
        routers = [selected_router]

    for router in routers:
        conn = None
        try:
            conn = connect_mikrotik(router)
            api = conn.get_api()
            queues = api.get_resource("/queue/tree").get()

            for item in queues:
                results.append({
                    "router_id": router["id"],
                    "router_name": router["name"],
                    "router_host": router["host"],
                    "router_port": router["port"],
                    "router_use_ssl": router.get("use_ssl", False),
                    ".id": item.get(".id"),
                    "name": item.get("name"),
                    "parent": item.get("parent"),
                    "packet-mark": item.get("packet-mark"),
                    "limit-at": item.get("limit-at"),
                    "max-limit": item.get("max-limit"),
                    "burst-limit": item.get("burst-limit"),
                    "burst-threshold": item.get("burst-threshold"),
                    "burst-time": item.get("burst-time"),
                    "priority": item.get("priority"),
                    "queue": item.get("queue"),
                    "bucket-size": item.get("bucket-size"),
                    "bytes": item.get("bytes"),
                    "packets": item.get("packets"),
                    "dropped": item.get("dropped"),
                    "queued-bytes": item.get("queued-bytes"),
                    "queued-packets": item.get("queued-packets"),
                    "rate": item.get("rate"),
                    "packet-rate": item.get("packet-rate"),
                    "borrows": item.get("borrows"),
                    "lends": item.get("lends"),
                    "pcq-queues": item.get("pcq-queues"),
                })
        finally:
            if conn:
                conn.disconnect()

    return results


def get_router_status():
    routers = get_mikrotik_configs()
    results = []

    for router in routers:
        conn = None
        try:
            conn = connect_mikrotik(router)
            api = conn.get_api()
            resources = api.get_resource("/system/resource").get()
            res = resources[0] if resources else {}

            total_mem = int(res.get("total-memory", 0))
            free_mem = int(res.get("free-memory", 0))
            used_mem = total_mem - free_mem

            results.append({
                "router_id": router["id"],
                "router_name": router["name"],
                "router_host": router["host"],
                "online": True,
                "cpu_load": int(res.get("cpu-load", 0)),
                "uptime": res.get("uptime", ""),
                "free_memory": free_mem,
                "total_memory": total_mem,
                "used_memory": used_mem,
                "board_name": res.get("board-name", ""),
                "version": res.get("version", ""),
                "architecture": res.get("architecture-name", ""),
            })
        except Exception as e:
            results.append({
                "router_id": router["id"],
                "router_name": router["name"],
                "router_host": router["host"],
                "online": False,
                "cpu_load": 0,
                "uptime": "",
                "free_memory": 0,
                "total_memory": 0,
                "used_memory": 0,
                "board_name": "",
                "version": "",
                "architecture": "",
                "error": str(e),
            })
        finally:
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass

    return results
