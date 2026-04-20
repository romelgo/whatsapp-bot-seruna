# API de Notificaciones por WhatsApp (whatsapp-bot)

Este directorio contiene un microservicio en **Node.js** que actúa como un bot para enviar mensajes de WhatsApp de forma automatizada mediante la librería `@whiskeysockets/baileys`. 

La principal función de este módulo es reemplazar servicios de terceros costosos (como Twilio), implementando una integración de WhatsApp Web local que permite comunicarse con los usuarios.

## ⚙️ Funcionamiento Principal

El servicio se conecta a los servidores de WhatsApp simulando ser un dispositivo en WhatsApp Web.

1. **Autenticación mediante QR:** Al iniciar el servicio, en caso de no contar con una sesión activa, se muestra un código QR en la consola. Este debe ser escaneado con la cuenta de WhatsApp desde el teléfono del administrador.
2. **Persistencia de sesión:** Las credenciales que devuelven los servidores se guardan automáticamente en la carpeta local `baileys_auth_info`. Los posteriores reinicios cargarán esta sesión, omitiendo la necesidad de escanear el QR nuevamente.
3. **Reconexión Automática:** El sistema cuenta con mecanismos para reconectarse automáticamente si la conexión de sockets se interrumpe (salvo que la desconexión ocurra por un "cierre de sesión explícito" del usuario).

## 🚀 API HTTP

Este microservicio levanta automáticamente un servidor web con **Express.js** disponible en el puerto `3001` (por defecto) en donde escucha solicitudes provenientes del backend principal.

### `POST /send`

Este endpoint permite enviar mensajes de texto o imágenes de forma unificada.

**Parámetros permitidos en el body (JSON):**

*   `number` (String - Requerido): El número de teléfono celular de destino.
    *   *Nota:* Como asume que la mayoría de números sin código de país son peruanos, si se envía un número de 9 dígitos le agrega automáticamente el prefijo `51`.
*   `message` (String - Requerido): El texto del mensaje que se va a enviar (funciona como *caption* si también se envía una imagen).
*   `media_url` (String - Opcional): La URL de una imagen para enviar. Si este campo se incluye, el bot envía la imagen adjunta en vez de tan solo un simple mensaje de texto.

**Ejemplo de Petición HTTP:**

```json
{
  "number": "987654321",
  "message": "Hola. Tu asistencia a las 08:00 AM fue confirmada.",
  "media_url": "https://midominio.com/asistencia.jpg"
}
```

## 🛠️ Tecnologías Empleadas

*   **@whiskeysockets/baileys**: Librería muy popular y ligera para manejar la conexión de WhatsApp Web, sin depender de navegadores *headless* (tipo Puppeteer).
```
npm install @whiskeysockets/baileys
```
*   **Express & Body Parser**: Para levantar el servidor local y abstraer fácilmente la interpretación en JSON del Body.
*   **qrcode-terminal**: Utilidad fundamental que sirve para renderizar de manera visual el código de autenticación en la misma terminal.
*   **pino**: Herramienta de registros de log configurada para reducir el ruido en consola solo a errores críticos de la librería *baileys*.
