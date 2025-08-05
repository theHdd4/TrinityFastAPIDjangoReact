from rest_framework import serializers
from .models import User, UserProfile


class UserSerializer(serializers.ModelSerializer):
    """Serializer for the custom User model with password handling."""

    password = serializers.CharField(write_only=True, required=False)
    allowed_apps = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False, default=list
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "mfa_enabled",
            "preferences",
            "is_staff",
            "allowed_apps",
        ]
        read_only_fields = ["id", "is_staff"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        allowed_apps = validated_data.pop("allowed_apps", None)
        user = User(**validated_data)
        if allowed_apps is not None:
            user._allowed_apps = allowed_apps
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserProfileSerializer(serializers.ModelSerializer):
    user = serializers.SlugRelatedField(
        slug_field="username", queryset=User.objects.all()
    )

    class Meta:
        model = UserProfile
        fields = ["id", "user", "bio", "avatar_url"]
        read_only_fields = ["id"]
