import os
import sys
from urllib import request, error

DEFAULT_URL = "https://admin.quantmatrixai.com/admin/login/"

def get_url() -> str:
    """Return the URL to check from argv or the BACKEND_URL env var."""
    if len(sys.argv) > 1:
        return sys.argv[1]
    return os.getenv("BACKEND_URL", DEFAULT_URL)

def main():
    url = get_url()
    print('Checking', url)
    try:
        with request.urlopen(url, timeout=5) as resp:
            status = resp.status
            headers = resp.headers
    except error.HTTPError as e:
        # HTTP errors indicate the endpoint is reachable but returned an error
        status = e.code
        headers = e.headers
    except Exception as e:
        print('Request failed:', e)
        sys.exit(1)

    print('Status', status)
    print('Server', headers.get('Server'))
    sys.exit(0 if status < 400 else 1)

if __name__ == '__main__':
    main()
