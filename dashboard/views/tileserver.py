from string import Template

from django.http import HttpResponse, JsonResponse
from django.db import connection
from django.views.decorators.cache import cache_page

from jinjasql import JinjaSql

from .helpers import readable_string, extract_int_request, filters_from_request
from ..models import Occurrence, Area, FishnetSquare

AREAS_TABLE_NAME = Area.objects.model._meta.db_table
OCCURRENCES_TABLE_NAME = Occurrence.objects.model._meta.db_table
FISHNET_TABLE_NAME = FishnetSquare.objects.model._meta.db_table
FISHNET_WATER_SCORE_FIELD = "waterway_length_in_meters"
OCCURRENCES_FIELD_NAME_POINT = "location"

# ! Make sure the following formats are in sync
DB_DATE_EXCHANGE_FORMAT_PYTHON = "%Y-%m-%d"  # To be passed to strftime()
DB_DATE_EXCHANGE_FORMAT_POSTGRES = "YYYY-MM-DD"  # To be used in SQL queries

# Hexagon size (in meters) according to the zoom level. Adjust ZOOM_TO_HEX_SIZE_MULTIPLIER to simultaneously configure
# all zoom levels
ZOOM_TO_HEX_SIZE_MULTIPLIER = 2
ZOOM_TO_HEX_SIZE_BASELINE = {
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
ZOOM_TO_HEX_SIZE = {
    key: value * ZOOM_TO_HEX_SIZE_MULTIPLIER
    for key, value in ZOOM_TO_HEX_SIZE_BASELINE.items()
}

# !! IMPORTANT !! Make sure the occurrence filtering here is equivalent to what's done in
# views.helpers.request_to_occurrences_qs Otherwise, occurrences returned on the map and on other
# components (table, ...) will be inconsistent.
JINJASQL_FRAGMENT_FILTER_OCCURRENCES = Template(
    """
    SELECT * FROM $occurrences_table_name as occ
    
    {% if area_ids %}
    , (SELECT mpoly FROM $areas_table_name WHERE $areas_table_name.id IN {{ area_ids | inclause }}) AS areas
    {% endif %}
    
    WHERE (
        1 = 1
        {% if dataset_id %}
            AND occ.source_dataset_id = {{ dataset_id }}
        {% endif %}
        {% if species_id %}
            AND occ.species_id = {{ species_id }}
        {% endif %}
        {% if start_date %}
            AND occ.date >= TO_DATE({{ start_date }}, '$date_format')
        {% endif %}
        {% if end_date %}
            AND occ.date <= TO_DATE({{ end_date }}, '$date_format')
        {% endif %}
        {% if records_type == "catches" %}
            AND occ.is_catch 
        {% endif %}
        {% if records_type == "observations" %}
            AND NOT occ.is_catch 
        {% endif %}
        {% if area_ids %}
            AND ST_Within(occ.location, areas.mpoly)
        {% endif %}
    )
"""
).substitute(
    areas_table_name=AREAS_TABLE_NAME,
    occurrences_table_name=OCCURRENCES_TABLE_NAME,
    date_format=DB_DATE_EXCHANGE_FORMAT_POSTGRES,
)

JINJASQL_FRAGMENT_AGGREGATED_HEX_GRID = Template(
    """
    SELECT COUNT(*), hexes.geom
                    FROM
                        ST_HexagonGrid(
                            {{ hex_size_meters }},
                            {% if grid_extent_viewport %}
                                ST_TileEnvelope({{ zoom }}, {{ x }}, {{ y }})
                            {% else %}
                                ST_SetSRID(ST_EstimatedExtent('$occurrences_table_name', '$occurrences_field_name_point'), 3857)
                            {% endif %} 
                        ) AS hexes
                    INNER JOIN ($jinjasql_fragment_filter_occurrences)
                    AS dashboard_filtered_occ

                    ON ST_Intersects(dashboard_filtered_occ.$occurrences_field_name_point, hexes.geom)
                    GROUP BY hexes.geom
"""
).substitute(
    occurrences_table_name=OCCURRENCES_TABLE_NAME,
    occurrences_field_name_point=OCCURRENCES_FIELD_NAME_POINT,
    jinjasql_fragment_filter_occurrences=JINJASQL_FRAGMENT_FILTER_OCCURRENCES,
)


def occurrence_min_max_in_hex_grid(request):
    """Return the min, max occurrences count per hexagon, according to the zoom level. JSON format.

    This can be useful to dynamically color the grid according to the occurrence count
    """
    zoom = extract_int_request(request, "zoom")
    (
        dataset_id,
        species_id,
        start_date,
        end_date,
        records_type,
        area_ids,
    ) = filters_from_request(request)

    sql_template = readable_string(
        Template(
            """
    WITH grid AS ($jinjasql_fragment_aggregated_hex_grid)
    SELECT MIN(count), MAX(count) FROM grid;
    """
        ).substitute(
            jinjasql_fragment_aggregated_hex_grid=JINJASQL_FRAGMENT_AGGREGATED_HEX_GRID
        )
    )

    sql_params = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
        "grid_extent_viewport": False,
        "dataset_id": dataset_id,
        "species_id": species_id,
        "area_ids": area_ids,
        "records_type": records_type,
    }

    if start_date:
        sql_params["start_date"] = start_date.strftime(DB_DATE_EXCHANGE_FORMAT_PYTHON)
    if end_date:
        sql_params["end_date"] = end_date.strftime(DB_DATE_EXCHANGE_FORMAT_PYTHON)

    j = JinjaSql()
    query, bind_params = j.prepare_query(sql_template, sql_params)
    with connection.cursor() as cursor:
        cursor.execute(query, bind_params)
        r = cursor.fetchone()
        return JsonResponse({"min": r[0], "max": r[1]})


