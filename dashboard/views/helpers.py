"""Various helper functions for MICA views"""
from datetime import datetime

from dashboard.models import Occurrence


def readable_string(input_string: str) -> str:
    """Remove multiple whitespaces and \n to make a long string more readable"""
    return " ".join(input_string.replace("\n", "").split())


def extract_int_request(request, param_name) -> int:
    """Returns an integer, or None if the parameter doesn't exist or is 'null'"""
    val = extract_string_request(request, param_name)
    if val is None:
        return None
    else:
        return int(val)


def extract_string_request(request, param_name: str) -> str:
    val = request.GET.get(param_name, None)
    if val == "" or val == "null" or val is None:
        return None

    return val


def extract_date_request(request, param_name, date_format="%Y-%m-%d"):
    """Return a datetime.date object (or None is the param doesn't exist or is empty)

    format: see https://docs.python.org/3/library/datetime.html#strftime-and-strptime-behavior
    """
    val = request.GET.get(param_name, None)

    if val is not None and val != "":
        return datetime.strptime(val, date_format).date()

    return None


def request_to_occurrences_qs(request):
    """Takes a request, extract common parameters used to filter occurrences and return a corresponding QuerySet"""
    qs = Occurrence.objects.all()

    dataset_id, species_id, start_date, end_date, records_type = filters_from_request(
        request
    )

    # !! IMPORTANT !! Make sure the occurrence filtering here is equivalent to what's done in
    # views.tileserver.JINJASQL_FRAGMENT_FILTER_OCCURRENCES. Otherwise, occurrences returned on the map and on other
    # components (table, ...) will be inconsistent.
    if dataset_id:
        qs = qs.filter(source_dataset_id=dataset_id)
    if species_id:
        qs = qs.filter(species_id=species_id)
    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)
    if records_type is not None:
        if records_type == "catches":
            qs = qs.filter(is_catch=True)
        else:
            qs = qs.filter(is_catch=False)

    return qs


def filters_from_request(request):
    dataset_id = extract_int_request(request, "datasetId")
    species_id = extract_int_request(request, "speciesId")
    start_date = extract_date_request(request, "startDate")
    end_date = extract_date_request(request, "endDate")
    records_type = extract_string_request(request, "recordsType")

    return dataset_id, species_id, start_date, end_date, records_type
