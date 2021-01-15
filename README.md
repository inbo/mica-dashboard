# GeoDjango project to implement the MICA dashboard

Developed using docker-compose.

# Howto:

Launch the app:

    $ docker-compose up

Run management command:

    $ docker-compose run web python manage.py <DJANGO_COMMAND>

# TODO:

For the moment I can't get PyCharm run configuration to work (ignore the new es
entry in docker-compose), so let's just run it with:

It's starting to work, we can now query in a browser:
http://localhost:9200/occurrences/_search?q=date:2001-11-09

Query per grid:
curl -X GET "localhost:9200/occurrences/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "large_grid": {
      "geotile_grid": {
        "field": "location", "precision": 8
      }
    }
  }
}
'


$ docker-compose up

Interesting project to do the clustering with just postgres?: https://github.com/chargetrip/clusterbuster


https://cors-anywhere.herokuapp.com/https://cc42aed8cd44.ngrok.io/api/tiles/7/64/42.mvt

- Too much code duplication in filters (species + dataset), refactor
- Source dataset select: show number of available occurrences
- Optimize postgres for reads (https://dba.stackexchange.com/questions/42290/configuring-postgresql-for-read-performance)?


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