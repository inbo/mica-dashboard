# GeoDjango project to implement the MICA dashboard

Developed using docker-compose.

# Howto:

Launch the app:

    $ docker-compose up

Run management command:

    $ docker-compose run web python manage.py <DJANGO_COMMAND>

# TODO:
- Adapt docker-compose configuration for production:
    - add nginx
    - replace dev server by gunicorn
    - different settings per environment (prod VS dev)? Manage specific settings (SECRET_KEY)?
    - is the dbdata volume a good solution to store data in prod?
    - where to deploy easily?
    
- Data questions and assumptions to clarify:
    - You mention filtering by area, how would that work (list of zones with a name, polygon drawn on map, ... in all cases the filtering is done on the lat/lon field)
    - organisation/dataset relationship: always one dataset per organisation and one organisation per dataset or is it more subtle than that? (I have a publisher - INBO and Owner - VMM listed in the dataset, use that?)
    - project boundaries: is this also dataset specific? Each dataset has a specific boundary file? Is it related to "filter by area"?
    - Should we manage absence or just presence?