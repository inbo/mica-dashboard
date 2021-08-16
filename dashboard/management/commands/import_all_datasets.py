from django.conf import settings
from django.core import management
from django.core.management import BaseCommand


class Command(BaseCommand):
    help = '(re)import all datasets referenced in the settings'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force_download',
            action='store_true',
            help='Download the dataset, even if a file already exists for it in settings.DATASET_TEMPORARY_DIR',
        )

    def handle(self, *args, **options):
        self.stdout.write("We'll (re)import all datasets")
        for entry in settings.DATASET_CONFIG:
            management.call_command('import_dataset',
                                    entry['gbif_id'],
                                    force_download=options['force_download'])