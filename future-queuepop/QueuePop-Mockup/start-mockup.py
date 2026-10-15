"""Serve only this mockup folder on localhost and open the browser."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    root = Path(__file__).resolve().parent
    assert (root / "queuepop/index.html").is_file(), "Extract the entire ZIP before starting."
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 4318), handler)
    except OSError as error:
        print(f"Cannot start the preview: {error}")
        print("Close the other preview using port 4318, then try again.")
        return 1
    url = "http://127.0.0.1:4318/queuepop/"
    print(f"QueuePop mockup: {url}\nKeep this window open. Press Ctrl+C to stop.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
