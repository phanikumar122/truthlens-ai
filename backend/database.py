import json
import os
from typing import List, Dict

class Database:
    def __init__(self, file_path: str = "results.json"):
        self.file_path = file_path
        if not os.path.exists(self.file_path):
            with open(self.file_path, "w") as f:
                json.dump([], f)

    def save_result(self, result: Dict):
        results = self.get_results()
        
        # Prevent duplicates based on text in the latest results
        # We only check the first 50 to avoid performance issues if file grows
        if any(r["text"] == result["text"] for r in results[:50]):
            return False
            
        results.insert(0, result)  # Latest first
        # Keep only latest 100
        results = results[:100]
        with open(self.file_path, "w") as f:
            json.dump(results, f)
        return True

    def get_results(self) -> List[Dict]:
        try:
            with open(self.file_path, "r") as f:
                return json.load(f)
        except:
            return []

db = Database()
