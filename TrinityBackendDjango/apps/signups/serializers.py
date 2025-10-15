from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import SignupList


class SignupListSerializer(serializers.ModelSerializer):
    """
    Serializer for SignupList model with custom unique email error message.
    """
    # Explicitly define email field with custom UniqueValidator message
    email = serializers.EmailField(
        validators=[
            UniqueValidator(
                queryset=SignupList.objects.all(),
                message='This email has already been registered. We will contact you soon.'
            )
        ]
    )
    
    class Meta:
        model = SignupList
        fields = ['id', 'first_name', 'last_name', 'email', 'institution_company', 'created_at']
        read_only_fields = ['id', 'created_at']

