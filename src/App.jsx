import { supabase } from "./supabase";
import { supabase } from "./lib/supabase";
import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { Users, ClipboardList, CheckSquare, Briefcase, BarChart2, Menu, X, ChevronRight } from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────
const ROLES = [
  { id: "hiring_manager", label: "Hiring Manager", color: "bg-violet-600" },
  { id: "aprobador",      label: "Aprobador",      color: "bg-amber-500"  },
  { id: "reclutador",     label: "Reclutador",     color: "bg-sky-600"    },
  { id: "candidato",      label: "Candidato",      color: "bg-emerald-600"},
];
const NAV = {
  hiring_manager: [
    { id: "requisiciones", label: "Requisiciones", icon: ClipboardList },
    { id: "mis_vacantes",  label: "Mis Vacantes",  icon: Briefcase     },
    { id: "dashboard",     label: "Dashboard",     icon: BarChart2     },
  ],
  aprobador: [
    { id: "pendientes", label: "Pendientes", icon: CheckSquare   },
    { id: "historial",  label: "Historial",  icon: ClipboardList },
    { id: "dashboard",  label: "Dashboard",  icon: BarChart2     },
  ],
  reclutador: [
    { id: "vacantes",   label: "Vacantes",   icon: Briefcase     },
    { id: "candidatos", label: "Candidatos", icon: Users         },
    { id: "kanban",     label: "Pipeline",   icon: ClipboardList },
    { id: "dashboard",  label: "Dashboard",  icon: BarChart2     },
  ],
  candidato: [
    { id: "ofertas",  label: "Ofertas de Trabajo", icon: Briefcase     },
    { id: "mis_apps", label: "Mis Aplicaciones",   icon: ClipboardList },
  ],
};
const WELCOME = {
  hiring_manager: { title: "Panel del Hiring Manager", desc: "Crea requisiciones de personal, revisa el estado de tus vacantes y consulta métricas de tu equipo." },
  aprobador:      { title: "Panel del Aprobador",      desc: "Revisa y aprueba las requisiciones de personal pendientes de autorización." },
  reclutador:     { title: "Panel del Reclutador",     desc: "Gestiona vacantes publicadas, revisa candidatos y avanza el pipeline de selección." },
  candidato:      { title: "Portal de Candidatos",     desc: "Explora las vacantes disponibles, aplica y consulta el estado de tus postulaciones." },
};
const AREAS      = ["Tecnología","Comercial","Operaciones","Finanzas","RRHH","Marketing","Legal"];
const PRIORIDADES= ["Alta","Media","Baja"];
const STATUS_COLOR={ Borrador:"bg-gray-100 text-gray-600", Pendiente:"bg-amber-100 text-amber-700", Aprobada:"bg-green-100 text-green-700", Rechazada:"bg-red-100 text-red-600", Publicada:"bg-sky-100 text-sky-700", Evaluado:"bg-indigo-100 text-indigo-700" };
const PRIO_COLOR  ={ Alta:"text-red-600 bg-red-50", Media:"text-amber-600 bg-amber-50", Baja:"text-green-600 bg-green-50" };
const ETAPAS      = ["Aplicado","Entrevista","Oferta","Contratado"];
const ETAPA_COLORS= { Aplicado:"bg-gray-100 border-gray-300 text-gray-700", Entrevista:"bg-sky-50 border-sky-300 text-sky-700", Oferta:"bg-violet-50 border-violet-300 text-violet-700", Contratado:"bg-emerald-50 border-emerald-300 text-emerald-700" };
const ETAPA_HDR   = { Aplicado:"bg-gray-200 text-gray-700", Entrevista:"bg-sky-200 text-sky-800", Oferta:"bg-violet-200 text-violet-800", Contratado:"bg-emerald-200 text-emerald-800" };

const emptyReq = () => ({
  cargo:"", area:"", posiciones:1, prioridad:"Media",
  perfil:"", salarioMin:"", salarioMax:"", fechaLimite:"",
  estado:"Pendiente", creadoEn: new Date().toLocaleDateString("es-CO"),
});

const initialState = {
  vacantes:[], usuarios:[],
  requisiciones:[],
  aplicaciones:[],
  };

// ─── Persistencia ────────────────────────────────────────────
const SCHEMA_VERSION = "ats_v1";
const STORAGE_KEY    = "ats_pro_state";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const { version, data } = JSON.parse(raw);
    if (version !== SCHEMA_VERSION) return initialState;
    return {
      ...initialState,
      ...data,
      requisiciones: data.requisiciones ?? initialState.requisiciones,
      aplicaciones:  data.aplicaciones  ?? initialState.aplicaciones,
    };
  } catch {
    return initialState;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, data: state }));
  } catch { /* silencioso si storage no disponible */ }
}

function exportBackup(state) {
  try {
    const payload = JSON.stringify({ version: SCHEMA_VERSION, exportadoEn: new Date().toISOString(), data: state }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ats_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* silencioso */ }
}

function importBackup(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.version || !parsed.data) return onError("Archivo inválido: estructura inesperada.");
      if (parsed.version !== SCHEMA_VERSION) return onError(`Versión incompatible: "${parsed.version}". Se esperaba "${SCHEMA_VERSION}".`);
      const { requisiciones, aplicaciones } = parsed.data;
      if (!Array.isArray(requisiciones) || !Array.isArray(aplicaciones)) return onError("Archivo inválido: datos corruptos.");
      onSuccess({ ...initialState, ...parsed.data });
    } catch {
      onError("No se pudo leer el archivo. Verifica que sea un JSON válido.");
    }
  };
  reader.onerror = () => onError("Error al leer el archivo.");
  reader.readAsText(file);
}

