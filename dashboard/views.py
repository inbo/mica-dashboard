from datetime import datetime

from django.core.paginator import Paginator
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.db import connection

from jinjasql import JinjaSql

from .models import Occurrence, Dataset, Species

RECENT_OCCURRENCES_START = '2019-01-01'


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
    only_recent = _extract_bool_request(request, 'onlyRecent')

    return dataset_id, species_id, only_recent


def _request_to_occurrences_qs(request):
    """Takes a request, extract common parameters used to filter occurrences and return a corresponding QuerySet"""
    qs = Occurrence.objects.all()

    dataset_id, species_id, only_recent = _filters_from_request(request)

    if dataset_id:
        qs = qs.filter(source_dataset_id=dataset_id)
    if species_id:
        qs = qs.filter(species_id=species_id)
    if only_recent:
        qs = qs.filter(date__range=[RECENT_OCCURRENCES_START, datetime.today().strftime('%Y-%m-%d')])

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
    dataset_id, species_id, only_recent = _filters_from_request(request)

    template = f"""
    WITH grid AS (
                {_get_grid_query_fragment()}
            )

            SELECT MIN(count), MAX(count) FROM grid;
    """

    template = ' '.join(template.replace('\n', '').split())  # Remove multiple withespaces and \n for easier inspection

    start_date = None
    if only_recent:
        start_date = RECENT_OCCURRENCES_START

    data = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
        "grid_extent_viewport": False,
        "dataset_id": dataset_id,
        "species_id": species_id,
        "start_date": start_date
    }

    cursor = connection.cursor()
    j = JinjaSql()

    query, bind_params = j.prepare_query(template, data)
    cursor.execute(query, bind_params)
    r = cursor.fetchone()
    return JsonResponse({'min': r[0], 'max': r[1]})


def _get_grid_query_fragment():
    return """
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
                            ))
                            
                    AS dashboard_filtered_occ
                    
                    ON ST_Intersects(dashboard_filtered_occ.location, hexes.geom)
                    GROUP BY hexes.geom
    """


def mvt_tiles(request, zoom, x, y):
    dataset_id, species_id, only_recent = _filters_from_request(request)

    template = f"""
            WITH grid AS (
                {_get_grid_query_fragment()}
            )   

            ,mvtgeom AS (
                SELECT ST_AsMVTGeom(geom, TileBBox({{{{{ zoom }}}}}, {{{{{ x }}}}}, {{{{{ y }}}}}, 3857)) AS geom, count FROM grid
            )

            SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;
            """

    template = ' '.join(template.replace('\n', '').split())  # Remove multiple withespaces and \n for easier inspection

    start_date = None
    if only_recent:
        start_date = RECENT_OCCURRENCES_START

    data = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
        "grid_extent_viewport": True,

        "dataset_id": dataset_id,
        "species_id": species_id,
        "start_date": start_date,

        "zoom": zoom,
        "x": x,
        "y": y
    }

    cursor = connection.cursor()
    j = JinjaSql()

    query, bind_params = j.prepare_query(template, data)
    cursor.execute(query, bind_params)

    if cursor.rowcount != 0:
        row = cursor.fetchone()
        return HttpResponse(row[0].tobytes(), content_type='application/vnd.mapbox-vector-tile')
    else:
        return HttpResponse('', content_type='application/vnd.mapbox-vector-tile')