import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import express from 'express';
import bodyParser from 'body-parser';

const app = express()
app.use(bodyParser.json())

let sock = null

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'error' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        
        if(qr) {
            console.log("Escanea este código QR con la app de WhatsApp de tu celular:")
            qrcode.generate(qr, {small: true});
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.error('WhatsApp connection closed error:', lastDisconnect?.error);
            console.log('WhatsApp connection closed. Reconnecting:', shouldReconnect)
            if (shouldReconnect) {
                // Reconnect
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('✅ WhatsApp API - Baileys is READY!')
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

// Iniciar WhatsApp
connectToWhatsApp()

// Endpoint HTTP
app.post('/send', async (req, res) => {
    try {
        const { number, message, media_url } = req.body

        if (!number || !message) {
            return res.status(400).json({ error: 'Falta number o message en el body' })
        }

        // Baileys requiere el formato jid: <nro>@s.whatsapp.net
        let jid = number
        jid = jid.replace(/[^0-9]/g, '') // Solo números
        
        // Asumiendo que estamos en Perú y la gente entra números de 9 dígitos
        if (jid.length === 9) {
            jid = '51' + jid
        }

        jid = `${jid}@s.whatsapp.net`

        console.log(`[Baileys API] Enviando mensaje a ${jid}...`)

        if (media_url) {
            // Mandar imagen con mensaje
             await sock.sendMessage(jid, { 
                 image: { url: media_url }, 
                 caption: message 
             })
        } else {
            // Solo texto
            await sock.sendMessage(jid, { text: message })
        }

        return res.json({ success: true, jid })

    } catch (err) {
        console.error('Error enviando mensaje via Baileys:', err)
        return res.status(500).json({ error: err.toString() })
    }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
    console.log(`🚀 Servicio Baileys activo en http://localhost:${PORT}`)
})
