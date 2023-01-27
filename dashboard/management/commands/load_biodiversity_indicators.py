import datetime

from django.contrib.gis.geos import Point
from django.core.management import BaseCommand, CommandParser

from dwca.darwincore.utils import qualname as qn

from dwca.read import DwCAReader

from dashboard.models import (
    BiodiversityIndicatorObservation,
    BiodiversityIndicatorSpecies,
)


class Command(BaseCommand):
    help = (
        "Import biodiversity indicators in the database. "
        ""
        "Takes a single argument: the darwin core archive file with the data, from https://www.gbif.org/dataset/cd1c5bf1-0d7a-447a-875a-919f22e325bb "
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "dwca",
            help="DwC-A file from the LIFE MICA Biodiversity Surveys",
        )

        parser.add_argument(
            "--truncate",
            action="store_true",
            help="Remove existing data (observations from LIFE MICA surveys) before importing",
        )

    def handle(self, *args, **options) -> None:
        pass
        filename = options["dwca"]

        if options["truncate"]:
            self.stdout.write("Truncating existing data")
            for obs in BiodiversityIndicatorObservation.objects.all():
                obs.delete()

        self.stdout.write("Importing new observations")
        with DwCAReader(filename) as dwca:
            for row in dwca:
                gbif_id = row.data["http://rs.gbif.org/terms/1.0/gbifID"]
                scientific_name = row.data[
                    "http://rs.tdwg.org/dwc/terms/scientificName"
                ]

                year = int(row.data[qn("year")])
                month = int(row.data[qn("month")])
                day = int(row.data[qn("day")])

                date = datetime.date(year, month, day)
                location = Point(
                    float(row.data[qn("decimalLongitude")]),
                    float(row.data[qn("decimalLatitude")]),
                    srid=4326,
                )

                species, _ = BiodiversityIndicatorSpecies.objects.get_or_create(
                    scientific_name=row.data[
                        "http://rs.gbif.org/terms/1.0/acceptedScientificName"
                    ],
                    defaults={
                        "s_kingdom": row.data[qn("kingdom")],
                        "s_class": row.data[qn("class")],
                        "s_order": row.data[qn("order")],
                    },
                )

                BiodiversityIndicatorObservation.objects.create(
                    gbif_id=gbif_id, species=species, date=date, location=location
                )
                self.stdout.write(f"Imported observation {gbif_id}")

        self.stdout.write("Assigning groups to species")
        for species in BiodiversityIndicatorSpecies.objects.all():
            species.auto_set_species_group()
            species.save()

        self.stdout.write("Done")
