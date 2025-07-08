import logging
import os
import sys
from urllib import request, error

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DEFAULT_URL = "https://admin.quantmatrixai.com/admin/login/"


def get_url() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    return os.getenv("BACKEND_URL", DEFAULT_URL)


def main() -> int:
    url = get_url()
    logger.info("Checking %s", url)
    try:
        with request.urlopen(url, timeout=10) as resp:
            status = resp.status
            headers = resp.headers
            logger.info("Status %s", status)
            logger.info("Server %s", headers.get('Server'))
            if status >= 400:
                logger.error("FAILURE: endpoint responded with an error")
                return 1
            logger.info("SUCCESS: tunnel appears healthy")
            return 0
    except error.HTTPError as e:
        logger.error("FAILURE: HTTP error %s", e.code)
        logger.debug("Headers: %s", e.headers)
    except Exception as exc:
        logger.error("FAILURE: request failed: %s", exc)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