// ─── Helpers ──────────────────────────────────────────────────
function StatusBadge({ estado }) {
  const c = STATUS_COLOR;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c[estado]||"bg-gray-100 text-gray-500"}`}>{estado}</span>;
}
function DashboardShell({ title, cards, children }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-lg font-bold text-gray-800">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(c=>(
          <div key={c.label} className={`border rounded-xl p-4 ${c.color}`}>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs mt-1 opacity-80">{c.label}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
function TableSection({ title, empty, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : (children ? [children] : []);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100"><p className="font-semibold text-gray-700 text-sm">{title}</p></div>
      {rows.length === 0
        ? <p className="text-center text-gray-400 text-sm py-6">{empty}</p>
        : <table className="w-full text-sm"><tbody>{children}</tbody></table>}
    </div>
  );
}

// ─── Toast System ─────────────────────────────────────────────


const ToastCtx = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) =>
    setToasts(t => t.map(x => x.id === id ? { ...x, leaving: true } : x)), []);

  const showToast = useCallback(({ msg, type = "info", duration = 3000 }) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type, leaving: false }]);
    setTimeout(() => dismiss(id), duration);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration + 300);
  }, [dismiss]);

  const STYLES = {
    success: "bg-emerald-600 text-white",
    error:   "bg-red-500 text-white",
    info:    "bg-indigo-600 text-white",
    warning: "bg-amber-500 text-white",
  };

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
        {toasts.map(t => (
          <div key={t.id}
            style={{ transition: "all 0.25s ease", opacity: t.leaving ? 0 : 1, transform: t.leaving ? "translateX(40px)" : "translateX(0)" }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-xs ${STYLES[t.type]}`}>
            <span className="flex-1">{t.msg}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Cerrar notificación" className="opacity-70 hover:opacity-100 text-white font-bold">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const useToast = () => useContext(ToastCtx);

