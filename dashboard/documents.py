from typing import Dict

from django_elasticsearch_dsl import Document, fields
from django_elasticsearch_dsl.registries import registry
from .models import Occurrence


@registry.register_document
class OccurrenceDocument(Document):
    location = fields.GeoPointField()

    def prepare_location(self, instance: Occurrence) -> Dict:
        if instance.location is not None:
            return {
                'lon': instance.location.x,
                'lat': instance.location.y
            }
        else:
            return None

    class Index:
        name = 'occurrences'
        # See Elasticsearch Indices API reference for available settings
        settings = {'number_of_shards': 1,
                    'number_of_replicas': 0}

    class Django:
        model = Occurrence # The model associated with this Document

        # The fields of the model you want to be indexed in Elasticsearch
        fields = [
            'date',
        ]