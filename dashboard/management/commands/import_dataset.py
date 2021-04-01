import datetime
import math
import os
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from dwca.darwincore.utils import qualname as qn
from dwca.read import DwCAReader

from dashboard.models import Dataset, Occurrence, Species

# Number of decimal places kept in the coordinates (3 = 111m accuracy at the equator => better in Belgium). This is done
# for permormance reasons (GeoJSON file size).
COORDINATES_DECIMAL_PLACES = 3


def truncate(number, digits) -> float:
    stepper = 10.0 ** digits
    return math.trunc(stepper * number) / stepper


def _path_for_dataset(gbif_dataset_id: str):
    return os.path.join(settings.DATASET_TEMPORARY_DIR, f'{gbif_dataset_id}.zip')


def _dataset_download_exists(gbif_dataset_id: str):
    """Return True if we already have a download (DwC-A) for this dataset"""
    my_file = Path(_path_for_dataset(gbif_dataset_id))
    return my_file.is_file()


class Command(BaseCommand):
    help = 'Import the dataset whose gbif_dataset_id is passed as argument.'

    def _download_dataset(self, gbif_dataset_id: str):
        self.stdout.write('I will download the dataset')

    def _delete_dataset_and_related_data(self, gbif_dataset_id: str):
        try:
            Dataset.objects.get(gbif_id=gbif_dataset_id).delete()
            self.stdout.write("Deleted existing dataset with this ID")
        except Dataset.DoesNotExist:
            self.stdout.write("No previous dataset with this ID in the database => nothing to delete")

    def _ingest_dataset(self, gbif_dataset_id: str, dataset_name: str, catches: bool):
        with DwCAReader(_path_for_dataset(gbif_dataset_id)) as dwca:
            self.stdout.write(self.style.SUCCESS('Ok, dataset successfully opened'))

            dataset = Dataset.objects.create(gbif_id=gbif_dataset_id, name=dataset_name, contains_catches=catches)

            for row in dwca:
                species, _ = Species.objects.get_or_create(name=row.data[qn('scientificName')])

                # Some catches have no location...
                try:
                    point = Point(truncate(float(row.data[qn('decimalLongitude')]), COORDINATES_DECIMAL_PLACES),
                                  truncate(float(row.data[qn('decimalLatitude')]), COORDINATES_DECIMAL_PLACES),
                                  srid=4326)
                except ValueError:
                    point = None

                # Some dates are incomplete(year only - skipping for now)
                year = int(row.data[qn('year')])
                try:
                    month = int(row.data[qn('month')])
                    day = int(row.data[qn('day')])
                except ValueError:
                    month = 1
                    day = 1
                date = datetime.date(year, month, day)

                # individualCount is not always present - default to 1
                try:
                    ic = int(row.data[qn('individualCount')])
                except ValueError:
                    ic = 1

                Occurrence.objects.create(
                    gbif_id=int(row.data['http://rs.gbif.org/terms/1.0/gbifID']),
                    species=species,
                    source_dataset=dataset,
                    individual_count=ic,
                    date=date,
                    location=point,
                    coordinates_uncertainty=float(row.data[qn('coordinateUncertaintyInMeters')]),
                    municipality=row.data[qn('municipality')],
                    georeference_remarks=row.data[qn('georeferenceRemarks')]
                )

                self.stdout.write(".", ending='')

    def add_arguments(self, parser):
        parser.add_argument('gbif_dataset_id')

        parser.add_argument(
            '--force_download',
            action='store_true',
            help='Download the dataset, even if a file already exists for it in settings.DATASET_TEMPORARY_DIR',
        )

    def handle(self, *args, **options):
        dataset_id = options["gbif_dataset_id"]

        dataset_config_entry = next(
            (item for item in settings.DATASET_CONFIG if item["gbif_id"] == dataset_id), None)

        if dataset_config_entry:  # Okay, we have some configuration for this dataset:
            if (not _dataset_download_exists(dataset_id)) or options['force_download']:
                self._download_dataset(dataset_id)

            self._delete_dataset_and_related_data(dataset_id)
            self._ingest_dataset(dataset_id,
                                 dataset_name=dataset_config_entry['name'],
                                 catches=dataset_config_entry['catches'])

        else:
            self.stdout.write(self.style.ERROR('Sorry, no entry for this dataset in settings.DATASET_CONFIG'))
