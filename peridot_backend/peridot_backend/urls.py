"""
URL configuration for peridot_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path
from . import views # Import views from the current app

urlpatterns = [
    path("admin/", admin.site.urls),
    path('api/register/', views.register_user, name='register_user'),
    path('api/login/', views.login_user, name='login_user'),
    path('api/logout/', views.logout_user, name='logout_user'), # Optional logout endpoint
    path('api/check-auth/', views.check_auth_status, name='check_auth_status'),
    
    # Note sync endpoints
    path('api/notes/', views.notes_list, name='notes_list'),
    path('api/notes/<int:note_id>/', views.note_detail, name='note_detail'),
    path('api/storage/info/', views.storage_info, name='storage_info'),
]
