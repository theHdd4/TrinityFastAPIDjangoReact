import json
import threading

class FileBasedKeyValueStore:
    def __init__(self, filename='memory_store.json'):
        self.filename = filename
        self.lock = threading.Lock()
        self._load_data()

    def _load_data(self):
        try:
            with open(self.filename, 'r') as file:
                self.store = json.load(file)
        except (FileNotFoundError, json.JSONDecodeError):
            self.store = {}

    def _save_data(self):
        with self.lock:
            with open(self.filename, 'w') as file:
                json.dump(self.store, file, indent=2)

    def set(self, key, value):
        self.store[key] = value
        self._save_data()

    def get(self, key):
        return self.store.get(key)

    def delete(self, key):
        if key in self.store:
            del self.store[key]
            self._save_data()

    def keys(self):
        return list(self.store.keys())
