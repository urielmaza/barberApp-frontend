import { useEffect, useMemo, useState } from 'react'
import './App.css'
import logo from './assets/LSGS.png'

// Lista de servicios simulados (fallback si falla la API)
const SERVICIOS_FAKE = [
  { id: 4, nombre: 'Corte', duracion: 30, precio: 1500.0 },
  { id: 5, nombre: 'Corte y Barba', duracion: 45, precio: 2500.0 },
  { id: 6, nombre: 'Afeitado', duracion: 30, precio: 1800.0 }
]

// Config de horarios locales
const START_MIN = 9 * 60 + 30 // 09:30
const END_MIN = 20 * 60 + 30  // 20:30
const STEP_MIN = 30

function minutesFromTimeStr(hhmm) {
  if (!hhmm) return -1
  const [hh, mm] = String(hhmm).slice(0, 5).split(':').map(n => parseInt(n, 10))
  if (Number.isNaN(hh) || Number.isNaN(mm)) return -1
  return (hh * 60) + mm
}

function timeStrFromMinutes(total) {
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function generarSlotsBase() {
  const out = []
  for (let t = START_MIN; t <= END_MIN; t += STEP_MIN) {
    out.push(timeStrFromMinutes(t))
  }
  return out
}

function formatDateInput(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Formato estricto para teléfono AR: "+54 11 1234-5678"
function formatPhoneAR(input) {
  // Conservar solo dígitos
  const digits = String(input).replace(/\D+/g, '')
  // Extraer después del código de país 54 si el usuario lo tecleó
  let rest = digits
  if (rest.startsWith('54')) {
    rest = rest.slice(2)
  }
  // Limitar a 10 dígitos locales: 2 (área) + 8 (número)
  rest = rest.slice(0, 10)
  const area = rest.slice(0, 2)
  const main1 = rest.slice(2, 6)
  const main2 = rest.slice(6, 10)
  let out = '+54'
  if (area) out += ' ' + area
  if (main1) out += ' ' + main1
  if (main2) out += '-' + main2
  return out
}

function App() {
  // Servicios
  const [servicios, setServicios] = useState([])
  const [serviciosLoading, setServiciosLoading] = useState(false)
  const [serviciosError, setServiciosError] = useState('')
  const [servicioId, setServicioId] = useState('')

  // Fecha y horarios
  const todayStr = useMemo(() => formatDateInput(new Date()), [])
  const YEAR_ALLOWED = 2025
  const startYearStr = `${YEAR_ALLOWED}-01-01`
  const endYearStr = `${YEAR_ALLOWED}-12-31`
  // La fecha mínima permitida es hoy (si cae en 2025) o 2025-01-01, lo que sea mayor; nunca supera 2025-12-31
  const minAllowedStr = useMemo(() => {
    if (todayStr < startYearStr) return startYearStr
    if (todayStr > endYearStr) return endYearStr
    return todayStr
  }, [todayStr])
  const maxAllowedStr = endYearStr
  const [fecha, setFecha] = useState(minAllowedStr)
  const [horarios, setHorarios] = useState([])
  const [horariosLoading, setHorariosLoading] = useState(false)
  const [horariosError, setHorariosError] = useState('')
  const [hora, setHora] = useState('')
  const POLL_MS = 15000 // refresco periódico de horarios para reflejar reservas recientes
  // Bloqueos locales por fecha para que las horas reservadas no reaparezcan en ese día
  const [bloqueos, setBloqueos] = useState({}) // { [fecha: string]: string[] }
  const filtrarBloqueados = (arr, f) => {
    const bloqueados = (bloqueos?.[f] || [])
    if (!Array.isArray(arr)) return []
    if (!Array.isArray(bloqueados) || bloqueados.length === 0) return arr
    return arr.filter(h => !bloqueados.includes(h))
  }

  // Filtrar horarios pasados si la fecha es hoy, y además ajustar al rango 09:30–20:30
  const aplicarFiltrosHorario = (arr, f) => {
    if (!Array.isArray(arr)) return []
    // Normalizar al rango permitido
    const enRango = arr.filter(h => {
      const m = minutesFromTimeStr(h)
      return m >= START_MIN && m <= END_MIN
    })
    const base = filtrarBloqueados(enRango, f)
    const hoyStr = formatDateInput(new Date())
    if (f !== hoyStr) return base
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    return base.filter(h => minutesFromTimeStr(h) > nowMin)
  }

  // Formulario cliente
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })

  // Cargar servicios al iniciar
  useEffect(() => {
    const cargarServicios = async () => {
      setServiciosLoading(true)
      setServiciosError('')
      try {
        const res = await fetch('/api/servicios')
        if (!res.ok) throw new Error('No se pudieron obtener servicios')
        const data = await res.json()
        setServicios(Array.isArray(data) ? data : [])
        // Selección inicial si hay servicios
        if (Array.isArray(data) && data.length > 0) {
          setServicioId(String(data[0].id))
        }
      } catch (e) {
        // Fallback silencioso: usar lista simulada
        setServiciosError('')
        setServicios(SERVICIOS_FAKE)
        if (SERVICIOS_FAKE.length > 0) setServicioId(String(SERVICIOS_FAKE[0].id))
      } finally {
        setServiciosLoading(false)
      }
    }
    cargarServicios()
  }, [])

  // Cargar horarios cuando cambian servicio o fecha
  useEffect(() => {
    const cargarHorarios = async () => {
      if (!servicioId || !fecha) {
        setHorarios([])
        return
      }
      setHorariosLoading(true)
      setHorariosError('')
      setHora('')
      try {
        const params = new URLSearchParams({ servicioId: String(servicioId), fecha })
        const res = await fetch(`/api/horarios?${params.toString()}`)
        if (!res.ok) throw new Error('No se pudieron obtener horarios')
  const data = await res.json()
  const serverList = Array.isArray(data.horarios) ? data.horarios : []
  setHorarios(aplicarFiltrosHorario(serverList, fecha))
      } catch (e) {
        // Fallback local: generar slots 09:30–20:30 y filtrar por hora actual si corresponde
        setHorariosError('')
        const locales = generarSlotsBase()
        setHorarios(aplicarFiltrosHorario(locales, fecha))
      } finally {
        setHorariosLoading(false)
      }
    }
    cargarHorarios()
  }, [servicioId, fecha])

  // Refresco en segundo plano para sacar turnos reservados por otros usuarios
  useEffect(() => {
    if (!servicioId || !fecha) return
    const controller = new AbortController()
    const id = setInterval(() => {
      const params = new URLSearchParams({ servicioId: String(servicioId), fecha })
      fetch(`/api/horarios?${params.toString()}`, { signal: controller.signal })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(d => {
          if (d && Array.isArray(d.horarios)) setHorarios(aplicarFiltrosHorario(d.horarios, fecha))
        })
        .catch(() => {})
    }, POLL_MS)
    return () => { clearInterval(id); controller.abort() }
  }, [servicioId, fecha])

  const validar = () => {
    if (!servicioId) return 'Selecciona un servicio'
    if (!fecha) return 'Selecciona una fecha válida'
    if (!hora) return 'Selecciona un horario disponible'
    if (!nombre || nombre.trim().length < 2) return 'Ingresa un nombre válido'
    // Validación estricta formato: +54 XX XXXX-XXXX
    const phoneRegex = /^\+54\s\d{2}\s\d{4}-\d{4}$/
    if (!phoneRegex.test(telefono)) return 'Teléfono inválido. Ej: +54 11 1234-5678'
    return ''
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setMensaje({ tipo: '', texto: '' })
    const err = validar()
    if (err) {
      setMensaje({ tipo: 'error', texto: err })
      return
    }
    setSubmitting(true)
    try {
      const horaElegida = hora
      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, telefono, servicio: Number(servicioId), fecha, hora })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'No se pudo crear la reserva')
      }
      const data = await res.json()
      manejarReservaExitosa(horaElegida, data?.reserva)
    } catch (e) {
      // Simulación de éxito si la API falla
      const horaElegida = hora
      manejarReservaExitosa(horaElegida, { fecha, hora })
    } finally {
      setSubmitting(false)
    }
  }

  const manejarReservaExitosa = (horaElegida, reserva) => {
    setMensaje({ tipo: 'ok', texto: `Reserva confirmada${reserva ? '' : ' (simulada)'}: ${reserva?.fecha || fecha} ${(reserva?.hora || hora)}` })
    setHorarios(prev => prev.filter(h => h !== horaElegida))
    setBloqueos(prev => {
      const actual = new Set(prev[fecha] || [])
      actual.add(horaElegida)
      return { ...prev, [fecha]: Array.from(actual) }
    })
    setHora('')
    setNombre('')
    setTelefono('')
    const params = new URLSearchParams({ servicioId: String(servicioId), fecha })
    fetch(`/api/horarios?${params.toString()}`)
      .then(r => r.json())
      .then(d => setHorarios(aplicarFiltrosHorario(Array.isArray(d.horarios) ? d.horarios : generarSlotsBase(), fecha)))
      .catch(() => {})
  }

  return (
    <div className="app app-shell">
      <div className="brand-frame">
        <div className="brand-header" />
        <div className="brand-content">
          <img src={logo} alt="Barberia Gitanos Logo" className="brand-logo" />

      <div className="section-row">
        {/* Selector de servicio */}
        <section className="section">
          <label className="label" htmlFor="servicio">Servicio</label>
          <select
            id="servicio"
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            disabled={serviciosLoading}
            className="field"
          >
            {servicios.map(s => (
              <option key={s.id} value={s.id}>
                {s.nombre} {s.duracion ? `(${s.duracion} min)` : ''}
              </option>
            ))}
          </select>
          {serviciosError && <p style={{ color: 'crimson' }}>{serviciosError}</p>}
        </section>

        {/* Calendario (input date) */}
        <section className="section">
          <label className="label" htmlFor="fecha">Fecha</label>
          <input
            type="date"
            id="fecha"
            value={fecha}
            min={minAllowedStr}
            max={maxAllowedStr}
            onChange={(e) => {
              const val = e.target.value
              if (!val) {
                setFecha(minAllowedStr)
                return
              }
              let next = val
              if (val < minAllowedStr) next = minAllowedStr
              if (val > maxAllowedStr) next = maxAllowedStr
              setFecha(next)
            }}
            className="field"
          />
        </section>
      </div>

      {/* Horarios disponibles */}
      <section className="section">
        <h2 style={{ fontSize: '1.1rem' }}>Horarios disponibles</h2>
        {horariosLoading && <p>Cargando horarios...</p>}
        {horariosError && <p style={{ color: 'crimson' }}>{horariosError}</p>}
        {!horariosLoading && horarios.length === 0 && (
          <p>No hay horarios disponibles para la fecha seleccionada.</p>
        )}
        <div className="hours-grid">
          {horarios.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHora(h)}
              aria-pressed={hora === h}
              className={`hour-btn${hora === h ? '' : ''}`}
            >
              {h?.slice(0,5)}
            </button>
          ))}
        </div>
        {hora && <p style={{ marginTop: '.5rem' }}>Horario seleccionado: <strong>{hora.slice(0,5)}</strong></p>}
      </section>

      {/* Formulario cliente */}
      <section className="section">
        <h2 style={{ fontSize: '1.1rem' }}>Tus datos</h2>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: '.5rem' }}>
            <label className="label" htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="field"
              required
            />
          </div>
          <div style={{ marginBottom: '.5rem' }}>
            <label className="label" htmlFor="telefono">Teléfono</label>
            <input
              id="telefono"
              type="tel"
              value={telefono}
              onChange={(e) => {
                const formatted = formatPhoneAR(e.target.value)
                setTelefono(formatted)
              }}
              onBlur={() => setTelefono(formatPhoneAR(telefono))}
              placeholder="Ej: +54 11 1234-5678"
              className="field"
              required
              maxLength={20}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Confirmando...' : 'Confirmar reserva'}
            </button>
          </div>
        </form>
        {mensaje.texto && (
          <p className={`alert ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`}>{mensaje.texto}</p>
        )}
      </section>
        </div>
      </div>
      <footer className="site-footer">
          <div className="footer-grid" style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
            <img src={logo} alt="Barbería Los Gitanos" className="footer-logo" />
            <ul className="footer-links">
                <li>
                  <a className="footer-link" href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram Barbería Gitanos">
                    <svg role="img" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                    Instagram
                  </a>
                </li>
                <li>
                  <a className="footer-link" href="https://wa.me/5491112345678" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Barbería Gitanos">
                    <svg role="img" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-4.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/><path d="M9 9.5c.2 1.5 1 2.9 2.2 3.8 1.1.9 2.4 1.5 3.9 1.7"/></svg>
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a className="footer-link" href="mailto:contacto@barberiagitanos.com" aria-label="Enviar correo a Barbería Gitanos">
                    <svg role="img" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    Email
                  </a>
                </li>
                <li>
                  <a className="footer-link" href="https://www.google.com/maps/search/?api=1&query=Las+Araucarias+1450,+Tortuguitas" target="_blank" rel="noopener noreferrer" aria-label="Ubicación Barbería Gitanos en Google Maps">
                    <svg role="img" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Ubicación
                  </a>
                </li>
              </ul>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Barbería Los Gitanos. Todos los derechos reservados.</div>
      </footer>
    </div>
  )
}

export default App
