from django.contrib.gis.db import models


class Species(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Dataset(models.Model):
    name = models.CharField(max_length=100)
    gbif_id = models.CharField(max_length=100, unique=True)
    contains_catches = models.BooleanField() # Some datasets contains catches, other contains observations. The distinction is currently made at the dataset level

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class Occurrence(models.Model):
    gbif_id = models.CharField(max_length=100, unique=True)
    species = models.ForeignKey(Species, on_delete=models.PROTECT)
    source_dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE)  # We can update a dataset by deleting it (and all its observations) then replace it
    individual_count = models.IntegerField(default=1)
    date = models.DateField()
    location = models.PointField(blank=True, null=True, srid=3857)
    municipality = models.CharField(max_length=100, blank=True)
    coordinates_uncertainty = models.FloatField(blank=True, null=True) # in meters
    georeference_remarks = models.TextField(blank=True)

    def as_dict(self):
        lon, lat = self.location.transform(4326, clone=True).coords

        return {
            'id': self.pk,
            'lat': str(lat)[:6],
            'lon': str(lon)[:6],
            'speciesName': self.species.name,
            'datasetName': self.source_dataset.name
        }