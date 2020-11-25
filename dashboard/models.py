from django.contrib.gis.db import models


class Species(models.Model):
    name = models.CharField(max_length=100)


class Dataset(models.Model):
    name = models.CharField(max_length=100)
    gbif_id = models.CharField(max_length=100, unique=True)
    contains_catches = models.BooleanField() # Some datasets contains catches, other contains observations. The distinction is currently made at the dataset level


class Occurrence(models.Model):
    gbif_id = models.CharField(max_length=100, unique=True)
    species = models.ForeignKey(Species, on_delete=models.PROTECT)
    source_dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE)  # We can update a dataset by deleting it (and all its observations) then replace it
    individual_count = models.IntegerField(default=1)
    date = models.DateField()
    location = models.PointField()


