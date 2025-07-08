import sys
from urllib import request, error

URL = 'https://admin.quantmatrixai.com/admin/login/'

def main():
    print('Checking', URL)
    try:
        with request.urlopen(URL, timeout=5) as resp:
            status = resp.status
            headers = resp.headers
    except error.HTTPError as e:
        # Treat 4xx responses as a successful reachability check
        status = e.code
        headers = e.headers
    except Exception as e:
        print('Request failed:', e)
        sys.exit(1)

    print('Status', status)
    print('Server', headers.get('Server'))
    sys.exit(0 if status < 500 else 1)

if __name__ == '__main__':
    main()
