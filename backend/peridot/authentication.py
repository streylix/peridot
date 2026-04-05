from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    Session auth without CSRF enforcement.
    CORS headers already restrict which origins can make requests,
    so CSRF is redundant for this API-only backend.
    """

    def enforce_csrf(self, request):
        return  # skip CSRF check
