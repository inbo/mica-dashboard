"""mica URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include

from dashboard import views

urlpatterns = [
    path("", views.index, name="dashboard-index"),
    path(
        "api/occurrences_json/",
        views.occurrences_json,
        name="dashboard-api-occurrences-json",
    ),
    path(
        "api/available_areas/",
        views.areas_list_json,
        name="dashboard-api-available-areas",
    ),
    path(
        "api/available_datasets/",
        views.available_datasets,
        name="dashboard-api-available-datasets",
    ),
    path(
        "api/available_species/",
        views.available_species,
        name="dashboard-api-available-species",
    ),
    path(
        "api/available_years_biodiversity_index/",
        views.available_years_biodiversity_index_json,
        name="dashboard-api-available-years-biodiversity-index",
    ),
    path(
        "api/available_groups_biodiversity_index/",
        views.available_groups_biodiversity_index_json,
        name="dashboard-api-available-groups-biodiversity-index",
    ),
    path(
        "api/occurrences_count/",
        views.occurrences_counter,
        name="dashboard-api-occurrences-counter",
    ),
    path(
        "api/occurences_monthly_count/",
        views.occurrences_monthly_histogram,
        name="dashboard-api-occurrences-monthly-count",
    ),
    path("api/area/<int:id>", views.area_geojson, name="dashboard-api-area-geojson"),
    path(
        "api/tiles/<int:zoom>/<int:x>/<int:y>.mvt",
        views.mvt_tiles_occurrences,
        name="dashboard-api-mvt-tiles-occurrences-simple",
    ),
    path(
        "api/tiles_hex_aggregated/<int:zoom>/<int:x>/<int:y>.mvt",
        views.mvt_tiles_hex_aggregated_occurrences,
        name="dashboard-api-mvt-tiles-occurrences-hex",
    ),
    path(
        "api/tiles_occurrences_for_water/<int:zoom>/<int:x>/<int:y>.mvt",
        views.mvt_tiles_occurrences_for_water,
        name="dashboard-api-mvt-tiles-occurrences-water",
    ),
    path(
        "api/tiles_areas/<int:zoom>/<int:x>/<int:y>.mvt",
        views.mvt_tiles_areas,
        name="dashboard-api-mvt-tiles-areas",
    ),
    path(
        "api/occ_min_max_in_grid/",
        views.occurrence_min_max_in_hex_grid,
        name="dashboard-api-min-max-in-grid",
    ),
    path("admin/", admin.site.urls),
    path("__debug__/", include("debug_toolbar.urls")),
]
