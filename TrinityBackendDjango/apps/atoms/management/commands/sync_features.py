from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.conf import settings
from django.db import connection
from django.db.utils import OperationalError, ProgrammingError
from django_tenants.utils import get_tenant_model, schema_context
from apps.atoms.models import Atom, AtomCategory, AtomVersion
from pathlib import Path
import datetime

class Command(BaseCommand):
    help = "Sync Atom entries from FastAPI features directory"

    REQUIRED_TABLES = {
        "atoms_atom",
        "atoms_atomcategory",
        "atoms_atomversion",
    }

    def handle(self, *args, **options):
        # Ensure atoms are stored in the public schema even when called from a
        # tenant-aware context.
        try:
            connection.set_schema_to_public()
        except Exception:
            pass

        self._ensure_tables("public")

        # Verify each tenant schema also has the atoms tables, running
        # migrations for any that are missing them.
        TenantModel = get_tenant_model()
        for tenant in TenantModel.objects.all():
            self._ensure_tables(tenant.schema_name)

        # BASE_DIR may be ``/code`` inside Docker or the project directory when
        # running locally. The FastAPI features folder sits alongside the Django
        # backend.  Try both locations so the command works in either context.
        base = Path(settings.BASE_DIR)
        candidates = [
            base / "TrinityBackendFastAPI" / "app" / "features",
            base.parent / "TrinityBackendFastAPI" / "app" / "features",
        ]
        features_path = next((p for p in candidates if p.exists()), None)
        if not features_path:
            joined = ", ".join(str(p) for p in candidates)
            self.stderr.write(f"Features directory not found in: {joined}")
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

    def _ensure_tables(self, schema_name: str) -> None:
        """Make sure the atom tables exist for ``schema_name``."""
        with schema_context(schema_name):
            with connection.cursor() as cursor:
                existing = set(connection.introspection.table_names(cursor))
        if not self.REQUIRED_TABLES.issubset(existing):
            if schema_name == "public":
                self.stdout.write(
                    "Atom tables missing in public schema. Running shared migrations…"
                )
                call_command(
                    "migrate_schemas",
                    "--shared",
                    interactive=False,
                    verbosity=0,
                )
            else:
                self.stdout.write(
                    f"Atom tables missing in {schema_name}. Running migrations…"
                )
                call_command(
                    "migrate_schemas",
                    "--schema",
                    schema_name,
                    interactive=False,
                    verbosity=0,
                )
