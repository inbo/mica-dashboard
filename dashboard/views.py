import csv
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import cache_page

from .models import Occurrence, Dataset


def index(request):
    return render(request, "dashboard/index.html")


def available_datasets(request):
    data = list(Dataset.objects.all().values())
    return JsonResponse(data, safe=False)


def _extract_int_request(request, param_name):
    """Returns an integer, or None if the parameter doesn't exist or is 'null' """
    val = request.GET.get(param_name, None)
    if val == '' or val == 'null' or val is None:
        return None
    else:
        return int(val)


@cache_page(60 * 120)
def occurrences_csv(request):
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'inline'

    dataset_id = _extract_int_request(request, 'datasetId')

    objects = Occurrence.objects.all()
    if dataset_id:
        objects = objects.filter(source_dataset__pk=dataset_id)


    writer = csv.writer(response)
    for o in objects:
        if o.location:
            writer.writerow([o.pk, o.location.x, o.location.y])

    return response