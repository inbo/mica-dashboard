from django.core.serializers import serialize
from django.http import HttpResponse
from django.shortcuts import render

from .models import Occurrence


def index(request):
    return render(request, "dashboard/index.html")


def occurrences_geojson(request):
    g= serialize('geojson', Occurrence.objects.all(),
                 geometry_field='location',
                 fields=('gbif_id',))
    return HttpResponse(g, content_type='application/json')