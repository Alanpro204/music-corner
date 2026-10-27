#!/usr/bin/env python3
"""Build and run the extension using the locally installed GNOME runtime."""
import ast
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DEV = ROOT / ".dev"
DIST = ROOT / "dist"
META = json.loads((SRC / "metadata.json").read_text())
UUID = META["uuid"]
BUNDLE = DIST / f"{UUID}.shell-extension.zip"
LOCAL_DEVKIT = ROOT / ".tools/mutter/usr/libexec/mutter-devkit"


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def devkit_path():
    for path in [LOCAL_DEVKIT, Path("/usr/libexec/mutter-devkit")]:
        if path.is_file():
            return str(path)
    return shutil.which("mutter-devkit")


def doctor():
    missing = []
    for tool in ["gjs", "gnome-shell", "gnome-extensions", "gnome-shell-test-tool",
                 "dbus-run-session", "gsettings", "gdbus", "node", "npm", "python3"]:
        path = shutil.which(tool)
        print(f"{'OK' if path else 'FALTA'}  {tool}: {path or 'no instalado'}")
        if not path:
            missing.append(tool)
    if shutil.which("gnome-shell"):
        version = subprocess.check_output(["gnome-shell", "--version"], text=True).strip()
        print(version)
        if version.split()[-1].split('.')[0] not in META['shell-version']:
            missing.append("GNOME Shell " + ", ".join(META["shell-version"]))
    print(f"Kit visual: {devkit_path() or 'ejecuta npm run setup:devkit (Ubuntu)'}")
    if not devkit_path():
        missing.append("mutter-devkit")
    if not (ROOT / "node_modules/.bin/eslint").is_file():
        missing.append("dependencias npm: ejecuta npm ci")
    if missing:
        raise RuntimeError("Faltan: " + ", ".join(missing))


def check():
    assert META["shell-version"] == ["45", "46", "47", "48", "49", "50"], "Revisar las versiones de GNOME soportadas"
    assert "@" in UUID and "/" not in UUID
    for directory in ["src", "tools", "tests"]:
        for source in (ROOT / directory).rglob("*.js"):
            run(["node", "--check", source])
        for source in (ROOT / directory).rglob("*.py"):
            ast.parse(source.read_text(), filename=str(source))
    run(["glib-compile-schemas", "--strict", "--dry-run", SRC / "schemas"])
    print("OK: metadatos, esquemas y sintaxis JavaScript/Python")


def build():
    DIST.mkdir(exist_ok=True)
    run(["gnome-extensions", "pack", "--force", "--out-dir", DIST,
         "--extra-source=COPYING", "--extra-source=ui", "--extra-source=mpris", "--extra-source=lyrics", "--extra-source=triggers", SRC])
    print(f"Paquete: {BUNDLE}")


def setup_devkit():
    if devkit_path():
        print(f"Kit disponible: {devkit_path()}")
        return
    downloads = ROOT / ".tools/downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    run(["apt-get", "-o", "Acquire::Retries=0", "download", "mutter-dev-bin"], cwd=downloads)
    package = max(downloads.glob("mutter-dev-bin_*.deb"), key=lambda p: p.stat().st_mtime)
    run(["dpkg-deb", "-x", package, ROOT / ".tools/mutter"])
    print(f"Kit extraído: {LOCAL_DEVKIT}")


def isolated_environment(directory, visual=False):
    env = os.environ.copy()
    for key, folder in [("XDG_DATA_HOME", "data"), ("XDG_CONFIG_HOME", "config"),
                        ("XDG_CACHE_HOME", "cache")]:
        path = directory / folder
        path.mkdir(parents=True, exist_ok=True)
        env[key] = str(path)
    env["GSETTINGS_BACKEND"] = "keyfile"
    env["SHELL_DEBUG"] = "backtrace-warnings"
    env["XDG_SESSION_TYPE"] = "wayland"
    env["XDG_CURRENT_DESKTOP"] = "GNOME"
    env["GNOME_SHELL_SESSION_MODE"] = "user"
    env.pop("G_RESOURCE_OVERLAYS", None)
    env.pop("GNOME_SHELL_EXTENSIONS_PATH", None)
    env["MC_DEV_SESSION"] = str(directory)
    if not visual:
        runtime = directory / "runtime"
        runtime.mkdir(mode=0o700)
        env["XDG_RUNTIME_DIR"] = str(runtime)
        env.pop("DISPLAY", None)
        env.pop("WAYLAND_DISPLAY", None)
        env["LIBGL_ALWAYS_SOFTWARE"] = "1"
    return env


