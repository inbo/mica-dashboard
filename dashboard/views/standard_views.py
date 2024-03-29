from django.core.paginator import Paginator
from django.core.serializers import serialize
from django.db.models import Count
from django.db.models.functions import ExtractYear, TruncMonth
from django.http import JsonResponse, HttpRequest, HttpResponse
from django.shortcuts import render, get_object_or_404

from dashboard.models import (
    Dataset,
    Species,
    Area,
    DataImport,
    BiodiversityIndicatorObservation,
    BiodiversityIndicatorSpecies,
)

from dashboard.views.helpers import request_to_occurrences_qs, extract_int_request


def index(request):
    latest_data_import = DataImport.objects.order_by("-start").first()
    return render(
        request, "dashboard/index.html", {"latest_data_import": latest_data_import}
    )


def available_datasets(_request: HttpRequest) -> JsonResponse:
    data = list(Dataset.objects.all().values())
    return JsonResponse(data, safe=False)


def available_species(_request: HttpRequest) -> JsonResponse:
    data = list(Species.objects.all().values())
    return JsonResponse(data, safe=False)


def occurrences_json(request: HttpRequest) -> JsonResponse:
    order = request.GET.get("order")
    limit = extract_int_request(request, "limit")
    page_number = extract_int_request(request, "page_number")

    occurrences = request_to_occurrences_qs(request).order_by(order)

    paginator = Paginator(occurrences, limit)

    page = paginator.get_page(page_number)
    occurrences_dicts = [occ.as_dict() for occ in page.object_list]

    return JsonResponse(
        {
            "results": occurrences_dicts,
            "firstPage": page.paginator.page_range.start,
            "lastPage": page.paginator.page_range.stop,
            "totalResultsCount": page.paginator.count,
        }
    )


def occurrences_counter(request: HttpRequest) -> JsonResponse:
    """Count the occurrences according to the filters received

    filters: same format than other endpoints: getting occurrences, map tiles, ...
    """
    qs = request_to_occurrences_qs(request)
    return JsonResponse({"count": qs.count()})


def occurrences_monthly_histogram(request: HttpRequest) -> JsonResponse:
    """Give the (filtered) number of occurrences per month

    filters: same format than other endpoints: getting occurrences, map tiles, ...

    Output is chronologically ordered
    """
    qs = request_to_occurrences_qs(request)

    histogram_data = (
        qs.annotate(month=TruncMonth("date"))
        .values("month")
        .annotate(total=Count("id"))
        .order_by("month")
    )

    return JsonResponse(
        [
            {"year": e["month"].year, "month": e["month"].month, "count": e["total"]}
            for e in histogram_data
        ],
        safe=False,
    )


def area_geojson(_: HttpRequest, id: int):
    """Return a specific area as GeoJSON"""
    area = get_object_or_404(Area, pk=id)

    return HttpResponse(serialize("geojson", [area]), content_type="application/json")


def areas_list_json(_: HttpRequest) -> JsonResponse:
    """A list of all areas available"""
    areas = Area.objects.all()

    return JsonResponse(
        [area.to_dict(include_geojson=False) for area in areas], safe=False
    )


def available_years_biodiversity_index_json(_: HttpRequest) -> JsonResponse:
    """A list of all years available for the biodiversity index"""
    years = (
        BiodiversityIndicatorObservation.objects.annotate(year=ExtractYear("date"))
        .order_by("year")
        .values_list("year", flat=True)
        .distinct()
    )
    return JsonResponse(list(years), safe=False)


def available_groups_biodiversity_index_json(_: HttpRequest) -> JsonResponse:
    groups = BiodiversityIndicatorSpecies.SPECIES_GROUP_CHOICES

    groups_as_objects = [{"id": group[0], "name": group[1]} for group in groups]

    return JsonResponse(groups_as_objects, safe=False)
