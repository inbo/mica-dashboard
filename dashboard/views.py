from datetime import datetime

from django.core.paginator import Paginator
from django.db.models import Max, Min
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.db import connection

from jinjasql import JinjaSql

from .helpers import readable_string
from .models import Occurrence, Dataset, Species


def index(request):
    return render(request, "dashboard/index.html")


def available_datasets(request):
    data = list(Dataset.objects.all().values())
    return JsonResponse(data, safe=False)


def available_species(request):
    data = list(Species.objects.all().values())
    return JsonResponse(data, safe=False)


def _extract_int_request(request, param_name):
    """Returns an integer, or None if the parameter doesn't exist or is 'null' """
    val = request.GET.get(param_name, None)
    if val == '' or val == 'null' or val is None:
        return None
    else:
        return int(val)


def _extract_bool_request(request, param_name):
    """Returns an boolean (default to False). Input: 'true' | 'false' """
    val = request.GET.get(param_name, 'false')

    if val == 'true':
        return True
    else:
        return False


def _extract_date_request(request, param_name, date_format="%Y-%m-%d"):
    """Return a datetime.date object (or None is the param doesn't exist or is empty)

    format: see https://docs.python.org/3/library/datetime.html#strftime-and-strptime-behavior
    """
    val = request.GET.get(param_name, None)

    if val is not None and val != '':
        return datetime.strptime(val, date_format).date()

    return None


def occurrences_json(request):
    order = request.GET.get('order')
    limit = _extract_int_request(request, 'limit')
    page_number = _extract_int_request(request, 'page_number')

    occurrences = _request_to_occurrences_qs(request).order_by(order)

    paginator = Paginator(occurrences, limit)  # Show 25 contacts per page.

    page = paginator.get_page(page_number)
    occurrences_dicts = [occ.as_dict() for occ in page.object_list]

    return JsonResponse({'results': occurrences_dicts,
                         'firstPage': page.paginator.page_range.start,
                         'lastPage': page.paginator.page_range.stop,
                         'totalResultsCount': page.paginator.count})


MULTIPLIER = 2
ZOOM_TO_HEX_SIZE_RAW = {
    0: 640000,
    1: 320000,
    2: 160000,
    3: 80000,
    4: 40000,
    5: 20000,
    6: 10000,
    7: 5000,
    8: 2500,
    9: 1250,
    10: 675,
    11: 335,
    12: 160,
    13: 80,
    14: 40,
    15: 20,
    16: 10
    # TODO: show individual occurrences for levels > 13?
}
ZOOM_TO_HEX_SIZE = {key: value * MULTIPLIER for key, value in ZOOM_TO_HEX_SIZE_RAW.items()}


def _filters_from_request(request):
    dataset_id = _extract_int_request(request, 'datasetId')
    species_id = _extract_int_request(request, 'speciesId')
    start_date = _extract_date_request(request, 'startDate')
    end_date = _extract_date_request(request, 'endDate')

    return dataset_id, species_id, start_date, end_date


def _request_to_occurrences_qs(request):
    """Takes a request, extract common parameters used to filter occurrences and return a corresponding QuerySet"""
    qs = Occurrence.objects.all()

    dataset_id, species_id, start_date, end_date = _filters_from_request(request)

    if dataset_id:
        qs = qs.filter(source_dataset_id=dataset_id)
    if species_id:
        qs = qs.filter(species_id=species_id)
    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)

    return qs


def occurrences_counter(request):
    """Count the occurrences according to the filters received

    filters: same format than other endpoints: getting occurrences, map tiles, ...
    """
    qs = _request_to_occurrences_qs(request)
    return JsonResponse({'count': qs.count()})


def occ_min_max_in_grid(request):
    """ Returns the min, max occurrences count per hexagon, according to the zoom level"""
    zoom = _extract_int_request(request, 'zoom')
    dataset_id, species_id, start_date, end_date = _filters_from_request(request)

    sql_template = readable_string(f"""
    WITH grid AS (
        {grid_query_fragment}
            )
        SELECT MIN(count), MAX(count) FROM grid;
    """)

    sql_params = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
        "grid_extent_viewport": False,
        "dataset_id": dataset_id,
        "species_id": species_id,
    }

    if start_date:
        sql_params["start_date"] = start_date.strftime('%Y-%m-%d')
    if end_date:
        sql_params["end_date"] = end_date.strftime('%Y-%m-%d')

    j = JinjaSql()
    query, bind_params = j.prepare_query(sql_template, sql_params)
    with connection.cursor() as cursor:
        cursor.execute(query, bind_params)
        r = cursor.fetchone()
        return JsonResponse({'min': r[0], 'max': r[1]})


grid_query_fragment = """
    SELECT COUNT(*), hexes.geom
                    FROM
                        ST_HexagonGrid(
                            {{ hex_size_meters }},
                            {% if grid_extent_viewport %}
                                TileBBox({{ zoom }}, {{ x }}, {{ y }}, 3857)
                            {% else %}
                                ST_SetSRID(ST_EstimatedExtent('dashboard_occurrence', 'location'), 3857)
                            {% endif %} 
                        ) AS hexes
                    INNER JOIN (
                        SELECT * FROM dashboard_occurrence AS occ 
                        WHERE (
                            1 = 1
                            {% if dataset_id %}
                                AND occ.source_dataset_id = {{ dataset_id }}
                            {% endif %}
                            {% if species_id %}
                                AND occ.species_id = {{ species_id }}
                            {% endif %}
                            {% if start_date %}
                                AND occ.date >= TO_DATE({{ start_date }}, 'YYYY-MM-DD')
                            {% endif %}
                            {% if end_date %}
                                AND occ.date <= TO_DATE({{ end_date }}, 'YYYY-MM-DD')
                            {% endif %}
                            ))
                            
                    AS dashboard_filtered_occ
                    
                    ON ST_Intersects(dashboard_filtered_occ.location, hexes.geom)
                    GROUP BY hexes.geom
    """


def mvt_tiles(request, zoom, x, y):
    dataset_id, species_id, start_date, end_date = _filters_from_request(request)

    template = readable_string(f"""
            WITH grid AS (
                {grid_query_fragment}
            )""" + """

            ,mvtgeom AS (
                SELECT ST_AsMVTGeom(geom, TileBBox({{ zoom }}, {{ x }}, {{ y }}, 3857)) AS geom, count FROM grid
            )

            SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;""")

    data = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
        "grid_extent_viewport": True,

        "dataset_id": dataset_id,
        "species_id": species_id,
        "start_date": start_date.strftime('%Y-%m-%d'),
        "end_date": end_date.strftime('%Y-%m-%d'),

        "zoom": zoom,
        "x": x,
        "y": y
    }

    j = JinjaSql()
    query, bind_params = j.prepare_query(template, data)

    with connection.cursor() as cursor:
        cursor.execute(query, bind_params)

        if cursor.rowcount != 0:
            data = cursor.fetchone()[0].tobytes()
        else:
            data = ''

        return HttpResponse(data, content_type='application/vnd.mapbox-vector-tile')


def occurrences_date_range(request):
    """Returns the earliest and latest date for occurrences

    Same filters than other endpoints
    """

    qs = _request_to_occurrences_qs(request)
    qs = qs.aggregate(Max('date'), Min('date'))

    return JsonResponse({'min': qs['date__min'], 'max': qs['date__max']})
