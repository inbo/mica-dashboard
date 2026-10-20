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

## AWS ECS

The `Dockerfile` builds the production image. It uses `mica/settings_docker.py`, which reads all
environment-specific settings from environment variables (`SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `GBIF_USERNAME`, `GBIF_PASSWORD`).
The infrastructure lives in [inbo-aws-mica-terraform](https://github.com/inbo/inbo-aws-mica-terraform).

- Every push to `main` builds an image and deploys it on UAT (`.github/workflows/deploy_ecs_uat.yml`).
- The workflow *Deploy on PROD (AWS ECS)* deploys an image that was built for UAT on production.

## Classic

This project can be deployed as a classic Django project, without Docker(-compose)

1) Copy `mica/settings_local.template.py` to `mica/settings_local.py` and customize your local settings there.

# After upgrading requirements.txt

$ docker-compose up --build
