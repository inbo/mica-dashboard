# Generated by Django 3.2.6 on 2021-09-03 07:04

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('dashboard', '0007_occurrence_dashboard_o_date_aea483_idx'),
    ]

    operations = [
        migrations.RunSQL("drop function if exists TileBBox(z int, x int, y int, srid int) restrict;")
    ]
