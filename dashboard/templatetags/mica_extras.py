from django import template
from django.urls import reverse

register = template.Library()


@register.simple_tag
def tile_server_url_template(url_name):
    return (
        reverse(url_name, kwargs={"zoom": 1, "x": 2, "y": 3})
        .replace("1", "{z}")
        .replace("2", "{x}")
        .replace("3", "{y}")
    )
