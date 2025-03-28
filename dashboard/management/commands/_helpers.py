from functools import lru_cache

import requests


@lru_cache(maxsize=None)
def get_dataset_name_from_gbif_api(gbif_dataset_key: str) -> str:
    query_url = f"https://api.gbif.org/v1/dataset/{gbif_dataset_key}"

    dataset_details = requests.get(query_url).json()
    return dataset_details["title"]
