from django.core.paginator import Paginator
from django.db.models import Max, Min
from django.http import JsonResponse
from django.shortcuts import render

from dashboard.models import Dataset, Species

from dashboard.views.helpers import request_to_occurrences_qs, extract_int_request


def index(request):
    return render(request, "dashboard/index.html")


def available_datasets(request):
    data = list(Dataset.objects.all().values())
    return JsonResponse(data, safe=False)


def available_species(request):
    data = list(Species.objects.all().values())
    return JsonResponse(data, safe=False)


def occurrences_json(request):
    order = request.GET.get('order')
    limit = extract_int_request(request, 'limit')
    page_number = extract_int_request(request, 'page_number')

    occurrences = request_to_occurrences_qs(request).order_by(order)

    paginator = Paginator(occurrences, limit)

    page = paginator.get_page(page_number)
    occurrences_dicts = [occ.as_dict() for occ in page.object_list]

    return JsonResponse({'results': occurrences_dicts,
                         'firstPage': page.paginator.page_range.start,
                         'lastPage': page.paginator.page_range.stop,
                         'totalResultsCount': page.paginator.count})


def occurrences_counter(request):
    """Count the occurrences according to the filters received

    filters: same format than other endpoints: getting occurrences, map tiles, ...
    """
    qs = request_to_occurrences_qs(request)
    return JsonResponse({'count': qs.count()})


def occurrences_date_range(request):
    """Returns the earliest and latest date for occurrences

    Same filters than other endpoints
    """

    qs = request_to_occurrences_qs(request)
    qs = qs.aggregate(Max('date'), Min('date'))

    return JsonResponse({'min': qs['date__min'], 'max': qs['date__max']})