# Análisis del Microservicio: WhatsApp Bot

## 1. Resumen General
El directorio `whatsapp-bot` contiene un microservicio desarrollado en **Node.js** diseñado para enviar mensajes y notificaciones automáticas a través de WhatsApp. Actúa como un puente entre el backend principal de la academia y los usuarios (estudiantes/administradores), evitando el uso de APIs de terceros costosas (como Twilio o la API oficial de WhatsApp) al implementar una conexión directa a WhatsApp Web.

## 2. Tecnologías Principales
* **Node.js (ES Modules)**: Entorno de ejecución principal (usando `type: "module"`).
* **@whiskeysockets/baileys (v7.0.0-rc.9)**: Librería central del proyecto. Se encarga de manejar la conexión mediante WebSockets con los servidores de WhatsApp, sin necesidad de usar un navegador *headless* (lo que lo hace muy ligero y rápido).
* **Express.js & body-parser**: Framework utilizado para levantar un servidor HTTP interno y procesar las peticiones en formato JSON.
* **qrcode-terminal**: Utilidad para generar el código QR de inicio de sesión directamente en la consola/terminal.
* **Pino**: Librería de registro (logging) de alta velocidad, configurada para mostrar solo errores críticos.

## 3. Arquitectura y Flujo de Trabajo

### A. Autenticación y Conexión (`index.js` - `connectToWhatsApp`)
1. El bot utiliza la función `useMultiFileAuthState` para manejar las sesiones.
2. Al iniciar por primera vez, genera un código QR en la consola que un administrador debe escanear con la app de WhatsApp.
3. Una vez escaneado, la sesión y las claves criptográficas se guardan en el directorio local `baileys_auth_info`.
4. En futuros reinicios, el bot lee esta carpeta y se reconecta automáticamente sin pedir un nuevo QR.
5. Existe una lógica de reconexión automática en caso de pérdida de red (excepto si el usuario cierra sesión explícitamente desde su teléfono).

### B. Servidor HTTP (API REST)
El servicio levanta un servidor Express en el puerto `3001` (o el que defina `process.env.PORT`).

#### Endpoint: `POST /send`
Este es el único punto de entrada (endpoint) del microservicio. Se encarga de recibir las instrucciones de envío desde el backend de la academia.

**Payload (Body esperado):**
```json
{
  "number": "987654321",
  "message": "Mensaje de texto a enviar",
  "media_url": "https://url.com/imagen.jpg" // (Opcional)
}
```

**Lógica de Procesamiento Interna:**
1. **Validación**: Verifica que existan los campos `number` y `message`.
2. **Saneamiento del Número**:
   * Elimina cualquier carácter que no sea numérico.
   * **Regla de Negocio Específica**: Si el número resultante tiene exactamente 9 dígitos, asume que es de **Perú** y le concatena automáticamente el prefijo internacional `51`.
   * Formatea el identificador final al estándar que requiere Baileys (`numero@s.whatsapp.net`).
3. **Envío**:
   * Si se provee un `media_url`, el bot descarga/adjunta la imagen y envía el texto como una descripción (*caption*).
   * Si no hay `media_url`, envía un mensaje de texto simple.

## 4. Estructura de Archivos
* `index.js`: Archivo principal que contiene toda la lógica de conexión y el servidor Express.
* `package.json`: Define las dependencias y la configuración del módulo Node.
* `README.md`: Documentación interna sobre cómo funciona el servicio.
* `baileys_auth_info/`: Carpeta (generada automáticamente) donde se almacena el estado y las credenciales de la sesión activa de WhatsApp.

## 5. Observaciones y Puntos de Mejora
* **Gestión de Errores en Imágenes**: Actualmente, si la URL en `media_url` es inaccesible o inválida, el envío podría fallar y devolver un error 500 al backend. Sería ideal tener un bloque `try-catch` más granular al descargar o enviar adjuntos.
* **Seguridad**: El endpoint `POST /send` no tiene autenticación. Dado que el puerto `3001` debería estar cerrado al mundo exterior y solo accesible desde el backend interno, esto es aceptable. Sin embargo, en un entorno de producción (como Docker), es crucial asegurarse de que este puerto no esté expuesto públicamente, o agregar un *API Key* simple como medida de seguridad.
* **Internacionalización**: La regla que añade `51` a números de 9 dígitos funciona bien localmente en Perú, pero limitaría el envío a otros países si se introducen números de 9 dígitos extranjeros sin código internacional.
