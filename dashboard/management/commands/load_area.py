import os
import sys

from django.contrib.gis.utils.layermapping import LayerMapping
from django.core.management.base import BaseCommand, CommandParser

from dashboard.models import Area

THIS_DIR = os.path.dirname(__file__)

SOURCE_DIRECTORY = os.path.join(THIS_DIR, "../../../source_data/areas")

LAYER_MAPPING_CONFIGURATION = {  # key: filename / value: mapping
    "LIVE_MICA_shp/LIVE_MICA.shp": {"name": "Name", "mpoly": "POLYGON"},
    "all_mica_areas_merged/all_mica_areas_merged.shp": {
        "name": "Name",
        "mpoly": "POLYGON",
    },
}


class Command(BaseCommand):
    help = (
        "Import new predefined areas in the database. "
        ""
        "Takes a single argument: source data file name (in source_data/areas). "
        "This script should be adjusted (mapping, projections, ...) for each area data source"
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "area-source-filename",
            help="Source data file name",
        )

    def handle(self, *args, **options) -> None:
        filename = options["area-source-filename"]
        try:
            mapping = LAYER_MAPPING_CONFIGURATION[filename]
            self.stdout.write(f"Mapping found for {filename}")
        except KeyError:
            self.stdout.write(
                f"No mapping found for {filename}, is the filename correct. Has the script been adjusted "
                f"for this data source?"
            )
            sys.exit(1)

        lm = LayerMapping(Area, os.path.join(SOURCE_DIRECTORY, filename), mapping)
        lm.save(verbose=True)
