# Configuración de Discord OAuth2 para Render

## Pasos para configurar Discord OAuth2 en Render

1. Accede al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications)

2. Selecciona tu aplicación existente o crea una nueva

3. En la sección "OAuth2", actualiza las siguientes configuraciones:

   - **Redirects**: Añade la URL de callback de producción:
     ```
     https://axie-mvp-backend.onrender.com/api/auth/discord/callback
     ```
     
     Nota: Reemplaza `axie-mvp-backend` con el nombre de tu servicio en Render si es diferente.

   - Asegúrate de guardar los cambios

4. Copia el Client ID y Client Secret para usarlos en las variables de entorno de Render

## Variables de entorno a configurar en Render

Estas variables se configurarán automáticamente a través del archivo `render.yaml`, pero necesitarás proporcionar los valores para:

```
DISCORD_CLIENT_ID=tu_client_id_aqui
DISCORD_CLIENT_SECRET=tu_client_secret_aqui
ALLOWED_DISCORD_IDS=id1,id2,id3
```

## Notas importantes

- El `SESSION_SECRET` se generará automáticamente por Render
- `DISCORD_CALLBACK_URL` se configurará automáticamente basado en la URL de tu servicio
- `CORS_ORIGIN` se configurará automáticamente para permitir solicitudes desde tu frontend
- Asegúrate de que la URL de callback en Discord coincida exactamente con la URL de tu servicio en Render

## Verificación

Una vez desplegado, puedes verificar que la autenticación funcione correctamente accediendo a:

```
https://axie-mvp-frontend.onrender.com
```

Deberías ver la pantalla de login con Discord y poder autenticarte si tu ID está en la lista de permitidos.
