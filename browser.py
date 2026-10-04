from config import env

def launch(pw):
    kw = dict(
        user_data_dir=env("PROFILE_DIR", "state/profile"),
        headless=False,
        viewport={"width": 1366, "height": 850},
        args=["--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation"],
        accept_downloads=True,
    )
    ch = env("BROWSER_CHANNEL", "chrome")
    if ch:
        kw["channel"] = ch
    return pw.chromium.launch_persistent_context(**kw)
