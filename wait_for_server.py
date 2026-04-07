import time
import requests

def wait_for_server(url, timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            requests.get(url)
            print("Server is up!")
            return True
        except requests.ConnectionError:
            time.sleep(1)
    print("Timed out waiting for server")
    return False

if __name__ == "__main__":
    wait_for_server("http://localhost:5173")