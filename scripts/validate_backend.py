import urllib.request
import sys

URL = 'https://admin.quantmatrixai.com/admin/login/'

def main():
    print('Checking', URL)
    try:
        with urllib.request.urlopen(URL, timeout=5) as resp:
            print('Status', resp.status)
            print('Server', resp.headers.get('Server'))
            sys.exit(0 if resp.status < 500 else 1)
    except Exception as e:
        print('Request failed:', e)
        sys.exit(1)

if __name__ == '__main__':
    main()
