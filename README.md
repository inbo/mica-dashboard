# GeoDjango project to implement the MICA dashboard

Developed using docker-compose.

Deployed at the following URLs:

- Production: https://mica.inbo.be/
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
