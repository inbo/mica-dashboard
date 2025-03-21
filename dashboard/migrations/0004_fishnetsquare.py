# Generated by Django 3.2.12 on 2022-12-12 10:25

import django.contrib.gis.db.models.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dashboard', '0003_alter_area_options'),
    ]

    operations = [
        migrations.CreateModel(
            name='FishnetSquare',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mpoly', django.contrib.gis.db.models.fields.MultiPolygonField(srid=3857)),
                ('waterway_length_in_meters', models.FloatField()),
            ],
        ),
    ]
