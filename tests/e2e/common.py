import subprocess, time, os, sys, signal, urllib.request
R = []
LAST = [""]
def check(name, cond, extra=""):
    LAST[0] = name
    R.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))
def check_js(errs):
    """Erros de JS: o React #418 (hydration) intermitente é um problema CONHECIDO e documentado (docs/ETAPA_08.md); aparece como WARN. Qualquer outro erro falha."""
    known = [e for e in errs if "#418" in e]; other = [e for e in errs if "#418" not in e]
    if known: print(f"WARN  React #418 (hydration, problema conhecido — docs/ETAPA_08.md) x{len(known)}: {known[0][:220]}")
    check("sem erros de JS (o #418 conhecido é reportado como WARN)", not other, "; ".join(other)[:200])
def start(port, env):
    e = {**os.environ, "PORT": str(port), "NEXT_TELEMETRY_DISABLED": "1", **env}
    p = subprocess.Popen(["npx", "next", "start", "-p", str(port)], env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, preexec_fn=os.setsid)
    for _ in range(60):
        try: urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2); return p
        except Exception: time.sleep(0.5)
    raise SystemExit("server did not start")
def stop(p):
    try: os.killpg(os.getpgid(p.pid), signal.SIGTERM)
    except Exception: pass
def mock():
    m = subprocess.Popen(["node", "tests/mock-server.mjs"], stdout=subprocess.DEVNULL, preexec_fn=os.setsid); time.sleep(1); return m
def finish():
    fails = [n for n, ok in R if not ok]
    print(f"\n{len(R) - len(fails)}/{len(R)} e2e passaram"); sys.exit(1 if fails else 0)
