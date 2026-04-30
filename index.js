import 'dotenv/config'
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import { createClient } from '@supabase/supabase-js'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

// ─── Supabase Client (Service Role para leer datos de padres) ─────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── Variables Globales ──────────────────────────────────────────────────────
let sock = null

// Cola de mensajes anti-spam: [ { jid, message, media_url, attendance_id } ]
const messageQueue = []
let isProcessingQueue = false

// ─── Utilidades ─────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function formatJid(rawNumber) {
    let jid = rawNumber.replace(/[^0-9]/g, '')
    if (jid.length === 9) jid = '51' + jid // Perú por defecto
    return `${jid}@s.whatsapp.net`
}

// ─── Procesador de Cola (Anti-Spam) ─────────────────────────────────────────
async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return
    isProcessingQueue = true
    console.log(`[Queue] Iniciando procesamiento de ${messageQueue.length} mensaje(s) pendiente(s).`)

    while (messageQueue.length > 0) {
        const item = messageQueue.shift()

        if (!sock) {
            console.warn('[Queue] WhatsApp no conectado. Re-encolando item...')
            messageQueue.unshift(item)
            await delay(5000)
            continue
        }

        try {
            console.log(`[Queue] Enviando a ${item.jid}...`)
            if (item.media_url) {
                await sock.sendMessage(item.jid, {
                    image: { url: item.media_url },
                    caption: item.message
                })
            } else {
                await sock.sendMessage(item.jid, { text: item.message })
            }

            // Marcar como enviado en Supabase
            if (item.attendance_id) {
                await supabase
                    .from('attendance')
                    .update({ whatsapp_sent: true })
                    .eq('id', item.attendance_id)
            }

            console.log(`[Queue] ✅ Enviado a ${item.jid}`)
        } catch (err) {
            console.error(`[Queue] ❌ Error enviando a ${item.jid}:`, err.message)
        }

        // Pausa anti-spam entre mensajes (2-3 segundos aleatorios)
        if (messageQueue.length > 0) {
            const pauseMs = 2000 + Math.random() * 1000
            console.log(`[Queue] Esperando ${Math.round(pauseMs)}ms antes del siguiente mensaje...`)
            await delay(pauseMs)
        }
    }

    console.log('[Queue] ✅ Cola vacía. Procesamiento finalizado.')
    isProcessingQueue = false
}

// ─── Lógica Principal: Reaccionar a una nueva asistencia ─────────────────────
async function handleNewAttendance(attendance) {
    const { id: attendance_id, student_id, photo_url } = attendance
    console.log(`[Realtime] Nueva asistencia detectada: student_id=${student_id}, id=${attendance_id}`)

    try {
        // 1. Obtener datos del estudiante
        const { data: student } = await supabase
            .from('students')
            .select('first_name, last_name')
            .eq('id', student_id)
            .single()

        if (!student) {
            console.warn(`[Realtime] Estudiante ${student_id} no encontrado. Ignorando.`)
            return
        }

        // 2. Obtener IDs de padres
        const { data: parentsLinks } = await supabase
            .from('parent_student')
            .select('parent_id')
            .eq('student_id', student_id)

        if (!parentsLinks || parentsLinks.length === 0) {
            console.log(`[Realtime] Sin apoderados para student_id=${student_id}. Ignorando.`)
            // No hay padres, marcar como enviado para no reintentar
            await supabase.from('attendance').update({ whatsapp_sent: true }).eq('id', attendance_id)
            return
        }

        // 3. Obtener números de WhatsApp de los padres
        const parentIds = parentsLinks.map(p => p.parent_id)
        const { data: parents } = await supabase
            .from('parents')
            .select('whatsapp_number')
            .in('id', parentIds)

        if (!parents || parents.length === 0) return

        // 4. Construir el mensaje
        const date = new Date()
        const peruLocale = 'es-PE'
        const peruTimezone = 'America/Lima'

        const timeStr = date.toLocaleTimeString(peruLocale, {
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: peruTimezone
        })

        // Fecha larga en español — ej: "Domingo, 26 de abril de 2026"
        const dateStr = date.toLocaleDateString(peruLocale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: peruTimezone
        }).replace(/^\w/, c => c.toUpperCase())

        const name = `${student.first_name} ${student.last_name}`
        const message = `ALUMNO: *${name}* acaba de registrar su asistencia.\n📅 Fecha: *${dateStr}*\n🕐 Hora: *${timeStr}*\n\n_Seruna Academia._`

        // 5. Encolar un mensaje por cada padreD
        for (const p of parents) {
            if (!p.whatsapp_number) continue
            const rawNum = p.whatsapp_number.replace('whatsapp:', '').replace('+', '')
            const jid = formatJid(rawNum)
            messageQueue.push({ jid, message, media_url: photo_url || null, attendance_id })
            console.log(`[Queue] ➕ Encolado mensaje para ${jid}`)
        }

        // 6. Iniciar procesamiento de la cola (si no está corriendo)
        processQueue()

    } catch (err) {
        console.error('[Realtime] Error procesando asistencia:', err)
    }
}

// ─── Suscripción a Supabase Realtime ─────────────────────────────────────────
function subscribeToAttendance() {
    console.log('[Supabase] Suscribiendo a cambios en tabla attendance...')

    supabase
        .channel('attendance-changes')
        .on(
            'postgres_changes',
            {
                event: '*', // INSERT y UPDATE
                schema: 'public',
                table: 'attendance',
                filter: 'whatsapp_sent=eq.false'  // Solo filas pendientes
            },
            (payload) => {
                const record = payload.new
                if (record && !record.whatsapp_sent) {
                    handleNewAttendance(record)
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('[Supabase] ✅ Suscrito exitosamente a Realtime.')
            } else {
                console.log(`[Supabase] Estado de suscripción: ${status}`)
            }
        })
}

// ─── Conexión a WhatsApp ─────────────────────────────────────────────────────
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`[WhatsApp] Usando WA v${version.join('.')}, isLatest: ${isLatest}`)

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'error' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log('\n[WhatsApp] Escanea este QR con tu app de WhatsApp:')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.error('[WhatsApp] Conexión cerrada. Reconectando:', shouldReconnect)
            if (shouldReconnect) {
                sock = null
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('[WhatsApp] ✅ Baileys conectado y LISTO!')
            // Procesar cualquier mensaje que haya llegado mientras reconectaba
            processQueue()
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

// ─── Arranque ────────────────────────────────────────────────────────────────
console.log('🚀 Iniciando WhatsApp Bot con Supabase Realtime...')
connectToWhatsApp()
subscribeToAttendance()
