from rest_framework import serializers
from .models import Note


class NoteSerializer(serializers.ModelSerializer):
    """
    Serializes Note to/from the camelCase JSON shape the React frontend expects.
    Encryption binary fields are never sent to the client.
    """

    # camelCase output fields mapped from snake_case model fields
    dateModified = serializers.DateTimeField(source="date_modified")
    parentFolderId = serializers.IntegerField(
        source="parent_folder_id", allow_null=True, required=False
    )
    visibleTitle = serializers.CharField(
        source="visible_title", allow_null=True, required=False
    )
    previewContent = serializers.CharField(
        source="preview_content", allow_null=True, required=False, read_only=True
    )
    isOpen = serializers.BooleanField(source="is_open", required=False)
    caretPosition = serializers.IntegerField(
        source="caret_position", allow_null=True, required=False
    )
    type = serializers.CharField(source="item_type", required=False)

    class Meta:
        model = Note
        fields = [
            "id",
            "content",
            "dateModified",
            "pinned",
            "locked",
            "encrypted",
            "type",
            "parentFolderId",
            "visibleTitle",
            "previewContent",
            "isOpen",
            "caretPosition",
        ]

    def create(self, validated_data):
        # user is injected by the view
        return Note.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
