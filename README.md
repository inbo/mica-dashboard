# GeoDjango project to implement the MICA dashboard

Developed using docker-compose.

Deployed at the following URLs:

- UAT version: http://mica-uat.inbo.be/

# Howto:

Launch the app:

    $ docker-compose up

Run management command:

    $ docker-compose run web python manage.py <DJANGO_COMMAND>

# Deployment

This project can be deployed as a classic Django project, without Docker(-compose)

1) Copy `mica/settings_local.template.py` to `mica/settings_local.py` and customize your local settings there.

# After upgrading requirements.txt

$ docker-compose up --build

# TODO:
- Occurrence table: add link to GBIF (dataset, occurrence)
- Occurrence table: show specific occurrence on Map
- Hexagons density map: swithc to individual occurrences at high zoom level
- Find a way to implement a heatmap(smaller squares + good color scale + blur?)
- Map: reimplement other modes (WebGL heatmap, individual points, client clusters, ...) when the number of occurrences is reasonable?

- Too much code duplication in filters (species + dataset), refactor
- Source dataset select: show number of available occurrences


- table view: add first/last button

    
- Data questions and assumptions to clarify:
    - Some datasets haves tons of species: filter on import for just the two species of interest?
    - You mention filtering by area, how would that work (list of zones with a name, polygon drawn on map, ... in all cases the filtering is done on the lat/lon field)
    - organisation/dataset relationship: always one dataset per organisation and one organisation per dataset or is it more subtle than that? (I have a publisher - INBO and Owner - VMM listed in the dataset, use that?)
    - project boundaries: is this also dataset specific? Each dataset has a specific boundary file? Is it related to "filter by area"?
    - Should we manage absence or just presence?