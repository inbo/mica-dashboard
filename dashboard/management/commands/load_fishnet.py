import os

from django.contrib.gis.utils import LayerMapping
from django.core.management import BaseCommand

from dashboard.models import FishnetSquare

THIS_DIR = os.path.dirname(__file__)

SOURCE_SHAPEFILE_PATH = os.path.join(THIS_DIR, "../../../source_data/grid/grid_clipped_belgium_waterways_length/grid_clipped_belgium_waterways_length.shp")
MAPPING = {
    "mpoly": "POLYGON",
    "waterway_length_in_meters": "WAT_LENGTH",
}

class Command(BaseCommand):
    help = (
        "Import the grid of fishnet squares in the database. "
    )

    def handle(self, *args, **options) -> None:
        lm = LayerMapping(FishnetSquare, SOURCE_SHAPEFILE_PATH, MAPPING)
        lm.save(verbose=True)