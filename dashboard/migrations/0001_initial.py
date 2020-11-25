# Generated by Django 3.1.3 on 2020-11-25 09:19

import django.contrib.gis.db.models.fields
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Dataset',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('gbif_id', models.CharField(max_length=100, unique=True)),
                ('contains_catches', models.BooleanField()),
            ],
        ),
        migrations.CreateModel(
            name='Species',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
            ],
        ),
        migrations.CreateModel(
            name='Occurrence',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('gbif_id', models.CharField(max_length=100, unique=True)),
                ('individual_count', models.IntegerField(default=1)),
                ('date', models.DateField()),
                ('location', django.contrib.gis.db.models.fields.PointField(srid=4326)),
                ('source_dataset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='dashboard.dataset')),
                ('species', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='dashboard.species')),
            ],
        ),
    ]