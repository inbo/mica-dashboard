import csv
import math
from datetime import datetime

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import cache_page
from django.db import connection

from jinjasql import JinjaSql

from .documents import OccurrenceDocument
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


# Tile coordinate to bounding box, from https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Python
def num2deg(xtile, ytile, zoom):
    """This returns the NW-corner of the square. Use the function with xtile+1 and/or ytile+1 to get the other corners. With xtile+0.5 & ytile+0.5 it will return the center of the tile."""
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)

    return (lat_deg, lon_deg)

# newvalue= (max'-min')/(max-min)*(value-max)+max'
def linear_scale(min, max, min1, max1, val):
    return (max1 - min1) / (max - min) * (val - max) + max1

MIN_ZOOM_LEVEL = 0
MAX_ZOOM_LEVEL = 22
MIN_GEOHASH_LENGTH = 1
MAX_GEOHASH_LENGTH = 8


def mvt_tiles(request, zoom, x, y):
    zoom_to_hex_size = {
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

    template = """
            WITH grid AS (
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
            )   

            ,mvtgeom AS (
                SELECT ST_AsMVTGeom(geom, TileBBox({{ zoom }}, {{ x }}, {{ y }}, 3857)) AS geom, count FROM grid
            )

            SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;
            """

    template = ' '.join(template.replace('\n', '').split())  # Remove multiple withespaces and \n for easier inspection

    data = {
        "hex_size_meters": zoom_to_hex_size[zoom],
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


def old_mvt_tiles(request, zoom, x, y):
    tile_topleft = num2deg(x, y, zoom)
    tile_bottomright = num2deg(x + 1, y + 1, zoom)

    zoom_to_precision = {
        4: 3,
        5: 4,
        6: 4,
        7: 4,
        8: 5,
        9: 5,
        10: 6,
        11: 6,
        12: 6,
        13: 7,
        14: 7
    }

    #geohash_precision = math.floor(linear_scale(MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL, MIN_GEOHASH_LENGTH, MAX_GEOHASH_LENGTH, zoom))
    geohash_precision = zoom_to_precision[zoom]
    print(f"Zoom: {zoom}, precision: {geohash_precision}")

    es_response = OccurrenceDocument.search().from_dict({
        "aggs": {
            "zoomedin": {
                "filter": {
                    "geo_bounding_box": {
                        "location": {
                            "top_left": f"{tile_topleft[0]}, {tile_topleft[1]}",
                            "bottom_right": f"{tile_bottomright[0]}, {tile_bottomright[1]}",
                        }
                    }
                },
                "aggs": {
                    "zoom1": {
                        "geohash_grid": {
                            "field": "location",
                            "precision": geohash_precision
                        }
                    }
                }
            }
        }
    }).execute()

    cursor = connection.cursor()
    j = JinjaSql()

    # template = """
    #     SELECT ST_AsMVT(mvtgeom.*) FROM (
    #         SELECT ST_AsMVTGeom(
    #             ST_Union(ARRAY[{% for geocode in geocodes %}st_pointfromgeohash({{ geocode }}){% if not loop.last %},{% endif %} {% endfor %}]::geometry[]),
    #             TileBBox({{ zoom }}, {{ x }}, {{ y }}, 4326)
    #         ) AS geom, 1436::int AS "count") mvtgeom
    # """
    #
    # data = {
    #     "zoom": zoom,
    #     "geocodes": [bucket['key'] for bucket in es_response.aggregations.zoomedin.zoom1.buckets],
    #     "x": x,
    #     "y": y
    # }
    if len(es_response.aggregations.zoomedin.zoom1.buckets) > 0:
        template = """
        WITH points AS (
            SELECT * FROM (VALUES
                                  {% for bucket in buckets %}
                                    (st_pointfromgeohash({{ bucket.key }}), {{ bucket.doc_count }})
                                  {% if not loop.last %},{% endif %}
                                  {% endfor %}
                                ) AS t (geom, count)
        )
    
        ,mvtgeom AS (
            SELECT ST_AsMVTGeom(geom, TileBBox({{ zoom }}, {{ x }}, {{ y }}, 4326)) AS geom, count FROM points
        )
    
        SELECT st_asmvt(mvtgeom.*) FROM mvtgeom;
        """

        data = {
             "zoom": zoom,
             "buckets": es_response.aggregations.zoomedin.zoom1.buckets,
             "x": x,
             "y": y
        }

        query, bind_params = j.prepare_query(template, data)
        cursor.execute(query, bind_params)
        row = cursor.fetchone()
        return HttpResponse(row[0].tobytes(), content_type='application/vnd.mapbox-vector-tile')
    else:
        return HttpResponse('', content_type='application/vnd.mapbox-vector-tile')

    # TODO: tile boundaries
    # TODO: filtering
    # TODO: better geohash/zoom level combination
    # TODO: better circle size

    # Old code: keep for reference?
    # stunion_params = ','.join([f"st_pointfromgeohash('{bucket['key']}')" for bucket in es_response.aggregations.zoomedin.zoom1.buckets])
    #
    # cursor.execute(
    #     f"""SELECT ST_AsMVT(mvtgeom.*) FROM (
    #         SELECT ST_AsMVTGeom(
    #             ST_Union({stunion_params}),
    #             TileBBox(%s, %s, %s, 4326)
    #         ) AS geom, 1436::int AS "count") mvtgeom""",
    #     [zoom, x, y])
    # st_astext(ST_Union(st_pointfromgeohash('gbsuv'), st_pointfromgeohash('gbsuw')))


    # vt = vector_tile_base.VectorTile()
    # layer = vt.add_layer('my_occurrences', version=2)
    #
    # for i, bucket in enumerate(response.aggregations.zoomedin.zoom1.buckets):
    #     geohash = bucket['key']  # geohash
    #     occurrences_count = bucket['doc_count']  # number of occurrences
    #     lat, lon = pgh.decode(geohash) # 4326
    #
    #     lon_3857, lat_3857 = TRAN_4326_TO_3857.transform(lon, lat)
    #
    #     feature = layer.add_point_feature()
    #     feature.id = i
    #     #feature.add_points([lat_3857, lon_3857])
    #     feature.add_points([10, 10])
    #     feature.attributes = {'occurrences_count': occurrences_count}
    #
    # return HttpResponse(vt.serialize(), content_type='application/vnd.mapbox-vector-tile')