from django.contrib.gis.db import models
from django.utils import timezone

DATA_SRID = 3857


class Species(models.Model):
    name = models.CharField(max_length=255, db_index=True)

    def __str__(self):
        return self.name


class DataImport(models.Model):
    start = models.DateTimeField()
    end = models.DateTimeField(blank=True, null=True)
    gbif_download_id = models.CharField(max_length=255, blank=True)
    gbif_predicate = models.JSONField(
        blank=True, null=True
    )  # Null if a DwC-A file was provided - no GBIF download

    def set_gbif_download_id(self, download_id: str) -> None:
        """Set the download id and immediately save the entry"""
        self.gbif_download_id = download_id
        self.save()

    def complete(self) -> None:
        """Method to be called at the end of the import process to finalize this entry"""
        self.end = timezone.now()
        self.save()


class Dataset(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    gbif_id = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class Occurrence(models.Model):
    gbif_id = models.CharField(max_length=255)
    species = models.ForeignKey(Species, on_delete=models.PROTECT)
    source_dataset = models.ForeignKey(
        Dataset, on_delete=models.CASCADE
    )  # We can update a dataset by deleting it (and all its observations) then replace it
    individual_count = models.IntegerField(default=1)
    date = models.DateField()
    location = models.PointField(blank=True, null=True, srid=DATA_SRID)
    municipality = models.CharField(max_length=255, blank=True)
    coordinates_uncertainty = models.FloatField(blank=True, null=True)  # in meters
    georeference_remarks = models.TextField(blank=True)
    is_catch = models.BooleanField()

    data_import = models.ForeignKey(DataImport, on_delete=models.PROTECT)

    class Meta:
        indexes = [models.Index(fields=["date"])]
        unique_together = ("gbif_id", "data_import")

    def as_dict(self):
        d = {
            "id": self.pk,
            "gbifId": self.gbif_id,
            "speciesName": self.species.name,
            "datasetName": self.source_dataset.name,
            "datasetKey": self.source_dataset.gbif_id,
            "date": str(self.date),
            "isCatch": self.is_catch,
        }

        if self.location:
            lon, lat = self.location.transform(4326, clone=True).coords
            d["lat"] = str(lat)[:6]
            d["lon"] = str(lon)[:6]

        return d


class Area(models.Model):
    """An area that can be shown to the user, or used to filter observations"""

    mpoly = models.MultiPolygonField(srid=DATA_SRID)
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def to_dict(self, include_geojson: bool):
        d = {
            "id": self.pk,
            "name": self.name,
        }

        if include_geojson:
            d["geojson_str"] = self.mpoly.geojson

        return d


class FishnetSquare(models.Model):
    """A square of the fishnet grid"""

    mpoly = models.MultiPolygonField(srid=DATA_SRID)
    waterway_length_in_meters = models.FloatField()


