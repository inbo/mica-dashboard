import csv
from datetime import datetime

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import cache_page
from django.db import connection

from jinjasql import JinjaSql

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


@cache_page(60 * 120)
def occurrences_csv(request):
    # Create the HttpResponse object with the appropriate CSV header.
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'inline'

    dataset_id = _extract_int_request(request, 'datasetId')
    species_id = _extract_int_request(request, 'speciesId')
    only_recent = _extract_bool_request(request, 'onlyRecent')

    objects = Occurrence.objects.all()
    if dataset_id:
        objects = objects.filter(source_dataset__pk=dataset_id)
    if species_id:
        objects = objects.filter(species__pk=species_id)
    if only_recent:
        objects = objects.filter(date__range=['2019-01-01', datetime.today().strftime('%Y-%m-%d')])

    writer = csv.writer(response)
    for o in objects:
        if o.location:
            writer.writerow([o.pk, o.location.x, o.location.y, o.species_id, o.source_dataset_id])

    return response


ZOOM_TO_HEX_SIZE = {
        3: 100000,
        4: 20000,
        5: 20000,
        6: 20000,
        7: 10000,
        8: 5000,
        9: 2500,
        10: 1250,
        11: 675,
        12: 330
}

GRID_QUERY_FRAGMENT = """
    SELECT COUNT(*), hexes.geom
                    FROM
                        ST_HexagonGrid(
                            {{ hex_size_meters }},
                            ST_SetSRID(ST_EstimatedExtent('dashboard_occurrence', 'location'), 3857)
                        ) AS hexes
                    INNER JOIN
                    dashboard_occurrence
                    ON ST_Intersects(dashboard_occurrence.location, hexes.geom)
                    GROUP BY hexes.geom
    """


def occ_min_max_in_grid(request):
    """ Returns the min, max occurrences count per hexagon, according to the zoom level"""
    zoom = _extract_int_request(request, 'zoom')

    template = f"""
    WITH grid AS (
                {GRID_QUERY_FRAGMENT}
            )
            
            SELECT MIN(count), MAX(count) FROM grid;   
    """

    template = ' '.join(template.replace('\n', '').split())  # Remove multiple withespaces and \n for easier inspection

    data = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom]
    }

    cursor = connection.cursor()
    j = JinjaSql()

    query, bind_params = j.prepare_query(template, data)
    cursor.execute(query, bind_params)
    r = cursor.fetchone()
    return JsonResponse({'min': r[0], 'max': r[1]})


def mvt_tiles(request, zoom, x, y):
    template = f"""
            WITH grid AS (
                {GRID_QUERY_FRAGMENT}
            )   

            ,mvtgeom AS (
                SELECT ST_AsMVTGeom(geom, TileBBox({{{{{ zoom }}}}}, {{{{{ x }}}}}, {{{{{ y }}}}}, 3857)) AS geom, count FROM grid
            )

            SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;
            """

    template = ' '.join(template.replace('\n', '').split())  # Remove multiple withespaces and \n for easier inspection

    data = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
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