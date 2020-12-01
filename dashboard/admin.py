from django.contrib import admin
from .models import Occurrence, Species, Dataset


class OccurrenceAdmin(admin.ModelAdmin):
    list_display = ('gbif_id', 'species', 'source_dataset')


admin.site.register(Occurrence, OccurrenceAdmin)


class DatasetAdmin(admin.ModelAdmin):
    pass

admin.site.register(Dataset, DatasetAdmin)


class SpeciesAdmin(admin.ModelAdmin):
    pass

admin.site.register(Species, SpeciesAdmin)