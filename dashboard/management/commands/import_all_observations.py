import argparse
import datetime
import tempfile
from typing import List, Dict

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management import BaseCommand, CommandParser
from django.db import transaction
from django.utils import timezone
from dwca.read import DwCAReader
from dwca.rows import CoreRow
from dwca.darwincore.utils import qualname as qn

from gbif_blocking_occurrences_download import download_occurrences as download_gbif_occurrences  # type: ignore
from maintenance_mode.core import set_maintenance_mode

from dashboard.management.commands._helpers import get_dataset_name_from_gbif_api
from dashboard.models import DataImport, Occurrence, Species, Dataset


def build_gbif_predicate(country_codes: List[str], species_ids: List[int]) -> Dict:
    """Build a GBIF predicate (for occurrence download) targeting a specific country and a list of species"""
    return {
        "predicate": {
            "type": "and",
            "predicates": [
                {"type": "in", "key": "COUNTRY", "values": country_codes},
                {
                    "type": "in",
                    "key": "TAXON_KEY",
                    "values": species_ids,
                },
                {"type": "equals", "key": "OCCURRENCE_STATUS", "value": "present"},
            ],
        }
    }


def extract_gbif_download_id_from_dwca(dwca: DwCAReader) -> str:
    return dwca.metadata.find("dataset").find("alternateIdentifier").text


def import_single_occurrence(row: CoreRow, current_data_import: DataImport):
    try:
        year = int(row.data[qn("year")])
    except ValueError:
        year = None

    # individualCount is not always present - default to 1
    try:
        ic = int(row.data[qn("individualCount")])
    except ValueError:
        ic = 1

    proceed_with_import = False
    if (
        int(row.data["http://rs.gbif.org/terms/1.0/acceptedTaxonKey"])
        in settings.GBIF_TAXA_IDS_TO_IMPORT
        and year is not None
        and ic > 0
    ):
        proceed_with_import = True

    if proceed_with_import:
        species, _ = Species.objects.get_or_create(name=row.data[qn("scientificName")])

        gbif_dataset_key = row.data["http://rs.gbif.org/terms/1.0/datasetKey"]
        gbif_dataset_name = row.data[qn("datasetName")]

        # Ugly hack necessary to circumvent a GBIF bug (missing dataset names in Downloads).
        if gbif_dataset_name == "":
            gbif_dataset_name = get_dataset_name_from_gbif_api(gbif_dataset_key)

        dataset, _ = Dataset.objects.get_or_create(
            gbif_id=gbif_dataset_key,
            defaults={"name": gbif_dataset_name},
        )

        try:
            point = Point(
                float(row.data[qn("decimalLongitude")]),
                float(row.data[qn("decimalLatitude")]),
                srid=4326,
            )
        except ValueError:
            point = None

        # Some dates are incomplete(year only)
        try:
            month = int(row.data[qn("month")])
            day = int(row.data[qn("day")])
        except ValueError:
            month = 1
            day = 1
        date = datetime.date(year, month, day)

        # coordinates uncertainty not always present
        try:
            cu = float(row.data[qn("coordinateUncertaintyInMeters")])
        except ValueError:
            cu = None

        dataset_contains_only_catches = (
            dataset.gbif_id in settings.GBIF_CATCHES_DATASET_KEY
        )
        record_flagged_as_catch = row.data[qn("samplingProtocol")] == "rat trap"

        Occurrence.objects.create(
            gbif_id=int(row.data["http://rs.gbif.org/terms/1.0/gbifID"]),
            species=species,
            source_dataset=dataset,
            individual_count=ic,
            date=date,
            location=point,
            coordinates_uncertainty=cu,
            municipality=row.data[qn("municipality")],
            georeference_remarks=row.data[qn("georeferenceRemarks")],
            data_import=current_data_import,
            is_catch=(dataset_contains_only_catches or record_flagged_as_catch),
        )


class Command(BaseCommand):
    help = """Import new observations and delete previous ones. 
    
    By default, a new download is generated at GBIF. "
    The --source-dwca option can be used to provide an existing local file instead."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.transaction_was_successful = False

    def flag_transaction_as_successful(self):
        self.transaction_was_successful = True

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--source-dwca",
            type=argparse.FileType("r"),
            help="Use an existing dwca file as source (otherwise a new GBIF download will be generated and downloaded)",
        )

    def handle(self, *args, **options) -> None:
        self.stdout.write("(Re)importing all observations")

        gbif_predicate = None
        if options["source_dwca"]:
            self.stdout.write("Using a user-provided DWCA file")
            source_data_path = options["source_dwca"].name
        else:
            self.stdout.write(
                "Will create a GBIF download and wait for it, this can takes a long time..."
            )

            tmp_file = tempfile.NamedTemporaryFile()
            source_data_path = tmp_file.name
            # This might takes several minutes...
            gbif_predicate = build_gbif_predicate(
                country_codes=settings.GBIF_COUNTRIES_TO_IMPORT,
                species_ids=settings.GBIF_TAXA_IDS_TO_IMPORT,
            )

            download_gbif_occurrences(
                gbif_predicate,
                username=settings.GBIF_USERNAME,
                password=settings.GBIF_PASSWORD,
                output_path=source_data_path,
            )
            self.stdout.write(
                "We now have a (locally accessible) source dwca, real import is starting. We'll use a transaction and put "
                "the website in maintenance mode"
            )

        self.stdout.write("We'll put the website in maintenance mode during the import")
        set_maintenance_mode(True)
        with transaction.atomic():
            transaction.on_commit(self.flag_transaction_as_successful)

            current_data_import = DataImport.objects.create(
                start=timezone.now(), gbif_predicate=gbif_predicate
            )
            self.stdout.write(
                f"Created a new DataImport object: #{current_data_import.pk}"
            )

            with DwCAReader(source_data_path) as dwca:
                current_data_import.set_gbif_download_id(
                    extract_gbif_download_id_from_dwca(dwca)
                )

                self._import_all_observations_from_dwca(dwca, current_data_import)

            self.stdout.write(
                "All occurrences imported, now deleting occurrences linked to previous data imports..."
            )

            # 4. Remove previous observations
            Occurrence.objects.exclude(data_import=current_data_import).delete()

            # 4. Finalize the DataImport object
            self.stdout.write("Updating the DataImport object")
            current_data_import.complete()
            self.stdout.write("Done.")

        self.stdout.write("Leaving maintenance mode.")
        set_maintenance_mode(False)

        self.stdout.write("Sending email report")
        if self.transaction_was_successful:
            pass
        else:
            # Report error? Send email?
            pass

    def _import_all_observations_from_dwca(
        self, dwca: DwCAReader, current_data_import: DataImport
    ):
        for i, core_row in enumerate(dwca):
            import_single_occurrence(core_row, current_data_import)
            if i % 1000 == 0:
                self.stdout.write(".")
