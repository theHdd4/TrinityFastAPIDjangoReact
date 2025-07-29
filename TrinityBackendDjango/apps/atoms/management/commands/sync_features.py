from django.core.management.base import BaseCommand
from django.conf import settings
from apps.atoms.models import Atom, AtomCategory, AtomVersion
from pathlib import Path
import datetime

class Command(BaseCommand):
    help = "Sync Atom entries from FastAPI features directory"

    def handle(self, *args, **options):
        features_path = Path(settings.BASE_DIR).parent / "TrinityBackendFastAPI" / "app" / "features"
        if not features_path.exists():
            self.stderr.write(f"Features directory not found: {features_path}")
            return

        category, _ = AtomCategory.objects.get_or_create(name="General")
        created_count = 0

        for child in features_path.iterdir():
            if not child.is_dir() or child.name.startswith("__"):
                continue
            slug = child.name.replace("_", "-")
            name = child.name.replace("_", " ").title()
            atom, created = Atom.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "category": category}
            )
            if created:
                AtomVersion.objects.create(
                    atom=atom,
                    version="1.0",
                    release_date=datetime.date.today(),
                    config_schema={},
                    is_active=True,
                )
                created_count += 1
        self.stdout.write(self.style.SUCCESS(f"Synced {created_count} atoms"))
