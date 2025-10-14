from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Validate that the usecase table has the correct schema (no deprecated columns)'

    def handle(self, *args, **options):
        """
        Validate the table schema to ensure no deprecated columns exist.
        """
        self.stdout.write("🔍 Validating usecase table schema...")
        
        try:
            with connection.cursor() as cursor:
                # Get all columns in the table
                cursor.execute("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'usecase'
                    ORDER BY ordinal_position
                """)
                
                columns = [row[0] for row in cursor.fetchall()]
                
                # Check for deprecated columns
                deprecated_columns = ['molecules_used', 'atoms_in_molecules']
                found_deprecated = [col for col in columns if col in deprecated_columns]
                
                if found_deprecated:
                    self.stdout.write(
                        self.style.ERROR(
                            f"❌ Found deprecated columns: {found_deprecated}"
                        )
                    )
                    self.stdout.write(
                        self.style.WARNING(
                            "Run 'python manage.py remove_columns' to fix this."
                        )
                    )
                    return False
                
                # Check for required columns
                required_columns = ['id', 'name', 'slug', 'description', 'molecules', 'atoms', 'created_at', 'updated_at']
                missing_columns = [col for col in required_columns if col not in columns]
                
                if missing_columns:
                    self.stdout.write(
                        self.style.ERROR(
                            f"❌ Missing required columns: {missing_columns}"
                        )
                    )
                    return False
                
                # Success
                self.stdout.write(
                    self.style.SUCCESS("✅ Schema validation passed!")
                )
                self.stdout.write(f"📊 Found {len(columns)} columns:")
                for col in columns:
                    self.stdout.write(f"  - {col}")
                
                return True
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Schema validation failed: {str(e)}")
            )
            return False
