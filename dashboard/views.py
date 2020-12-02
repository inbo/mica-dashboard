import csv

from django.http import HttpResponse
from django.shortcuts import render
from django.views.decorators.cache import cache_page

from .models import Occurrence


def index(request):
    return render(request, "dashboard/index.html")


@cache_page(60 * 15)
def occurrences_csv(request):
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'inline'

    writer = csv.writer(response)
    for o in Occurrence.objects.all():
        if o.location:
            writer.writerow([o.pk, o.location.x, o.location.y])

    return response