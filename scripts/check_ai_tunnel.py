import logging
import os
import sys
from urllib import request, error

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DEFAULT_URL = "https://trinity.quantmatrixai.com/chat"


def get_url() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    return os.getenv("TRINITY_AI_URL", DEFAULT_URL)


def main() -> int:
    """Return 0 if the Trinity AI chat endpoint is reachable."""
    url = get_url()
    logger.info("Checking %s", url)
    req = request.Request(url, method="OPTIONS")
    try:
        with request.urlopen(req, timeout=10) as resp:
            status = resp.status
            headers = resp.headers
            logger.info("Status %s", status)
            logger.info("Server %s", headers.get('Server'))
            if status >= 400:
                logger.error("FAILURE: endpoint responded with an error (%s)", status)
                print("FAILURE")
                return 1
            logger.info("SUCCESS: tunnel appears healthy")
            print("SUCCESS")
            return 0
    except error.HTTPError as e:
        logger.error("FAILURE: HTTP error %s - %s", e.code, e.reason)
        if e.code == 530:
            logger.error("Cloudflare 530 typically means the tunnel is not connected to the origin")
        logger.debug("Headers: %s", e.headers)
        print("FAILURE")
    except Exception as exc:
        logger.error("FAILURE: request failed: %s", exc)
        print("FAILURE")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
