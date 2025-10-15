from django.db import models


class SignupList(models.Model):
    """
    Stores early access signup information from the landing page.
    """
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    institution_company = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'signup_list'
        ordering = ['-created_at']
        verbose_name = 'Signup'
        verbose_name_plural = 'Signups'

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email})"