def stop_process(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def dev_session():
    """Run inside the private D-Bus session; MDK displays the headless compositor."""
    if not os.environ.get("MC_DEV_SESSION"):
        raise RuntimeError("Ejecuta npm run dev")
    run(["gnome-extensions", "install", "--force", BUNDLE])
    run(["gsettings", "set", "org.gnome.shell", "enabled-extensions", f"['{UUID}']"])
    run(["gsettings", "set", "org.gnome.shell", "disable-user-extensions", "false"])
    run(["gsettings", "set", "org.gnome.desktop.session", "idle-delay", "0"])
    processes = []
    def terminate(_signal, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, terminate)
    try:
        shell = subprocess.Popen(["gnome-shell", "--devkit", "--wayland",
                                  "--wayland-display", f"music-companion-{os.getpid()}"])
        processes.append(shell)
        # Wait for this private compositor, without contacting the user's Shell.
        for _ in range(100):
            if shell.poll() is not None:
                raise RuntimeError("El compositor de pruebas no arrancó")
            result = subprocess.run(["gdbus", "call", "--session", "--dest",
                "org.gnome.Mutter.Devkit", "--object-path", "/org/gnome/Mutter/Devkit",
                "--method", "org.freedesktop.DBus.Peer.Ping"], capture_output=True)
            if result.returncode == 0:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("No se pudo conectar con Mutter Devkit")
        processes.append(subprocess.Popen(["gjs", "-m", str(ROOT / "tools/run-mock.js")]))
        # Mutter starts /usr/libexec/mutter-devkit itself when installed globally.
        # If it is absent, --devkit still exposes the API, and we launch our copy.
        visual = None
        if not Path('/usr/libexec/mutter-devkit').is_file():
            visual = subprocess.Popen([devkit_path()])
            processes.append(visual)
        for _ in range(100):
            result = subprocess.run(["gnome-extensions", "list", "--enabled"],
                                    capture_output=True, text=True, timeout=5)
            if UUID in result.stdout.splitlines():
                break
            if shell.poll() is not None or (visual and visual.poll() is not None):
                raise RuntimeError("El escritorio de pruebas terminó durante el arranque")
            time.sleep(0.1)
        else:
            raise RuntimeError("GNOME arrancó, pero no activó Music Corner")
        print("Escritorio de prueba listo. Cierra Mutter Development Kit o pulsa Ctrl+C.", flush=True)
        while (visual is None or visual.poll() is None) and shell.poll() is None:
            time.sleep(0.2)
        if shell.poll() not in (None, 0) or (visual and visual.poll() not in (None, 0)):
            raise RuntimeError("La sesión visual terminó con un error; revisa .dev/dev.log")
    finally:
        for process in reversed(processes):
            stop_process(process)


def session(smoke=False):
    build()
    if not smoke and not devkit_path():
        raise RuntimeError("Falta Mutter Devkit: ejecuta npm run setup:devkit")
    DEV.mkdir(exist_ok=True)
    log_path = DEV / ("shell-smoke.log" if smoke else "dev.log")
    with tempfile.TemporaryDirectory(prefix="session-", dir=DEV, ignore_cleanup_errors=True) as temporary:
        env = isolated_environment(Path(temporary), visual=not smoke)
        if smoke:
            command = ["dbus-run-session", "--", "gnome-shell-test-tool", "--headless",
                       "--disable-animations", "--extension", str(BUNDLE),
                       str(ROOT / "tests/shell-smoke.js")]
        else:
            command = ["dbus-run-session", "--", sys.executable, str(Path(__file__)), "dev-session"]
        print(f"Registro: {log_path}", flush=True)
        with log_path.open("w") as output:
            process = subprocess.Popen(command, env=env, stdout=output,
                                       stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=60 if smoke else None)
            except KeyboardInterrupt:
                code = 0
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
        if code:
            print(log_path.read_text()[-12000:])
            raise RuntimeError(f"La sesión terminó con código {code}")
        if smoke:
            assert 'PASS: GNOME Shell' in log_path.read_text(), 'No se ejecutó la prueba de Shell'
            print("PASS: GNOME Shell esquina, controles, teclado, preferencias y limpieza")


def install():
    build()
    run(["gnome-extensions", "install", "--force", BUNDLE])
    print(f"Instalada. En Wayland, cierra sesión y vuelve a entrar para cargar código nuevo.\n"
          f"Después ejecuta: gnome-extensions enable {UUID}")


if __name__ == "__main__":
    commands = {"doctor": doctor, "check": check, "build": build,
                "setup-devkit": setup_devkit, "dev": session,
                "dev-session": dev_session, "smoke": lambda: session(smoke=True),
                "install": install}
    try:
        commands[sys.argv[1]]()
    except KeyboardInterrupt:
        pass
    except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired, AssertionError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
