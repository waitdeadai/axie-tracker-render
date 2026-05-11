# Configuración de Discord OAuth2 para Producción

## Pasos para configurar Discord OAuth2 en producción

1. Accede al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications)

2. Selecciona tu aplicación existente o crea una nueva

3. En la sección "OAuth2", actualiza las siguientes configuraciones:

   - **Redirects**: Añade la URL de callback de producción:
     ```
     https://axie-mvp-backend.fly.dev/api/auth/discord/callback
     ```

   - Asegúrate de guardar los cambios

4. Copia el Client ID y Client Secret para usarlos en las variables de entorno de Fly.io

## Variables de entorno a configurar en Fly.io

```
DISCORD_CLIENT_ID=tu_client_id_aqui
DISCORD_CLIENT_SECRET=tu_client_secret_aqui
DISCORD_CALLBACK_URL=https://axie-mvp-backend.fly.dev/api/auth/discord/callback
SESSION_SECRET=genera_un_secreto_seguro_aqui
FRONTEND_URL=https://axie-mvp.vercel.app
ALLOWED_DISCORD_IDS=id1,id2,id3
CORS_ORIGIN=https://axie-mvp.vercel.app
```

## Notas importantes

- El `SESSION_SECRET` debe ser una cadena larga y aleatoria para seguridad
- `ALLOWED_DISCORD_IDS` debe contener los IDs de Discord de los usuarios autorizados
- `CORS_ORIGIN` debe coincidir exactamente con la URL donde se alojará el frontend
- Asegúrate de que la URL de callback en Discord coincida exactamente con `DISCORD_CALLBACK_URL`
