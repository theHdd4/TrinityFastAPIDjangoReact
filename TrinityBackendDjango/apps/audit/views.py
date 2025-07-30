from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Revision
from .serializers import RevisionSerializer


class RevisionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    List and retrieve historical revisions; allows admin rollback.
    """
    queryset = Revision.objects.select_related("content_type").all()
    serializer_class = RevisionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Optionally filter by content_type model name and object_id via query params.
        """
        qs = super().get_queryset()
        ct = self.request.query_params.get("content_type")
        oid = self.request.query_params.get("object_id")
        if ct and oid:
            qs = qs.filter(content_type__model=ct, object_id=oid)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def rollback(self, request, pk=None):
        """
        Roll back the target object to this revision.
        """
        revision = self.get_object()
        obj = revision.content_object
        for field, value in revision.data.items():
            setattr(obj, field, value)
        obj.save()
        return Response({"status": "rolled back", "object": str(obj)})
