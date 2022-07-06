from django.contrib.gis import admin
from .models import Occurrence, Species, Dataset, Area


class OccurrenceAdmin(admin.OSMGeoAdmin):
    list_display = ("gbif_id", "species", "source_dataset")
    list_filter = ("source_dataset__name", "species__name")


admin.site.register(Occurrence, OccurrenceAdmin)


class DatasetAdmin(admin.ModelAdmin):
    pass


admin.site.register(Dataset, DatasetAdmin)


class SpeciesAdmin(admin.ModelAdmin):
    pass


admin.site.register(Species, SpeciesAdmin)


class AreaAdmin(admin.OSMGeoAdmin):
    pass


admin.site.register(Area, AreaAdmin)
