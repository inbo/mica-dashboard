# Generated by Django 3.2.12 on 2022-03-08 10:32

import django.contrib.gis.db.models.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dashboard', '0008_drop_unused_function'),
    ]

    operations = [
        migrations.CreateModel(
            name='Area',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mpoly', django.contrib.gis.db.models.fields.MultiPolygonField(srid=3857)),
                ('name', models.CharField(max_length=255)),
            ],
        ),
    ]