def mvt_tiles_hex_aggregated_occurrence(request, zoom, x, y):
    """Tile server, showing occurrences aggregated by hexagon squares. Filters are honoured."""
    (
        dataset_id,
        species_id,
        start_date,
        end_date,
        records_type,
        area_ids,
    ) = filters_from_request(request)

    sql_template = readable_string(
        Template(
            """
        WITH grid AS ($jinjasql_fragment_aggregated_hex_grid),
             mvtgeom AS (SELECT ST_AsMVTGeom(geom, ST_TileEnvelope({{ zoom }}, {{ x }}, {{ y }})) AS geom, count FROM grid)
        SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;
    """
        ).substitute(
            jinjasql_fragment_aggregated_hex_grid=JINJASQL_FRAGMENT_AGGREGATED_HEX_GRID
        )
    )

    sql_params = {
        "hex_size_meters": ZOOM_TO_HEX_SIZE[zoom],
        "grid_extent_viewport": True,
        "dataset_id": dataset_id,
        "species_id": species_id,
        "area_ids": area_ids,
        "records_type": records_type,
        "zoom": zoom,
        "x": x,
        "y": y,
    }

    if start_date:
        sql_params["start_date"] = start_date.strftime(DB_DATE_EXCHANGE_FORMAT_PYTHON)
    if end_date:
        sql_params["end_date"] = end_date.strftime(DB_DATE_EXCHANGE_FORMAT_PYTHON)

    return HttpResponse(
        _mvt_query_data(sql_template, sql_params),
        content_type="application/vnd.mapbox-vector-tile",
    )


JINJASQL_FRAGMENT_AGGREGATED_WATER_GRID = Template(
    """
    SELECT count(*) AS rats_score, squares.mpoly AS geom, squares.waterway_length_in_meters AS water_score
    FROM (
        SELECT mpoly, waterway_length_in_meters
        FROM dashboard_fishnetsquare
        WHERE mpoly && ST_TileEnvelope({{ zoom }}, {{ x }}, {{ y }})
    ) AS squares
    INNER JOIN (
        $jinjasql_fragment_filter_occurrences
    ) AS filtered_occurrences
    ON ST_Intersects(filtered_occurrences.location, squares.mpoly)
    GROUP BY squares.mpoly, squares.waterway_length_in_meters
"""
).substitute(
    jinjasql_fragment_filter_occurrences=JINJASQL_FRAGMENT_FILTER_OCCURRENCES,
)


@cache_page(60 * 60)
def mvt_tiles_occurrences_for_water(request, zoom, x, y):
    (
        dataset_id,
        species_id,
        start_date,
        end_date,
        records_type,
        area_ids,
    ) = filters_from_request(request)

    sql_template = readable_string(
        Template(
            """
        WITH 
            grid AS ($jinjasql_fragment_aggregated_water_grid),
            mvtgeom AS (SELECT ST_AsMVTGeom(geom, ST_TileEnvelope({{ zoom }}, {{ x }}, {{ y }})) AS geom, rats_score, water_score FROM grid)
        SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;
    """
        ).substitute(
            jinjasql_fragment_aggregated_water_grid=JINJASQL_FRAGMENT_AGGREGATED_WATER_GRID
        )
    )

    sql_params = {
        "dataset_id": dataset_id,
        "species_id": species_id,
        "area_ids": area_ids,
        "records_type": records_type,
        "zoom": zoom,
        "x": x,
        "y": y,
    }

    if start_date:
        sql_params["start_date"] = start_date.strftime(DB_DATE_EXCHANGE_FORMAT_PYTHON)
    if end_date:
        sql_params["end_date"] = end_date.strftime(DB_DATE_EXCHANGE_FORMAT_PYTHON)

    return HttpResponse(
        _mvt_query_data(sql_template, sql_params),
        content_type="application/vnd.mapbox-vector-tile",
    )


def _mvt_query_data(sql_template, sql_params):
    """Return binary data for the SQL query defined by sql_template and sql_params.

    Only for queries that returns a binary MVT (i.e. starts with "ST_AsMVT")"""
    j = JinjaSql()
    query, bind_params = j.prepare_query(sql_template, sql_params)

    with connection.cursor() as cursor:
        cursor.execute(query, bind_params)
        if cursor.rowcount != 0:
            data = cursor.fetchone()[0].tobytes()
        else:
            data = ""
        return data
