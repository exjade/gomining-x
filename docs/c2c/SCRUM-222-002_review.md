Pero encontrÃ© estos pendientes:
1. El runtime 82 NO usa un Firebase ID token real.
   El propio script hace:
   testFirebaseToken = 'mock_valid_firebase_admin_token_scrum222'
   y sustituye Firebase Admin mediante un verifyIdToken() mock. Luego mete esa cadena directamente en localStorage.
   Eso comprueba UI/HTTP contra un verifier simulado, pero no demuestra:
   Firebase Client Auth â†’ ID token real â†’ Firebase Admin verifyIdToken â†’ Backend.
   Esto era explÃ­citamente uno de los requisitos del comentario 10165.
2. TodavÃ­a existe una sesiÃ³n fantasma inmediatamente despuÃ©s del login.
   AuthScreen llama directamente a onLogin(user, token) cuando Firebase, backend o incluso el vault local dicen Ã©xito.
   Y App.handleLogin() hace inmediatamente:
   setCurrentUser(user) â†’ guarda token â†’ abre dashboard.
   No llama /api/auth/me antes de mostrar el Admin.
   El check de /api/auth/me que agregaron es un useEffect de montaje; no se vuelve a ejecutar al hacer login.
   Consecuencia: un Firebase user vÃ¡lido pero no incluido en la allowlist puede entrar visualmente al dashboard hasta que alguna request protegida produzca un 401. Peor aÃºn, el fallback local/offline tambiÃ©n puede abrir el dashboard con un token que el backend jamÃ¡s aceptarÃ­a.
   Para SCRUM-222 la regla debe ser:
   login produce token â†’ /api/auth/me valida token â†’ reciÃ©n entonces setCurrentUser/serverUser.
3. El gate de sessionToken sigue teniendo un escape en producciÃ³n.
   isLocalDevSessionAllowed() evalÃºa:
   ALLOW_DEV_LOCAL_SESSION_TOKEN === 'true'
   antes de comprobar NODE_ENV === 'production'.
   Por tanto, si producciÃ³n tiene esa variable en true, el sessionToken legacy vuelve a quedar permitido. El contrato que acordamos era mÃ¡s fuerte: producciÃ³n siempre Firebase-only.
   AdemÃ¡s /api/auth/register sigue generando y entregando sess_* sin pasar por ese guard. Se gateÃ³ /api/auth/login, pero no toda la emisiÃ³n de sesiones legacy.
   Y el fallback local deberÃ­a exigir tambiÃ©n un registro Admin aprobado, no aceptar cualquier users.json.sessionToken.
4. Falta git diff --check en C2C.
   Los outputs de esta iteraciÃ³n son 80/81/82: test, build y runtime. No existe todavÃ­a el output legible de git diff --check, aunque estÃ¡ en los criterios de SCRUM-222
