from django.db.models import Max, Min
from django.http import HttpResponse, JsonResponse
from django.db import connection

from jinjasql import JinjaSql

from .helpers import readable_string, extract_int_request, filters_from_request, request_to_occurrences_qs

ZOOM_MULTIPLIER = 2
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
ZOOM_TO_HEX_SIZE = {key: value * ZOOM_MULTIPLIER for key, value in ZOOM_TO_HEX_SIZE_RAW.items()}

GRID_QUERY_FRAGMENT = """
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
                    GROUP BY hexes.geom"""


def occ_min_max_in_grid(request):
    """ Returns the min, max occurrences count per hexagon, according to the zoom level"""
    zoom = extract_int_request(request, 'zoom')
    dataset_id, species_id, start_date, end_date = filters_from_request(request)

    sql_template = readable_string(f"""
    WITH grid AS (
        {GRID_QUERY_FRAGMENT}
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


def mvt_tiles(request, zoom, x, y):
    """Tile server, showing occurrences aggregated by hexagon squares. Filters are honoured."""
    dataset_id, species_id, start_date, end_date = filters_from_request(request)

    template = readable_string(f"""
            WITH grid AS (
                {GRID_QUERY_FRAGMENT}
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
