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

    def handle(self, *args, **options):
        # Ensure atoms are stored in the public schema even when called from a
        # tenant-aware context.
        try:
            connection.set_schema_to_public()
        except Exception:
            pass

        # Ensure the atoms tables exist in the public schema. If not, run the
        # shared migrations which create tables for all shared apps including
        # ``apps.atoms``.
        try:
            with schema_context("public"):
                Atom.objects.exists()
        except (ProgrammingError, OperationalError):
            self.stdout.write(
                "Atom tables missing in public schema. Running shared migrations…"
            )
            call_command(
                "migrate_schemas",
                "--shared",
                interactive=False,
                verbosity=0,
            )

        # Verify each tenant schema also has the atoms tables, running
        # migrations for any that are missing them.
        TenantModel = get_tenant_model()
        for tenant in TenantModel.objects.all():
            try:
                with schema_context(tenant.schema_name):
                    Atom.objects.exists()
            except (ProgrammingError, OperationalError):
                self.stdout.write(
                    f"Atom tables missing in {tenant.schema_name}. Running migrations…"
                )
                call_command(
                    "migrate_schemas",
                    "--schema",
                    tenant.schema_name,
                    interactive=False,
                    verbosity=0,
                )

        # BASE_DIR may be ``/code`` inside Docker or the project directory when
        # running locally. The FastAPI features folder sits alongside the Django
        # backend.  Try both locations so the command works in either context.
        base = Path(settings.BASE_DIR)
        features_path = (
            base / "TrinityBackendFastAPI" / "app" / "features"
        )
        if not features_path.exists():
            features_path = (
                base.parent / "TrinityBackendFastAPI" / "app" / "features"
            )
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