// ─── Módulo Requisiciones ─────────────────────────────────────
function ModuloRequisiciones({ state, setState }) {
  const [form,setForm]=useState(null);
  const [errores,setErrores]=useState({});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const validar=()=>{
    const e={};
    if(!form.cargo.trim()) e.cargo="Requerido";
    if(!form.area) e.area="Requerido";
    if(!form.perfil.trim()) e.perfil="Requerido";
    if(!form.fechaLimite) e.fechaLimite="Requerido";
    setErrores(e); return Object.keys(e).length===0;
  };
  const guardar=()=>{ if(!validar()) return; setState(s=>({...s,requisiciones:[{...form,id:Date.now()},...s.requisiciones]})); setForm(null); };
  if(form) return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Nueva Requisición</h2>
        <button onClick={()=>setForm(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cargo *</label>
            <input value={form.cargo} onChange={e=>set("cargo",e.target.value)} placeholder="ej. Desarrollador Backend"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errores.cargo?"border-red-400":"border-gray-300"}`}/>
            {errores.cargo&&<p className="text-red-500 text-xs mt-1">{errores.cargo}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Área *</label>
            <select value={form.area} onChange={e=>set("area",e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errores.area?"border-red-400":"border-gray-300"}`}>
              <option value="">Seleccionar...</option>{AREAS.map(a=><option key={a}>{a}</option>)}
            </select>
            {errores.area&&<p className="text-red-500 text-xs mt-1">{errores.area}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Posiciones</label>
            <input type="number" min="1" value={form.posiciones} onChange={e=>set("posiciones",+e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Salario Mín.</label>
            <input value={form.salarioMin} onChange={e=>set("salarioMin",e.target.value)} placeholder="ej. 3.000.000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Salario Máx.</label>
            <input value={form.salarioMax} onChange={e=>set("salarioMax",e.target.value)} placeholder="ej. 5.000.000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Prioridad</label>
            <select value={form.prioridad} onChange={e=>set("prioridad",e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {PRIORIDADES.map(p=><option key={p}>{p}</option>)}
            </select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha Límite *</label>
            <input type="date" value={form.fechaLimite} onChange={e=>set("fechaLimite",e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errores.fechaLimite?"border-red-400":"border-gray-300"}`}/>
            {errores.fechaLimite&&<p className="text-red-500 text-xs mt-1">{errores.fechaLimite}</p>}</div>
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Perfil Requerido *</label>
          <textarea value={form.perfil} onChange={e=>set("perfil",e.target.value)} rows={3} placeholder="Describe experiencia, habilidades y requisitos..."
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none ${errores.perfil?"border-red-400":"border-gray-300"}`}/>
          {errores.perfil&&<p className="text-red-500 text-xs mt-1">{errores.perfil}</p>}</div>
        <div className="flex gap-3 pt-2">
          <button onClick={guardar} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">Enviar a Aprobación</button>
          <button onClick={()=>setForm(null)} className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Requisiciones de Personal</h2>
        <button onClick={()=>setForm(emptyReq())} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
          <ClipboardList size={16}/> Nueva Requisición</button>
      </div>
      {state.requisiciones.length===0?(
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 text-gray-300"/><p className="font-medium">Sin requisiciones aún</p></div>
      ):(
        <div className="space-y-3">{state.requisiciones.map(r=>(
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div><p className="font-semibold text-gray-800">{r.cargo}</p>
              <p className="text-xs text-gray-500">{r.area} · {r.posiciones} pos. · {r.creadoEn}</p></div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Límite: {r.fechaLimite}</span>
              <StatusBadge estado={r.estado}/>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// ─── Módulo Aprobador ─────────────────────────────────────────
function ModuloAprobador({ state, setState }) {
  const [comentarios,setComentarios]=useState({});
  const pendientes=state.requisiciones.filter(r=>r.estado==="Pendiente");
  const decidir=(id,decision)=>{
    setState(s=>({...s,requisiciones:s.requisiciones.map(r=>r.id===id?{...r,estado:decision,comentarioAprobador:comentarios[id]||""}:r)}));
    setComentarios(c=>{const n={...c};delete n[id];return n;});
  };
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Requisiciones Pendientes
        <span className="ml-2 text-sm font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pendientes.length}</span>
      </h2>
      {pendientes.length===0?(
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <CheckSquare size={38} className="mx-auto mb-2 text-gray-300"/><p className="font-medium">Sin requisiciones pendientes</p></div>
      ):pendientes.map(r=>(
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div><p className="font-semibold text-gray-800">{r.cargo}</p>
              <p className="text-xs text-gray-500">{r.area} · {r.posiciones} pos. · Límite: {r.fechaLimite}</p></div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${PRIO_COLOR[r.prioridad]}`}>{r.prioridad}</span>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">{r.perfil}</p>
          {(r.salarioMin||r.salarioMax)&&<p className="text-xs text-gray-500 mb-3">💰 {r.salarioMin||"—"} – {r.salarioMax||"—"}</p>}
          <textarea rows={2} placeholder="Comentario (opcional)..." value={comentarios[r.id]||""}
            onChange={e=>setComentarios(c=>({...c,[r.id]:e.target.value}))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-3"/>
          <div className="flex gap-3">
            <button onClick={()=>decidir(r.id,"Aprobada")} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">✓ Aprobar</button>
            <button onClick={()=>decidir(r.id,"Rechazada")} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">✗ Rechazar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Módulo Historial Aprobador ───────────────────────────────
function ModuloHistorial({ state }) {
  const historial=state.requisiciones.filter(r=>r.estado==="Aprobada"||r.estado==="Rechazada");
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Historial de Decisiones
        <span className="ml-2 text-sm font-normal bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{historial.length}</span>
      </h2>
      {historial.length===0?(
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <CheckSquare size={38} className="mx-auto mb-2 text-gray-300"/><p className="font-medium">Sin decisiones registradas.</p></div>
      ):historial.map(r=>(
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-1">
            <div><p className="font-semibold text-gray-800">{r.cargo}</p>
              <p className="text-xs text-gray-500">{r.area} · {r.posiciones} pos. · Límite: {r.fechaLimite}</p></div>
            <StatusBadge estado={r.estado}/>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mt-2">{r.perfil}</p>
          {r.comentarioAprobador&&<p className="text-xs text-gray-500 mt-2 bg-amber-50 rounded px-3 py-2">💬 {r.comentarioAprobador}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Módulo Vacantes (Reclutador) ────────────────────────────
function ModuloVacantes({ state, setState }) {
  const [selected,setSelected]=useState(null);
  const [newP,setNewP]=useState("");
  const aprobadas=state.requisiciones.filter(r=>r.estado==="Aprobada");
  const publicadas=state.requisiciones.filter(r=>r.estado==="Publicada");
  const publicar=(id)=>{ setState(s=>({...s,requisiciones:s.requisiciones.map(r=>r.id===id?{...r,estado:"Publicada",preguntas:r.preguntas||[],publicadaEn:new Date().toLocaleDateString("es-CO")}:r)})); setSelected(null); };
  const addP=(id)=>{ if(!newP.trim()) return; setState(s=>({...s,requisiciones:s.requisiciones.map(r=>r.id===id?{...r,preguntas:[...(r.preguntas||[]),newP.trim()]}:r)})); setNewP(""); };
  const delP=(id,i)=>setState(s=>({...s,requisiciones:s.requisiciones.map(r=>r.id===id?{...r,preguntas:r.preguntas.filter((_,j)=>j!==i)}:r)}));
  const req=selected?state.requisiciones.find(r=>r.id===selected):null;
  if(req) return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Configurar Vacante</h2>
        <button onClick={()=>setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div><p className="font-semibold text-gray-800">{req.cargo}</p>
          <p className="text-xs text-gray-500">{req.area} · {req.posiciones} pos.</p></div>
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">{req.perfil}</div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Preguntas de Filtrado</p>
          {(req.preguntas||[]).map((p,i)=>(
            <div key={i} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-2">
              <span className="text-xs text-indigo-700 flex-1">❓ {p}</span>
              <button onClick={()=>delP(req.id,i)} className="text-red-400 hover:text-red-600"><X size={14}/></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newP} onChange={e=>setNewP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addP(req.id)}
              placeholder="ej. ¿Tienes experiencia con React?"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
            <button onClick={()=>addP(req.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition">+ Agregar</button>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={()=>publicar(req.id)} className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">🚀 Publicar Vacante</button>
          <button onClick={()=>setSelected(null)} className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">Aprobadas — Listas para Publicar
          <span className="ml-2 text-sm font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{aprobadas.length}</span>
        </h2>
        {aprobadas.length===0?<div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400"><Briefcase size={36} className="mx-auto mb-2 text-gray-300"/><p className="text-sm">No hay vacantes aprobadas aún.</p></div>
        :aprobadas.map(r=>(
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between mb-2">
            <div><p className="font-semibold text-gray-800">{r.cargo}</p><p className="text-xs text-gray-500">{r.area} · {r.posiciones} pos.</p></div>
            <button onClick={()=>setSelected(r.id)} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Configurar y Publicar</button>
          </div>
        ))}
      </div>
      {publicadas.length>0&&(
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-3">Vacantes Publicadas
            <span className="ml-2 text-sm font-normal bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{publicadas.length}</span>
          </h2>
          {publicadas.map(r=>(
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between mb-2">
              <div><p className="font-semibold text-gray-800">{r.cargo}</p>
                <p className="text-xs text-gray-500">{r.area} · Publicada: {r.publicadaEn} · {(r.preguntas||[]).length} pregunta(s)</p></div>
              <StatusBadge estado={r.estado}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Módulo Candidatos (Reclutador) ──────────────────────────
function ModuloCandidatos({ state, setState }) {
  const [evaluando,setEvaluando]=useState({});
  const [vacanteFilter,setVacanteFilter]=useState("all");
  const publicadas=state.requisiciones.filter(r=>r.estado==="Publicada");
  const apps=vacanteFilter==="all"?state.aplicaciones:state.aplicaciones.filter(a=>a.vacanteId===+vacanteFilter);
  const evaluar=async(app)=>{
    setEvaluando(e=>({...e,[app.id]:true}));
    const v=state.requisiciones.find(r=>r.id===app.vacanteId);
    const prompt=`Eres evaluador experto de RRHH. Evalúa este candidato y responde SOLO en JSON sin backticks.
VACANTE: ${v?.cargo} | ${v?.area} | Perfil: ${v?.perfil} | Salario: ${v?.salarioMin}-${v?.salarioMax}
CANDIDATO: ${app.nombre} (${app.email})
CV: ${(app.cvTexto||"No proporcionado").slice(0,1500)}
RESPUESTAS: ${app.respuestas?.map(r=>`${r.pregunta}: ${r.respuesta}`).join("\n")||"Sin respuestas"}
Responde SOLO: {"score":<0-100>,"nivel":"Alto"|"Medio"|"Bajo","fortalezas":[...],"debilidades":[...],"recomendacion":"<1 oración>"}`;
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data = await res.json();
      const text = (data?.content ?? []).map(c => c?.text ?? "").join("");
      if (!text.trim()) throw new Error("Respuesta vacía de la API");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setState(s=>({...s,aplicaciones:s.aplicaciones.map(a=>a.id===app.id?{...a,...parsed,estado:"Evaluado"}:a)}));
    } catch {
      setState(s=>({...s,aplicaciones:s.aplicaciones.map(a=>a.id===app.id?{...a,score:0,nivel:"Error",recomendacion:"No se pudo evaluar.",estado:"Error"}:a)}));
    }
    setEvaluando(e=>({...e,[app.id]:false}));
  };
  const scoreColor=s=>s>=75?"text-green-600 bg-green-50":s>=50?"text-amber-600 bg-amber-50":"text-red-600 bg-red-50";
  const sorted=[...apps].sort((a,b)=>(b.score??-1)-(a.score??-1));
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Candidatos
          <span className="ml-2 text-sm font-normal bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{apps.length}</span>
        </h2>
        <select value={vacanteFilter} onChange={e=>setVacanteFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="all">Todas las vacantes</option>
          {publicadas.map(v=><option key={v.id} value={v.id}>{v.cargo}</option>)}
        </select>
      </div>
      {sorted.length===0?<div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400"><Users size={40} className="mx-auto mb-3 text-gray-300"/><p className="font-medium">Sin candidatos aún</p></div>
      :sorted.map((app,idx)=>(
        <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">{app.score!==null&&<span className="text-xs font-bold text-gray-400">#{idx+1}</span>}
                <p className="font-semibold text-gray-800">{app.nombre}</p></div>
              <p className="text-xs text-gray-500">{app.email} · {app.cargo} · {app.aplicadoEn}</p>
              {app.cvNombre&&<p className="text-xs text-indigo-500 mt-0.5">📄 {app.cvNombre}</p>}
            </div>
            <div className="flex items-center gap-2">
              {app.score!==null&&<span className={`text-sm font-bold px-3 py-1 rounded-full ${scoreColor(app.score)}`}>{app.score}/100</span>}
              {app.estado!=="Evaluado"&&<button onClick={()=>evaluar(app)} disabled={evaluando[app.id]}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                {evaluando[app.id]?"Evaluando...":"✨ Evaluar con IA"}</button>}
            </div>
          </div>
          {app.recomendacion&&<div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-xs text-gray-700">💡 {app.recomendacion}</p>
            {app.fortalezas?.length>0&&<p className="text-xs text-green-700">✓ {app.fortalezas.join(" · ")}</p>}
            {app.debilidades?.length>0&&<p className="text-xs text-red-600">✗ {app.debilidades.join(" · ")}</p>}
          </div>}
          {app.respuestas?.length>0&&<details className="mt-2">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver respuestas de filtrado</summary>
            <div className="mt-2 space-y-1">{app.respuestas.map((r,i)=>(
              <div key={i} className="text-xs text-gray-600 bg-indigo-50 rounded p-2">
                <span className="font-medium">❓ {r.pregunta}</span><br/>{r.respuesta||"Sin respuesta"}
              </div>
            ))}</div>
          </details>}
        </div>
      ))}
    </div>
  );
}

// ─── Módulo Kanban ────────────────────────────────────────────
function ModuloKanban({ state, setState }) {
  const [vacanteFilter,setVacanteFilter]=useState("all");
  const publicadas=state.requisiciones.filter(r=>r.estado==="Publicada");
  const mover=(id,dir)=>setState(s=>({...s,aplicaciones:s.aplicaciones.map(a=>{
    if(a.id!==id) return a;
    const idx=ETAPAS.indexOf(ETAPAS.includes(a.estado)?a.estado:"Aplicado");
    const next=ETAPAS[idx+dir]; return next?{...a,estado:next}:a;
  })}));
  const apps=(state.aplicaciones||[]).filter(a=>vacanteFilter==="all"?true:a.vacanteId===+vacanteFilter);
  const byEtapa=e=>apps.filter(a=>a.estado===e||(!ETAPAS.includes(a.estado)&&e==="Aplicado"));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Pipeline de Candidatos</h2>
        <select value={vacanteFilter} onChange={e=>setVacanteFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="all">Todas las vacantes</option>
          {publicadas.map(v=><option key={v.id} value={v.id}>{v.cargo}</option>)}
        </select>
      </div>
      {apps.length===0?<div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400"><Users size={40} className="mx-auto mb-3 text-gray-300"/><p>Sin candidatos en el pipeline</p></div>
      :<div className="grid grid-cols-4 gap-3">{ETAPAS.map(etapa=>{
        const cols=byEtapa(etapa);
        return <div key={etapa} className="flex flex-col gap-2">
          <div className={`rounded-lg px-3 py-2 flex items-center justify-between ${ETAPA_HDR[etapa]}`}>
            <span className="text-xs font-bold uppercase tracking-wide">{etapa}</span>
            <span className="text-xs font-bold bg-white bg-opacity-60 rounded-full px-2">{cols.length}</span>
          </div>
          <div className="flex flex-col gap-2 min-h-24">{cols.map(a=>{
            const etapaActual = ETAPAS.includes(a.estado) ? a.estado : "Aplicado";
            const idx = ETAPAS.indexOf(etapaActual);
            return <div key={a.id} className={`border rounded-xl p-3 ${ETAPA_COLORS[etapaActual]}`}>
              <p className="font-semibold text-xs text-gray-800 truncate">{a.nombre}</p>
              <p className="text-xs text-gray-500 truncate">{a.cargo}</p>
              {a.score!==null&&<span className={`text-xs font-bold mt-1 inline-block px-1.5 rounded ${a.score>=75?"text-green-700":a.score>=50?"text-amber-600":"text-red-500"}`}>{a.score}/100</span>}
              <div className="flex gap-1 mt-2">
                {idx>0&&<button onClick={()=>mover(a.id,-1)} className="text-xs bg-white border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-100 transition">← Atrás</button>}
                {idx<ETAPAS.length-1&&<button onClick={()=>mover(a.id,1)} className="text-xs bg-white border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-100 transition">Avanzar →</button>}
              </div>
            </div>;
          })}</div>
        </div>;
      })}</div>}
    </div>
  );
}

// ─── Módulo Candidato — Ofertas ───────────────────────────────
function ModuloCandidato({ state, setState }) {
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState({});
  const [cvText,setCvText]=useState("");
  const [cvNombre,setCvNombre]=useState("");
  const [enviando,setEnviando]=useState(false);
  const [exito,setExito]=useState(false);
  const publicadas=state.requisiciones.filter(r=>r.estado==="Publicada");
  const vacante=selected?state.requisiciones.find(r=>r.id===selected):null;
  const handleCV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCvNombre(file.name);
    let mounted = true;
    try {
      const mammoth = await import("mammoth");
      const buf = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer: buf });
      if (mounted) setCvText(res.value);
    } catch {
      if (mounted) setCvText("No se pudo parsear el CV.");
    }
    return () => { mounted = false; };
  };
  const enviar=()=>{
    if(!form.nombre?.trim()||!form.email?.trim()) return;
    setEnviando(true);
    setTimeout(()=>{
      const app={id:Date.now(),vacanteId:selected,cargo:vacante.cargo,area:vacante.area,nombre:form.nombre,email:form.email,
        respuestas:(vacante.preguntas||[]).map((p,i)=>({pregunta:p,respuesta:form[`q_${i}`]||""})),
        cvTexto:cvText,cvNombre,estado:"Aplicado",aplicadoEn:new Date().toLocaleDateString("es-CO"),score:null};
      setState(s=>({...s,aplicaciones:[...s.aplicaciones,app]}));
      setEnviando(false); setExito(true);
      setTimeout(()=>{setExito(false);setSelected(null);setForm({});setCvText("");setCvNombre("");},2000);
    },600);
  };
  if(exito) return <div className="max-w-md mx-auto mt-20 text-center"><div className="text-5xl mb-4">🎉</div><h2 className="text-xl font-bold text-gray-800 mb-2">¡Aplicación enviada!</h2><p className="text-gray-500 text-sm">Tu postulación fue registrada exitosamente.</p></div>;
  if(vacante) return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Aplicar: {vacante.cargo}</h2>
        <button onClick={()=>{setSelected(null);setForm({});setCvText("");setCvNombre("");}} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-1">{vacante.cargo} — {vacante.area}</p><p>{vacante.perfil}</p>
          {(vacante.salarioMin||vacante.salarioMax)&&<p className="mt-1 text-xs text-gray-500">💰 {vacante.salarioMin} – {vacante.salarioMax}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
            <input value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Tu nombre"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico *</label>
            <input type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="tu@email.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">CV (archivo .docx)</label>
          <label className="flex items-center gap-3 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-400 transition">
            <Briefcase size={18} className="text-gray-400"/><span className="text-sm text-gray-500">{cvNombre||"Seleccionar archivo .docx"}</span>
            <input type="file" accept=".docx" className="hidden" onChange={handleCV}/>
          </label>
          {cvText&&<p className="text-xs text-green-600 mt-1">✓ CV parseado ({cvText.length} caracteres)</p>}
        </div>
        {(vacante.preguntas||[]).length>0&&<div>
          <p className="text-sm font-medium text-gray-700 mb-2">Preguntas de Filtrado</p>
          <div className="space-y-3">{vacante.preguntas.map((p,i)=>(
            <div key={i}><label className="block text-xs text-gray-600 mb-1">❓ {p}</label>
              <textarea rows={2} value={form[`q_${i}`]||""} onChange={e=>setForm(f=>({...f,[`q_${i}`]:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Tu respuesta..."/>
            </div>
          ))}</div>
        </div>}
        <div className="flex gap-3 pt-2">
          <button onClick={enviar} disabled={enviando||!form.nombre?.trim()||!form.email?.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
            {enviando?"Enviando...":"Enviar Aplicación"}</button>
          <button onClick={()=>{setSelected(null);setForm({});setCvText("");setCvNombre("");}} className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-lg font-bold text-gray-800 mb-4">Ofertas de Trabajo
        <span className="ml-2 text-sm font-normal bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{publicadas.length}</span>
      </h2>
      {publicadas.length===0?<div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400"><Briefcase size={40} className="mx-auto mb-3 text-gray-300"/><p className="font-medium">No hay vacantes disponibles.</p></div>
      :publicadas.map(r=>(
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 mb-3 flex items-center justify-between">
          <div><p className="font-semibold text-gray-800">{r.cargo}</p>
            <p className="text-xs text-gray-500">{r.area} · {r.posiciones} pos.</p>
            {(r.salarioMin||r.salarioMax)&&<p className="text-xs text-gray-400 mt-0.5">💰 {r.salarioMin} – {r.salarioMax}</p>}
          </div>
          <button onClick={()=>setSelected(r.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Aplicar</button>
        </div>
      ))}
    </div>
  );
}

// ─── Módulo Mis Aplicaciones (Candidato) ─────────────────────
function ModuloMisApps({ state }) {
  const [email,setEmail]=useState("");
  const [buscado,setBuscado]=useState(false);
  const misApps=email?state.aplicaciones.filter(a=>a.email.toLowerCase()===email.toLowerCase()):[];
  const nivelColor={ Alto:"bg-green-100 text-green-700", Medio:"bg-amber-100 text-amber-700", Bajo:"bg-red-100 text-red-600" };
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Mis Aplicaciones</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
        <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&setBuscado(true)}
          placeholder="Ingresa tu correo para ver tus postulaciones"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
        <button onClick={()=>setBuscado(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Buscar</button>
      </div>
      {buscado&&misApps.length===0&&<div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400"><ClipboardList size={36} className="mx-auto mb-2 text-gray-300"/><p className="font-medium">No se encontraron aplicaciones</p></div>}
      {misApps.map(a=>(
        <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-2">
            <div><p className="font-semibold text-gray-800">{a.cargo}</p>
              <p className="text-xs text-gray-500">{a.area} · {a.aplicadoEn}</p>
              {a.cvNombre&&<p className="text-xs text-indigo-500 mt-0.5">📄 {a.cvNombre}</p>}</div>
            <div className="flex flex-col items-end gap-1"><StatusBadge estado={a.estado}/>
              {a.score!==null&&<span className={`text-xs font-bold px-2 py-0.5 rounded-full ${nivelColor[a.nivel]||"bg-gray-100 text-gray-500"}`}>Score: {a.score}/100</span>}
            </div>
          </div>
          {a.recomendacion&&<div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-xs text-gray-600">💡 {a.recomendacion}</p>
            {a.fortalezas?.length>0&&<p className="text-xs text-green-700">✓ {a.fortalezas.join(" · ")}</p>}
            {a.debilidades?.length>0&&<p className="text-xs text-red-500">✗ {a.debilidades.join(" · ")}</p>}
          </div>}
        </div>
      ))}
    </div>
  );
}

// ─── Módulo Mis Vacantes (Hiring Manager) ────────────────────
function ModuloMisVacantes({ state }) {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Mis Vacantes</h2>
      {state.requisiciones.length===0?<div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400"><Briefcase size={40} className="mx-auto mb-3 text-gray-300"/><p>No tienes vacantes aún</p></div>
      :state.requisiciones.map(r=>{
        const cands=state.aplicaciones.filter(a=>a.vacanteId===r.id);
        const evaluados=cands.filter(a=>a.score!==null);
        const topScore=evaluados.length>0?Math.max(...evaluados.map(a=>a.score)):null;
        return <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div><p className="font-semibold text-gray-800">{r.cargo}</p>
              <p className="text-xs text-gray-500">{r.area} · {r.posiciones} pos. · Límite: {r.fechaLimite}</p></div>
            <StatusBadge estado={r.estado}/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-800">{cands.length}</p><p className="text-xs text-gray-500 mt-0.5">Candidatos</p></div>
            <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-indigo-600">{evaluados.length}</p><p className="text-xs text-gray-500 mt-0.5">Evaluados IA</p></div>
            <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-green-600">{topScore!==null?topScore:"—"}</p><p className="text-xs text-gray-500 mt-0.5">Top Score</p></div>
          </div>
          {r.comentarioAprobador&&<p className="text-xs text-gray-500 mt-3 bg-amber-50 rounded px-3 py-2">💬 {r.comentarioAprobador}</p>}
        </div>;
      })}
    </div>
  );
}

// ─── Módulo Dashboard ─────────────────────────────────────────
function ModuloDashboard({ rol, state }) {
  const reqs=state.requisiciones; const apps=state.aplicaciones;
  if(rol==="hiring_manager"){
    const cards=[
      {label:"Total",value:reqs.length,color:"bg-violet-50 border-violet-200 text-violet-700"},
      {label:"Pendientes",value:reqs.filter(r=>r.estado==="Pendiente").length,color:"bg-amber-50 border-amber-200 text-amber-700"},
      {label:"Aprobadas",value:reqs.filter(r=>r.estado==="Aprobada").length,color:"bg-green-50 border-green-200 text-green-700"},
      {label:"Publicadas",value:reqs.filter(r=>r.estado==="Publicada").length,color:"bg-sky-50 border-sky-200 text-sky-700"},
    ];
    return <DashboardShell title="Dashboard — Hiring Manager" cards={cards}>
      <TableSection title="Mis Requisiciones" empty="Sin requisiciones.">{reqs.map(r=>(
        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
          <td className="py-2 px-3 font-medium text-gray-800">{r.cargo}</td>
          <td className="py-2 px-3 text-gray-500">{r.area}</td>
          <td className="py-2 px-3 text-gray-500">{r.posiciones}</td>
          <td className="py-2 px-3"><StatusBadge estado={r.estado}/></td>
          <td className="py-2 px-3 text-gray-400">{r.fechaLimite}</td>
        </tr>
      ))}</TableSection>
    </DashboardShell>;
  }
  if(rol==="aprobador"){
    const ap=reqs.filter(r=>r.estado==="Aprobada").length; const re=reqs.filter(r=>r.estado==="Rechazada").length;
    const cards=[
      {label:"Pendientes",value:reqs.filter(r=>r.estado==="Pendiente").length,color:"bg-amber-50 border-amber-200 text-amber-700"},
      {label:"Aprobadas",value:ap,color:"bg-green-50 border-green-200 text-green-700"},
      {label:"Rechazadas",value:re,color:"bg-red-50 border-red-200 text-red-600"},
      {label:"Tasa Aprobación",value:`${reqs.length>0?Math.round(ap/(ap+re||1)*100):0}%`,color:"bg-indigo-50 border-indigo-200 text-indigo-700"},
    ];
    return <DashboardShell title="Dashboard — Aprobador" cards={cards}>
      <TableSection title="Historial" empty="Sin decisiones.">{reqs.filter(r=>r.estado==="Aprobada"||r.estado==="Rechazada").map(r=>(
        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
          <td className="py-2 px-3 font-medium text-gray-800">{r.cargo}</td>
          <td className="py-2 px-3 text-gray-500">{r.area}</td>
          <td className="py-2 px-3"><StatusBadge estado={r.estado}/></td>
          <td className="py-2 px-3 text-gray-400 text-xs">{r.comentarioAprobador||"—"}</td>
        </tr>
      ))}</TableSection>
    </DashboardShell>;
  }
  if(rol==="reclutador"){
    const evaluados=apps.filter(a=>a.score!==null);
    const avg=evaluados.length>0?Math.round(evaluados.reduce((s,a)=>s+a.score,0)/evaluados.length):"—";
    const cards=[
      {label:"Vacantes Publicadas",value:reqs.filter(r=>r.estado==="Publicada").length,color:"bg-sky-50 border-sky-200 text-sky-700"},
      {label:"Candidatos",value:apps.length,color:"bg-violet-50 border-violet-200 text-violet-700"},
      {label:"Evaluados IA",value:evaluados.length,color:"bg-indigo-50 border-indigo-200 text-indigo-700"},
      {label:"Score Promedio",value:avg,color:"bg-emerald-50 border-emerald-200 text-emerald-700"},
    ];
    const top=[...apps].filter(a=>a.score!==null).sort((a,b)=>b.score-a.score).slice(0,5);
    return <DashboardShell title="Dashboard — Reclutador" cards={cards}>
      <TableSection title="Top Candidatos" empty="Sin evaluados aún.">{top.map((a,i)=>(
        <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
          <td className="py-2 px-3 text-gray-400 font-bold">#{i+1}</td>
          <td className="py-2 px-3 font-medium text-gray-800">{a.nombre}</td>
          <td className="py-2 px-3 text-gray-500">{a.cargo}</td>
          <td className="py-2 px-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${a.score>=75?"bg-green-100 text-green-700":a.score>=50?"bg-amber-100 text-amber-700":"bg-red-100 text-red-600"}`}>{a.score}/100</span></td>
          <td className="py-2 px-3 text-gray-400 text-xs">{a.nivel}</td>
        </tr>
      ))}</TableSection>
    </DashboardShell>;
  }
  return null;
}

// ─── App Principal ────────────────────────────────────────────
export default function App() {
  return <ToastProvider><AppInner/></ToastProvider>;
}

function AppInner() {
  useEffect(() => {
  async function testConnection() {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*");

    console.log("SUPABASE DATA:", data);
    console.log("SUPABASE ERROR:", error);
  }
async function testSupabase() {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*");

  console.log("SUPABASE DATA:", data);
  console.log("SUPABASE ERROR:", error);
}
  testSupabase();
}, []);
    const [state, setState]         = useState(() => loadState());
  const [rol, setRol]             = useState("hiring_manager");
  const [vista, setVista]         = useState("welcome");
  const [sidebarOpen, setSidebar] = useState(true);
  const showToast = useToast();

  useEffect(() => { saveState(state); }, [state]);

  const restablecerDemo = () => {
    showToast({ msg: "Haz clic en cualquier lugar para confirmar el restablecimiento.", type: "warning", duration: 5000 });
    const ctrl = new AbortController();
    const handler = () => {
      if (ctrl.signal.aborted) return;
      ctrl.abort();
      setState(initialState);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      showToast({ msg: "✓ Datos demo restablecidos.", type: "success" });
    };
    setTimeout(() => {
      if (!ctrl.signal.aborted)
        document.addEventListener("click", handler, { once: true, signal: ctrl.signal });
    }, 300);
    setTimeout(() => ctrl.abort(), 5300);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importBackup(file,
      (newState) => { setState(newState); saveState(newState); showToast({ msg: "✓ Backup importado correctamente.", type: "success" }); },
      (msg)      => showToast({ msg: `⚠ ${msg}`, type: "error", duration: 4000 })
    );
    e.target.value = "";
  };

  useEffect(() => { saveState(state); }, [state]);



  const rolInfo  = ROLES.find(r => r.id === rol);
  const navItems = NAV[rol];
  const welcome  = WELCOME[rol];

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-sm">
      <aside className={`${sidebarOpen?"w-60":"w-0 overflow-hidden"} transition-all duration-300 bg-gray-900 flex flex-col`}>
        <div className="px-5 py-4 border-b border-gray-700">
          <span className="text-white font-bold text-lg tracking-tight">🏢 ATS Pro</span>
        </div>
        <div className="px-3 py-3 border-b border-gray-700">
          <p className="text-gray-400 text-xs uppercase mb-2 px-2">Rol activo</p>
          {ROLES.map(r=>(
            <button key={r.id} onClick={()=>{setRol(r.id);setVista("welcome");}}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-2 transition ${rol===r.id?"bg-gray-700 text-white":"text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
              <span className={`w-2 h-2 rounded-full ${r.color}`}/>{r.label}
              {rol===r.id&&<ChevronRight size={14} className="ml-auto"/>}
            </button>
          ))}
        </div>
        <nav className="flex-1 px-3 py-3">
          <p className="text-gray-400 text-xs uppercase mb-2 px-2">Módulos</p>
          {navItems.map(item=>{
            const Icon=item.icon;
            return (
              <button key={item.id} onClick={()=>setVista(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-3 transition ${vista===item.id?"bg-indigo-600 text-white":"text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
                <Icon size={16}/>{item.label}

              </button>
            );
          })}
        </nav>
        <div className="px-5 py-3 border-t border-gray-700">
          <span className={`text-xs text-white px-2 py-1 rounded-full ${rolInfo.color}`}>{rolInfo.label}</span>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <button onClick={()=>setSidebar(o=>!o)} aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"} className="text-gray-500 hover:text-gray-800">
            {sidebarOpen?<X size={20}/>:<Menu size={20}/>}
          </button>
          <h1 className="font-semibold text-gray-700 flex-1">
            {vista==="welcome"?welcome.title:navItems.find(n=>n.id===vista)?.label??vista}
          </h1>

          <button onClick={() => exportBackup(state)}
            className="text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition">
            ⬇ Exportar
          </button>
          <label className="text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition cursor-pointer">
            ⬆ Importar
            <input type="file" accept=".json" className="hidden" onChange={handleImport}/>
          </label>
          <button onClick={restablecerDemo}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition">
            🔄 Restablecer demo
          </button>
          <span className="text-xs text-gray-300 hidden sm:block">💾 Auto-guardado</span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {vista==="welcome"&&(
            <div className="max-w-xl mx-auto mt-16 text-center">
              <div className={`inline-flex w-16 h-16 rounded-2xl ${rolInfo.color} items-center justify-center mb-4`}>
                <Briefcase size={32} className="text-white"/>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{welcome.title}</h2>
              <p className="text-gray-500">{welcome.desc}</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {navItems.map(item=>{const Icon=item.icon;return(
                  <button key={item.id} onClick={()=>setVista(item.id)}
                    className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition text-gray-700">
                    <Icon size={18} className="text-indigo-500"/><span className="font-medium">{item.label}</span>
                  </button>
                );})}
              </div>
            </div>
          )}
          {vista==="requisiciones" && <ModuloRequisiciones state={state} setState={setState}/>}
          {vista==="pendientes"    && <ModuloAprobador     state={state} setState={setState}/>}
          {vista==="historial"     && <ModuloHistorial     state={state}/>}
          {vista==="vacantes"      && <ModuloVacantes      state={state} setState={setState}/>}
          {vista==="candidatos"    && <ModuloCandidatos    state={state} setState={setState}/>}
          {vista==="kanban"        && <ModuloKanban        state={state} setState={setState}/>}
          {vista==="ofertas"       && <ModuloCandidato     state={state} setState={setState}/>}
          {vista==="dashboard"     && <ModuloDashboard     rol={rol} state={state}/>}
          {vista==="mis_apps"      && <ModuloMisApps       state={state}/>}
          {vista==="mis_vacantes"  && <ModuloMisVacantes   state={state}/>}
          {!["welcome","requisiciones","pendientes","historial","vacantes","candidatos","kanban","ofertas","dashboard","mis_apps","mis_vacantes"].includes(vista)&&(
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              <ClipboardList size={40} className="mx-auto mb-3 text-gray-300"/>
              <p className="font-medium">Módulo en construcción</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}