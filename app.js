// ACÁ PONÉ TUS CREDENCIALES
const SUPABASE_URL = 'https://nhfruepiiweznuapwfve.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VYJepoCDxfA-PVvK51Wykw_b6ZAB7jO';

const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const esAdmin = document.getElementById('admin-body') !== null;
let torneoTV = null;      
let torneoAdmin = null;   
let listaTorneos = [];
let tiradoresLocales = [];
let tiradoresMaster = []; 
let tiradorJuezActivoId = null;
let grupoJuecesActivo = 'Todos';
let juezPlatoSeleccionadoIdx = null;
let vueltaJuezActiva = 1; // Para saber en qué ronda/vuelta está el juez

let filtroCategoria = 'Todas';
let filtroBusqueda = '';
let modoVistaTV = 'resultados'; 
let modoTvActivo = false;
let actividadTirador = {}; // id inscripción -> última vez que un juez lo puntuó (para modo sin límite)

const canalRealtime = clienteSupabase.channel('sala-sincronizacion');

setInterval(() => { 
    const ahora = new Date();
    const elReloj = document.getElementById('reloj'); 
    if (elReloj) elReloj.innerText = ahora.toLocaleTimeString('es-AR'); 
    const elFecha = document.getElementById('fecha-top');
    if (elFecha) {
        let opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let fechaStr = ahora.toLocaleDateString('es-AR', opciones);
        elFecha.innerText = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
    }
}, 1000);

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && modoTvActivo) {
        document.getElementById('check-modo-tv').checked = false; modoTvActivo = false;
        document.getElementById('body-app').classList.remove('modo-tv-activo'); detenerScrollAutoTV();
        if (torneoTV) cargarResultados(torneoTV.id);
    }
});

window.mostrarAlerta = function(msg) { document.getElementById('alerta-mensaje').innerText = msg; document.getElementById('modal-alerta').style.display = 'flex'; }
window.cerrarAlerta = function() { document.getElementById('modal-alerta').style.display = 'none'; }
window.mostrarConfirmacion = function(msg, onConfirm) { document.getElementById('confirm-mensaje').innerText = msg; document.getElementById('modal-confirm').style.display = 'flex'; document.getElementById('btn-confirm-ok').onclick = function() { document.getElementById('modal-confirm').style.display = 'none'; onConfirm(); }; }
window.cerrarConfirmacion = function() { document.getElementById('modal-confirm').style.display = 'none'; }

async function verificarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (esAdmin) { if (!session) window.location.href = 'index.html'; else { document.getElementById('admin-body').style.display = 'block'; inicializarDatos(); } } else inicializarDatos(); 
}
window.abrirModalLogin = () => document.getElementById('modal-login').style.display = 'flex';
window.cerrarModalLogin = () => { document.getElementById('modal-login').style.display = 'none'; document.getElementById('login-error').style.display = 'none'; }
window.iniciarSesion = async function() { const { error } = await clienteSupabase.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-pass').value }); if (error) document.getElementById('login-error').style.display = 'block'; else window.location.href = 'admin.html'; }
window.cerrarSesion = async function() { await clienteSupabase.auth.signOut(); window.location.href = 'index.html'; }

async function inicializarDatos() {
    tiradoresLocales = [];
    const { data: torneos } = await clienteSupabase.from('torneos').select('*').order('id', { ascending: true });
    listaTorneos = torneos || [];
    
    if (esAdmin) {
        await cargarMasterDB(); 
        renderizarBotonesTorneosAdmin();
        if (!torneoAdmin && listaTorneos.length > 0) seleccionarTorneoAdmin(listaTorneos[0].id);
        else if (torneoAdmin) seleccionarTorneoAdmin(torneoAdmin.id);
    } else {
        if (torneoTV) await cargarResultados(torneoTV.id);
        else renderizarTarjetasInicio();
    }
}

async function cargarMasterDB() { const { data } = await clienteSupabase.from('tiradores').select('*').order('nombre'); tiradoresMaster = data || []; renderizarMaster(); }

window.renderizarMaster = function() {
    const tbody = document.getElementById('tbody-master'); if (!tbody) return;
    const filtro = document.getElementById('buscador-master').value.toLowerCase();
    let filtrados = tiradoresMaster.filter(t => t.nombre.toLowerCase().includes(filtro));
    tbody.innerHTML = '';
    if (filtrados.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color:var(--text-muted);">No se encontraron tiradores.</td></tr>'; return; }
    filtrados.forEach(t => {
        let catClass = t.categoria.toLowerCase().includes('vet') ? 'supervet' : (t.categoria.toLowerCase().includes('junior') ? 'junior' : (t.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
        tbody.innerHTML += `<tr><td style="font-weight: bold; text-transform: uppercase;">${t.nombre}</td><td><span class="tag-categoria ${catClass}">${t.categoria.toUpperCase()}</span></td><td><button class="btn-outline" style="border-color: var(--success); color: var(--success); margin-right: 5px;" onclick="agregarDesdeMaster('${t.nombre}', '${t.categoria}')">+ Agregar al Torneo</button><button class="btn-outline" onclick="abrirModalEditarMaster('${t.id}')">Editar</button></td></tr>`;
    });
}
window.guardarTiradorMaster = async function() {
    let nom = document.getElementById('input-master-nombre').value.trim(); let cat = document.getElementById('input-master-categoria').value;
    if(!nom) return mostrarAlerta("Debe ingresar un nombre.");
    if (tiradoresMaster.some(t => t.nombre.toLowerCase() === nom.toLowerCase())) return mostrarAlerta("Este tirador ya existe en la Base de Datos Histórica.");
    await clienteSupabase.from('tiradores').insert([{ nombre: nom, categoria: cat }]);
    document.getElementById('input-master-nombre').value = ''; await cargarMasterDB(); mostrarAlerta("Tirador guardado en la base de datos.");
}
window.agregarDesdeMaster = async function(nombre, categoria) {
    if (!torneoAdmin) return mostrarAlerta("Debes seleccionar un torneo primero.");
    let orden = prompt(`Ingresá el Nº de Orden (Turno) para agregar a ${nombre.toUpperCase()}:`); if (!orden) return; 
    orden = parseInt(orden); if (isNaN(orden) || orden <= 0) return mostrarAlerta("Nº de orden inválido.");
    if (tiradoresLocales.some(t => t.orden === orden)) return mostrarAlerta(`El Nº ${orden} ya está ocupado.`);
    
    let resInicial = torneoAdmin.modo_sin_limite ? [] : Array(torneoAdmin.platos_por_serie * (torneoAdmin.vueltas || 1)).fill(null);
    await clienteSupabase.from('inscripciones').insert([{ torneo_id: torneoAdmin.id, orden: orden, tirador: nombre, categoria: categoria, resultados: resInicial, barrage: 0, ausente: false, paralelos_inscriptos: [] }]);
    await cargarResultados(torneoAdmin.id); avisarALaTV(); abrirPestana('tab-torneos', document.querySelector('.tab-btn:last-child')); mostrarAlerta(`¡Agregado exitosamente con el Nº ${orden}!`);
}
window.abrirModalEditarMaster = function(id) {
    const t = tiradoresMaster.find(x => String(x.id) === String(id)); if (!t) return;
    const sel = document.getElementById('edit-master-categoria');
    if (torneoAdmin) renderSelectCategoriasGeneral();
    if (![...sel.options].some(o => o.value === t.categoria)) sel.innerHTML += `<option value="${t.categoria}">${t.categoria}</option>`;
    document.getElementById('edit-master-id').value = t.id; document.getElementById('edit-master-nombre').value = t.nombre; sel.value = t.categoria;
    document.getElementById('modal-editar-master').style.display = 'flex';
}
window.cerrarModalEditarMaster = () => document.getElementById('modal-editar-master').style.display = 'none';
window.guardarEdicionMaster = async function() {
    let id = document.getElementById('edit-master-id').value; let nom = document.getElementById('edit-master-nombre').value.trim(); let cat = document.getElementById('edit-master-categoria').value;
    if(!nom) return mostrarAlerta("El nombre no puede estar vacío.");
    await clienteSupabase.from('tiradores').update({ nombre: nom, categoria: cat }).eq('id', id); cerrarModalEditarMaster(); await cargarMasterDB();
}

window.cambiarDisciplinaUi = function(prefijo) {
    const disc = document.getElementById(`${prefijo}-disciplina`).value;
    const selectPlatos = document.getElementById(`${prefijo}-platos`);
    const containerGrupo = document.getElementById(`${prefijo}-grupo-container`);
    
    selectPlatos.innerHTML = '';
    if (disc === 'Helice') {
        containerGrupo.style.display = 'none';
        [6, 9, 12, 15, 18].forEach(v => selectPlatos.innerHTML += `<option value="${v}">${v} Hélices</option>`);
    } else {
        containerGrupo.style.display = 'flex';
        [10, 15, 20, 25, 30].forEach(v => selectPlatos.innerHTML += `<option value="${v}">${v} Platos</option>`);
    }
    selectPlatos.innerHTML += `<option value="Personalizado">Personalizado</option>`;
    selectPlatos.innerHTML += `<option value="SinLímite">Modo SIN LÍMITE</option>`;
    cambiarPlatosPersonalizado(prefijo);
}
window.cambiarPlatosPersonalizado = function(prefijo) {
    const val = document.getElementById(`${prefijo}-platos`).value;
    document.getElementById(`${prefijo}-platos-custom`).style.display = (val === 'Personalizado') ? 'block' : 'none';
    if(val === 'SinLímite') document.getElementById(`${prefijo}-vueltas`).value = 1; // Forzamos a 1 vuelta si es sin límite
}

// ==========================================
// IMPORTAR EXCEL
// ==========================================
const normTxt = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const limpiarTxt = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

window.importarExcelDesdeArchivo = function(event) {
    const input = event.target; const file = input.files[0];
    if (!file) return;
    if (!torneoAdmin) { input.value = ''; return mostrarAlerta("Seleccioná un torneo primero."); }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false });
            if (filas.length === 0) { input.value = ''; return mostrarAlerta("El Excel está vacío."); }

            // Detectar columnas por encabezado (sin importar mayúsculas, tildes ni orden)
            const idx = { orden: -1, apellido: -1, nombre: -1, completo: -1, cat: -1 };
            let filaInicio = 0;
            filas[0].map(normTxt).forEach((h, i) => {
                if (!h) return;
                if (h === 'n' || h === 'nro' || h === 'num' || h === 'numero' || h === 'orden' || h === 'turno' || h.startsWith('nro ') || h.startsWith('n orden') || h.startsWith('numero') || h.startsWith('orden')) { if (idx.orden < 0) idx.orden = i; }
                else if (h.startsWith('cat')) { if (idx.cat < 0) idx.cat = i; }
                else if (h === 'apellido' || h === 'apellidos') idx.apellido = i;
                else if (h === 'nombre' || h === 'nombres') idx.nombre = i;
                else if (h.includes('apellido') || h.includes('tirador') || h.includes('nombre') || h.includes('participante')) { if (idx.completo < 0) idx.completo = i; }
            });
            const hayEncabezado = Object.values(idx).some(v => v >= 0);
            if (hayEncabezado) filaInicio = 1;
            else {
                // Sin encabezados: Nº | Apellido | Nombre | Categoría  (o Nº | Apellido y Nombre | Categoría)
                const ncol = Math.max(...filas.slice(0, 5).map(f => f.filter(c => c !== '').length));
                idx.orden = 0;
                if (ncol >= 4) { idx.apellido = 1; idx.nombre = 2; idx.cat = 3; } else { idx.completo = 1; idx.cat = 2; }
            }
            // Una sola columna de nombre => es el nombre completo
            if (idx.completo < 0 && idx.apellido >= 0 && idx.nombre < 0) { idx.completo = idx.apellido; idx.apellido = -1; }
            if (idx.completo < 0 && idx.nombre >= 0 && idx.apellido < 0) { idx.completo = idx.nombre; idx.nombre = -1; }
            if (idx.completo < 0 && idx.apellido < 0) { input.value = ''; return mostrarAlerta("No encontré las columnas de nombre/apellido en el Excel."); }

            const cats = obtenerCategorias(torneoAdmin);
            const catPorNorm = {}; cats.forEach(c => catPorNorm[normTxt(c)] = c);
            const buscarCategoria = (txt) => {
                const n = normTxt(txt); if (!n) return null;
                if (catPorNorm[n]) return catPorNorm[n];
                const k = Object.keys(catPorNorm).find(c => c.startsWith(n) || n.startsWith(c) || c.replace(/ /g, '') === n.replace(/ /g, ''));
                return k ? catPorNorm[k] : null;
            };

            const ocupados = new Set(tiradoresLocales.map(t => t.orden));
            let proximoLibre = 1;
            const siguienteLibre = () => { while (ocupados.has(proximoLibre)) proximoLibre++; return proximoLibre; };
            const resInicial = () => torneoAdmin.modo_sin_limite ? [] : Array(torneoAdmin.platos_por_serie * (torneoAdmin.vueltas || 1)).fill(null);

            const nuevos = [], nuevosMaster = [], omitidos = [];
            const nombresMaster = new Set(tiradoresMaster.map(t => normTxt(t.nombre)));
            const nombresEnTorneo = new Set(tiradoresLocales.map(t => normTxt(t.tirador)));

            for (let r = filaInicio; r < filas.length; r++) {
                const f = filas[r];
                let nombre;
                if (idx.apellido >= 0 && idx.nombre >= 0) {
                    const ap = limpiarTxt(f[idx.apellido]), no = limpiarTxt(f[idx.nombre]);
                    nombre = ap && no ? `${ap}, ${no}` : (ap || no);
                } else nombre = limpiarTxt(f[idx.completo]);
                if (!nombre) continue;

                const nNombre = normTxt(nombre);
                if (nombresEnTorneo.has(nNombre)) { omitidos.push(`${nombre} (ya inscripto)`); continue; }

                let orden = idx.orden >= 0 ? parseInt(String(f[idx.orden]).replace(/[^0-9]/g, '')) : NaN;
                if (isNaN(orden) || orden <= 0) orden = siguienteLibre();
                else if (ocupados.has(orden)) { omitidos.push(`${nombre} (Nº ${orden} repetido)`); continue; }

                // Categoría: la del Excel; si no, la de la base histórica; si no, Senior/primera del torneo
                let categoria = idx.cat >= 0 ? buscarCategoria(f[idx.cat]) : null;
                if (!categoria) { const m = tiradoresMaster.find(t => normTxt(t.nombre) === nNombre); if (m) categoria = buscarCategoria(m.categoria) || m.categoria; }
                if (!categoria) categoria = cats.includes('Senior') ? 'Senior' : (cats[0] || 'Senior');

                ocupados.add(orden); nombresEnTorneo.add(nNombre);
                nuevos.push({ torneo_id: torneoAdmin.id, orden, tirador: nombre, categoria, resultados: resInicial(), barrage: 0, ausente: false, paralelos_inscriptos: [] });
                if (!nombresMaster.has(nNombre)) { nombresMaster.add(nNombre); nuevosMaster.push({ nombre, categoria }); }
            }

            if (nuevos.length === 0) {
                input.value = '';
                return mostrarAlerta("No se importó ningún tirador." + (omitidos.length ? ` Omitidos: ${omitidos.slice(0, 5).join(', ')}` : " Revisá que el Excel tenga nº de orden, apellido/nombre y categoría."));
            }

            const { error } = await clienteSupabase.from('inscripciones').insert(nuevos);
            if (error) { input.value = ''; return mostrarAlerta("Error al importar: " + error.message); }
            if (nuevosMaster.length) await clienteSupabase.from('tiradores').insert(nuevosMaster);

            await cargarResultados(torneoAdmin.id); await cargarMasterDB(); avisarALaTV();
            mostrarAlerta(`Se importaron ${nuevos.length} tiradores.` + (omitidos.length ? ` Omitidos ${omitidos.length}: ${omitidos.slice(0, 5).join(', ')}${omitidos.length > 5 ? '...' : ''}` : ''));
        } catch (err) {
            console.error(err); mostrarAlerta("No se pudo leer el archivo Excel.");
        }
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

window.renderizarTarjetasInicio = function() {
    const div = document.getElementById('grid-torneos-publicos'); const inputBuscador = document.getElementById('buscador-torneos-publico'); const filtro = inputBuscador ? inputBuscador.value.toLowerCase() : '';
    if (!div) return; div.innerHTML = '';
    let filtrados = listaTorneos; if (filtro !== '') filtrados = listaTorneos.filter(t => t.nombre.toLowerCase().includes(filtro));
    if (filtrados.length === 0) return div.innerHTML = '<p style="color:var(--text-muted); font-size:1.2rem;">No se encontraron torneos.</p>';
    
    filtrados.forEach(t => {
        let fechaFormat = t.fecha ? `<br><span style="font-size: 0.9rem; color: #888;">${t.fecha.split('-').reverse().join('/')}</span>` : '';
        let badgeLive = t.estado === 'En curso' ? '<span class="badge-en-curso">🔴 EN CURSO</span>' : '';
        let disciplinaStr = t.disciplina ? t.disciplina : 'Helice';
        let word = disciplinaStr === 'Plato' ? 'platos' : 'hélices';
        let objStr = t.modo_sin_limite ? 'Modo Sin Límite' : `${(t.platos_por_serie || 12) * (t.vueltas || 1)} ${word} (${t.vueltas || 1} rondas)`;
        
        div.innerHTML += `<div class="card-publica" onclick="abrirVistaTV('${t.id}')"><h3>${t.nombre} ${badgeLive} ${fechaFormat}</h3><p>• ${disciplinaStr} - ${objStr}</p></div>`;
    });
}
window.abrirVistaTV = async function(id) { document.getElementById('vista-inicio').style.display = 'none'; document.getElementById('vista-tv').style.display = 'block'; torneoTV = listaTorneos.find(t => t.id === id); if (!torneoTV.platos_por_serie) torneoTV.platos_por_serie = 12; document.getElementById('nombre-torneo').innerText = torneoTV.nombre; filtroCategoria = 'Todas'; filtroBusqueda = ''; await cargarResultados(torneoTV.id); }
window.volverAlInicio = function() { document.getElementById('vista-tv').style.display = 'none'; document.getElementById('vista-inicio').style.display = 'block'; torneoTV = null; renderizarTarjetasInicio(); }
window.toggleModoTV = function() {
    modoTvActivo = document.getElementById('check-modo-tv').checked; const bodyEl = document.getElementById('body-app');
    if (modoTvActivo) { bodyEl.classList.add('modo-tv-activo'); let docEl = document.documentElement; if (docEl.requestFullscreen) docEl.requestFullscreen().catch(e=>console.log(e)); else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen(); iniciarScrollAutoTV(); } 
    else { bodyEl.classList.remove('modo-tv-activo'); detenerScrollAutoTV(); if (document.fullscreenElement || document.webkitFullscreenElement) { if (document.exitFullscreen) document.exitFullscreen().catch(e=>console.log(e)); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } }
    if (torneoTV) cargarResultados(torneoTV.id);
}
window.cambiarModoTV = function(modo, btn) { modoVistaTV = modo; document.querySelectorAll('.tab-btn-tv').forEach(b => b.classList.remove('active')); btn.classList.add('active'); document.querySelectorAll('.modo-tv-pane').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); }); document.getElementById(`contenedor-modo-${modo}`).style.display = 'block'; document.getElementById(`contenedor-modo-${modo}`).classList.add('active'); if (torneoTV) cargarResultados(torneoTV.id); }

let frameScrollTV = null;
function iniciarScrollAutoTV() { detenerScrollAutoTV(); document.querySelectorAll('.tbody-resto').forEach(c => { c.dataset.pausa = "true"; c.dataset.scrollReal = 0; c.scrollTop = 0; setTimeout(() => { if (modoTvActivo) c.dataset.pausa = "false"; }, 3000); }); function loopScroll() { if (!modoTvActivo) return; document.querySelectorAll('.tbody-resto').forEach(c => { if (c.scrollHeight > c.clientHeight) { if (c.dataset.pausa === "true") return; let scrollReal = parseFloat(c.dataset.scrollReal || c.scrollTop); let maxScroll = c.scrollHeight - c.clientHeight; if (scrollReal >= maxScroll - 1) { c.scrollTop = maxScroll; c.dataset.pausa = "true"; setTimeout(() => { if (!modoTvActivo) return; c.scrollTop = 0; c.dataset.scrollReal = 0; setTimeout(() => { if (!modoTvActivo) return; c.dataset.pausa = "false"; }, 3000); }, 3500); return; } scrollReal += 0.07; c.dataset.scrollReal = scrollReal; c.scrollTop = Math.floor(scrollReal); } }); frameScrollTV = requestAnimationFrame(loopScroll); } loopScroll(); }
function detenerScrollAutoTV() { if (frameScrollTV) cancelAnimationFrame(frameScrollTV); document.querySelectorAll('.tbody-resto').forEach(c => { c.dataset.scrollReal = 0; c.dataset.pausa = "false"; }); }

function renderizarBotonesTorneosAdmin() { const div = document.getElementById('botones-torneos'); if (!div) return; div.innerHTML = ''; listaTorneos.forEach(t => { div.innerHTML += `<button class="btn-torneo ${torneoAdmin && torneoAdmin.id === t.id ? 'admin-selected' : ''}" onclick="seleccionarTorneoAdmin('${t.id}')">${t.nombre}</button>`; }); }

window.seleccionarTorneoAdmin = async function(id) {
    torneoAdmin = listaTorneos.find(t => t.id === id); if (!torneoAdmin) return;
    if(!torneoAdmin.platos_por_serie) torneoAdmin.platos_por_serie = 12; if(!torneoAdmin.vueltas) torneoAdmin.vueltas = 1; if(!torneoAdmin.paralelos) torneoAdmin.paralelos = [];
    document.getElementById('admin-torneo-titulo').innerText = `${torneoAdmin.nombre}`;
    tiradorJuezActivoId = null; grupoJuecesActivo = 'Todos'; juezPlatoSeleccionadoIdx = null; vueltaJuezActiva = 1;
    document.getElementById('edit-nombre-torneo').value = torneoAdmin.nombre; document.getElementById('edit-fecha-torneo').value = torneoAdmin.fecha || '';
    
    let disc = torneoAdmin.disciplina || 'Helice'; let editDisc = document.getElementById('edit-disciplina'); if (editDisc) { editDisc.value = disc; cambiarDisciplinaUi('edit'); }
    document.getElementById('edit-vueltas').value = torneoAdmin.vueltas;
    
    let editPlatos = document.getElementById('edit-platos'); let editCustom = document.getElementById('edit-platos-custom');
    if (torneoAdmin.modo_sin_limite) {
        editPlatos.value = 'SinLímite';
    } else {
        let encontrado = false; for (let i = 0; i < editPlatos.options.length; i++) { if (editPlatos.options[i].value == torneoAdmin.platos_por_serie) { editPlatos.selectedIndex = i; encontrado = true; break; } }
        if (!encontrado && editPlatos) { editPlatos.value = 'Personalizado'; editCustom.value = torneoAdmin.platos_por_serie; cambiarPlatosPersonalizado('edit'); }
    }
    
    document.getElementById('edit-grupo-size').value = torneoAdmin.tamano_grupo || 1;
    const btnEstado = document.getElementById('btn-estado-torneo'); if (btnEstado) { let enCurso = torneoAdmin.estado === 'En curso'; btnEstado.innerText = enCurso ? '⏹ Finalizar Transmisión' : '▶ Activar "EN CURSO"'; btnEstado.style.backgroundColor = enCurso ? 'var(--danger)' : '#2EA043'; btnEstado.style.color = 'white'; btnEstado.style.border = 'none'; }
    cargarFormularioCostos(); renderizarParalelosConfig(); renderSelectCategoriasGeneral(); renderizarBotonesTorneosAdmin(); await cargarResultados(torneoAdmin.id);
}

window.toggleEstadoTorneoActual = async function() { if (!torneoAdmin) return; let nuevoEstado = (torneoAdmin.estado === 'En curso') ? 'Finalizado' : 'En curso'; await clienteSupabase.from('torneos').update({ estado: nuevoEstado }).eq('id', torneoAdmin.id); torneoAdmin.estado = nuevoEstado; seleccionarTorneoAdmin(torneoAdmin.id); avisarALaTV(); }
window.abrirPestana = function(idTab, elementoBtn) { document.querySelectorAll('.tab-pane').forEach(tab => tab.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active')); document.getElementById(idTab).classList.add('active'); elementoBtn.classList.add('active'); }

async function cargarResultados(idTorneo) {
    if (!idTorneo) return;
    const { data } = await clienteSupabase.from('inscripciones').select('*').eq('torneo_id', idTorneo);
    if (data) {
        data.forEach(row => {
            const tConf = esAdmin ? torneoAdmin : torneoTV;
            if (!row.resultados || !Array.isArray(row.resultados)) {
                row.resultados = tConf.modo_sin_limite ? [] : Array(tConf.platos_por_serie * (tConf.vueltas || 1)).fill(null);
            }
            row.totalAciertos = row.resultados.filter(r => r === 1).length;
            row.totalTirados = row.resultados.filter(r => r !== null).length;
            row.barrage = row.barrage || 0; row.ausente = row.ausente || false; row.puntajeFinal = row.totalAciertos + row.barrage;
            row.paralelos_inscriptos = row.paralelos_inscriptos || [];
        });
        tiradoresLocales = data;
    } else tiradoresLocales = [];

    const objTorneo = esAdmin ? torneoAdmin : torneoTV;
    if (esAdmin) {
        renderizarFiltrosCategorias('filtros-cat-admin', objTorneo); renderizarAdminJueces(); renderizarAdminBaseDatosTorneo(); renderizarStats(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', objTorneo); renderizarPedana('contenedor-pedana-admin', objTorneo);
    } else if (torneoTV) {
        renderizarFiltrosCategorias('filtros-cat-tv', objTorneo); renderizarVistaResultadosUnificada('cabecera-tabla-tv', objTorneo); renderizarPedana('contenedor-pedana-tv', objTorneo);
        if (modoVistaTV === 'dividido') { renderizarVistaResultadosUnificada('cabecera-tabla-split', objTorneo); renderizarPedana('contenedor-pedana-split', objTorneo); }
    }
}

// PARALELOS
function renderizarParalelosConfig() { const cont = document.getElementById('lista-paralelos'); if (!cont || !torneoAdmin) return; let paralelos = torneoAdmin.paralelos || []; cont.innerHTML = ''; if (paralelos.length === 0) { cont.innerHTML = '<span style="color: #666; font-size: 0.9rem;">No hay paralelos configurados.</span>'; } else { paralelos.forEach(p => { cont.innerHTML += `<div style="background: #111; border: 1px solid #333; padding: 8px 12px; border-radius: 4px; display: flex; align-items: center; gap: 10px;"><strong>${p.nombre}</strong> - $${p.costo.toLocaleString('es-AR')}<button class="btn-outline-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="eliminarParalelo('${p.nombre}')">X</button></div>`; }); } }
window.agregarParalelo = async function() { let nombre = document.getElementById('input-nuevo-paralelo-nombre').value.trim(); let costo = parseInt(document.getElementById('input-nuevo-paralelo-costo').value); if (!nombre || isNaN(costo)) return mostrarAlerta("Completá nombre y costo numérico."); if (!torneoAdmin.paralelos) torneoAdmin.paralelos = []; if (torneoAdmin.paralelos.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())) return mostrarAlerta("Ese paralelo ya existe."); torneoAdmin.paralelos.push({ nombre: nombre.toUpperCase(), costo: costo }); await clienteSupabase.from('torneos').update({ paralelos: torneoAdmin.paralelos }).eq('id', torneoAdmin.id); document.getElementById('input-nuevo-paralelo-nombre').value = ''; document.getElementById('input-nuevo-paralelo-costo').value = ''; renderizarParalelosConfig(); renderizarAdminBaseDatosTorneo(); }
window.eliminarParalelo = async function(nombre) { mostrarConfirmacion(`¿Eliminar paralelo ${nombre}?`, async () => { torneoAdmin.paralelos = torneoAdmin.paralelos.filter(p => p.nombre !== nombre); await clienteSupabase.from('torneos').update({ paralelos: torneoAdmin.paralelos }).eq('id', torneoAdmin.id); renderizarParalelosConfig(); renderizarAdminBaseDatosTorneo(); }); }
window.toggleParaleloTirador = async function(idInscripcion, nombreParalelo) { let t = tiradoresLocales.find(x => x.id === idInscripcion); if (!t) return; if (!t.paralelos_inscriptos) t.paralelos_inscriptos = []; if (t.paralelos_inscriptos.includes(nombreParalelo)) { t.paralelos_inscriptos = t.paralelos_inscriptos.filter(p => p !== nombreParalelo); } else { t.paralelos_inscriptos.push(nombreParalelo); } renderizarAdminBaseDatosTorneo(); await clienteSupabase.from('inscripciones').update({ paralelos_inscriptos: t.paralelos_inscriptos }).eq('id', t.id); }

function obtenerCategorias(torneoConfig) { if (!torneoConfig || !torneoConfig.costos) return ["Senior", "Veterano", "Super Vet.", "Dama", "Principiante", "Junior"]; return Object.keys(torneoConfig.costos).filter(k => k !== "Objetivo" && k !== "Retencion"); }
function renderizarFiltrosCategorias(containerId, torneoConfig) { const cont = document.getElementById(containerId); if (!cont || !torneoConfig) return; const cats = obtenerCategorias(torneoConfig); let html = `<button class="btn-cat ${filtroCategoria === 'Todas' ? 'active' : ''}" onclick="setFiltroCategoria('Todas')">Todas</button>`; cats.forEach(c => { html += `<button class="btn-cat ${filtroCategoria === c ? 'active' : ''}" onclick="setFiltroCategoria('${c}')">${c}</button>`; }); cont.innerHTML = html; }
function renderSelectCategoriasGeneral() { if (!torneoAdmin) return; const cats = obtenerCategorias(torneoAdmin); let html = ''; cats.forEach(c => html += `<option value="${c}">${c}</option>`); const selects = ['input-categoria', 'edit-categoria', 'input-master-categoria', 'edit-master-categoria']; selects.forEach(id => { let el = document.getElementById(id); if(el) el.innerHTML = html; }); }
window.setFiltroCategoria = function(cat) { filtroCategoria = cat; const objTorneo = esAdmin ? torneoAdmin : torneoTV; if (esAdmin) { renderizarFiltrosCategorias('filtros-cat-admin', objTorneo); cargarResultados(torneoAdmin.id); } else { renderizarFiltrosCategorias('filtros-cat-tv', objTorneo); cargarResultados(torneoTV.id); } }
window.setFiltroBusqueda = function(txt) { filtroBusqueda = txt.toLowerCase(); if(esAdmin) cargarResultados(torneoAdmin.id); else cargarResultados(torneoTV.id); }
// Un tirador está "tirando" si ya empezó su serie y todavía no la completó.
// En modo sin límite no hay fin definido: se considera tirando si un juez lo puntuó en los últimos 2 minutos.
function estaTirando(row, torneoConfig, maxCols) {
    if (row.ausente) return false;
    if (torneoConfig.modo_sin_limite) { const ts = actividadTirador[row.id]; return !!ts && (Date.now() - ts) < 120000; }
    return row.totalTirados > 0 && row.totalTirados < maxCols;
}
function formatearNombre(nombre) { return nombre.length > 14 ? nombre.substring(0, 14).trim() + '...' : nombre; }

function construirGrupos(torneoConfig, maxCols) {
    const size = torneoConfig.disciplina === 'Plato' ? 5 : 3; // <- tamaño de cada grupo
    const grupos = []; const sinLim = torneoConfig.modo_sin_limite;
    const porRonda = sinLim ? 0 : torneoConfig.platos_por_serie; const vueltas = sinLim ? 1 : (torneoConfig.vueltas || 1);
    if (porRonda > 0) {
        for (let v = 0; v < vueltas; v++) for (let a = 0; a < porRonda; a += size) { const b = Math.min(a + size, porRonda); grupos.push({ ini: v * porRonda + a, fin: v * porRonda + b, ronda: v + 1, desde: a + 1, hasta: b }); }
    } else {
        for (let a = 0; a < maxCols; a += size) { const b = Math.min(a + size, maxCols); grupos.push({ ini: a, fin: b, ronda: 1, desde: a + 1, hasta: b }); }
    }
    return grupos;
}

function renderizarVistaResultadosUnificada(idCabecera, torneoConfig) {
    const theadDOM = document.getElementById(idCabecera); if (!theadDOM || !torneoConfig) return;
    const tabla = theadDOM.parentElement; 
    let maxCols = torneoConfig.modo_sin_limite ? 0 : (torneoConfig.platos_por_serie * (torneoConfig.vueltas || 1));
    if(torneoConfig.modo_sin_limite) { tiradoresLocales.forEach(t => { if(t.resultados.length > maxCols) maxCols = t.resultados.length; }); maxCols = Math.max(10, maxCols); }
    
    tabla.className = maxCols > 12 ? 'muchos-platos' : '';
    let listaFiltrada = [...tiradoresLocales];
    if (filtroCategoria !== 'Todas') listaFiltrada = listaFiltrada.filter(t => t.categoria === filtroCategoria);
    if (filtroBusqueda !== '') listaFiltrada = listaFiltrada.filter(t => t.tirador.toLowerCase().includes(filtroBusqueda) || t.categoria.toLowerCase().includes(filtroBusqueda) || t.orden.toString() === filtroBusqueda);
    
    listaFiltrada.sort((a, b) => { if (a.ausente && !b.ausente) return 1; if (!a.ausente && b.ausente) return -1; return b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden; });
    let posActual = 1; let lastScoreIdentifier = null;
    listaFiltrada.forEach((row, index) => { if (row.ausente) { row.posicionFija = '-'; return; } let currentScoreIdentifier = `${row.puntajeFinal}-${row.barrage}-${row.totalAciertos}`; if (lastScoreIdentifier !== currentScoreIdentifier) { posActual = index + 1; lastScoreIdentifier = currentScoreIdentifier; } row.posicionFija = posActual; });

    const wPos = '4%', wNum = '4%', wTirador = '21%', wCat = '8%', wTot = '5.5%', wBar = '5.5%', wFin = '6%';
    // Con muchos objetivos (>12) se agrupan de a 6 (hélice) o de a 5 (plato), respetando las rondas, y se muestra el parcial "5/6"
    const agrupar = maxCols > 12; const grupos = agrupar ? construirGrupos(torneoConfig, maxCols) : [];
    const wPlato = (46 / Math.max(1, agrupar ? grupos.length : maxCols)) + '%'; 

    let htmlCabecera = `<thead id="${idCabecera}"><tr><th style="width:${wPos}; text-align:center;">POS.</th><th style="width:${wNum}; text-align:center;">Nº</th><th style="width:${wTirador}; text-align:left; padding-left:15px;">TIRADOR</th><th style="width:${wCat}; text-align:center;">CAT.</th>`;
    for(let i=1; i<=(agrupar ? 0 : maxCols); i++) {
        let title = i;
        if (!torneoConfig.modo_sin_limite && (torneoConfig.vueltas || 1) > 1) { let v = Math.ceil(i/torneoConfig.platos_por_serie); let numPlatoEnV = i - ((v-1)*torneoConfig.platos_por_serie); title = `R${v}<br>${numPlatoEnV}`; }
        htmlCabecera += `<th style="width:${wPlato}; text-align:center;">${title}</th>`;
    }
    if (agrupar) grupos.forEach(g => {
        const rango = (g.hasta - g.desde === 0) ? `${g.desde}` : `${g.desde}-${g.hasta}`;
        const titulo = (!torneoConfig.modo_sin_limite && (torneoConfig.vueltas || 1) > 1) ? `R${g.ronda}<br>${rango}` : rango;
        htmlCabecera += `<th style="width:${wPlato}; text-align:center;">${titulo}</th>`;
    });
    htmlCabecera += `<th style="width:${wTot}; text-align:center;">TOTAL</th><th style="width:${wBar}; text-align:center;">BARRAGE</th><th style="width:${wFin}; text-align:center;">FINAL</th></tr></thead>`;

    function buildFilas(lista) {
        let html = '';
        lista.forEach(row => {
            let htmlPlatosMultiTD = '';
            for(let i = 0; i < (agrupar ? 0 : maxCols); i++) {
                let val = row.resultados[i];
                if (val === 1) htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box plate-hit mx-auto">✔</div></td>`; 
                else if (val === 0) htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box plate-miss mx-auto">✖</div></td>`; 
                else htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box mx-auto">-</div></td>`;
            }
            if (agrupar) grupos.forEach(g => {
                let mini = '', hits = 0, tir = 0;
                for (let k = g.ini; k < g.fin; k++) {
                    const val = row.resultados[k];
                    if (val === 1) { hits++; tir++; mini += '<span class="plate-mini hit"></span>'; }
                    else if (val === 0) { tir++; mini += '<span class="plate-mini miss"></span>'; }
                    else mini += '<span class="plate-mini"></span>';
                }
                const tam = g.fin - g.ini; const sc = tir === 0 ? '-' : `${hits}/${tam}`; const cls = (tir > 0 && hits === tam) ? ' perfecto' : '';
                htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="grupo-celda"><div class="grupo-plates">${mini}</div><div class="grupo-score${cls}">${sc}</div></div></td>`;
            });
            let barrageTxt = row.barrage > 0 && !row.ausente ? `<span style="color:var(--accent-yellow); font-weight:900;">${row.barrage}</span>` : '-';
            let enSerieCond = torneoConfig.modo_sin_limite ? (row.totalAciertos > 0 && row.totalAciertos === row.totalTirados) : (row.totalAciertos === maxCols && maxCols > 0);
            let badgeSerie = enSerieCond && !row.ausente ? `<span class="badge-serie">EN SERIE</span>` : '';
            let badgeTirando = estaTirando(row, torneoConfig, maxCols) ? `<span class="badge-tirando">TIRANDO</span>` : '';
            let ausenteBadge = row.ausente ? `<span style="background:var(--danger); color:white; font-size:0.65rem; padding:2px 6px; border-radius:3px; margin-left:8px; font-weight:bold;">AUSENTE</span>` : '';
            let catClass = row.categoria.toLowerCase().includes('vet') ? 'supervet' : (row.categoria.toLowerCase().includes('junior') ? 'junior' : (row.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
            
            html += `<tr style="${row.ausente ? 'opacity: 0.35;' : ''}"><td style="width:${wPos}; color: white; font-weight: bold; background-color: #050505; text-align:center;">${row.posicionFija}</td><td style="width:${wNum}; text-align:center; font-weight: normal; color: #AAA;">${row.orden}</td><td style="width:${wTirador}; text-align: left; padding-left:15px; font-weight:bold; white-space:nowrap; overflow:hidden; color:white;" title="${row.tirador}">${formatearNombre(row.tirador)} ${badgeSerie} ${badgeTirando} ${ausenteBadge}</td><td style="width:${wCat}; font-size: 0.85rem; text-align:center;"><span class="tag-categoria ${catClass}">${row.categoria.toUpperCase()}</span></td>${htmlPlatosMultiTD}<td style="width:${wTot}; font-size: 1.3rem; font-weight: bold; text-align:center; color:white;">${row.ausente ? '-' : row.totalAciertos}</td><td style="width:${wBar}; font-size: 1.2rem; font-weight: bold; text-align:center;">${barrageTxt}</td><td style="width:${wFin}; font-size: 1.6rem; font-weight: bold; color: white; text-align:center;">${row.ausente ? '-' : row.puntajeFinal}</td></tr>`;
        });
        return html;
    }

    let htmlCompleto = htmlCabecera;
    if (modoTvActivo) {
        let enSerie = listaFiltrada.filter(t => (torneoConfig.modo_sin_limite ? (t.totalAciertos > 0 && t.totalAciertos === t.totalTirados) : (t.totalAciertos === maxCols && t.totalTirados > 0)) && !t.ausente);
        let resto = listaFiltrada.filter(t => !((torneoConfig.modo_sin_limite ? (t.totalAciertos > 0 && t.totalAciertos === t.totalTirados) : (t.totalAciertos === maxCols && t.totalTirados > 0)) && !t.ausente));
        htmlCompleto += `<tbody class="tbody-enserie">`;
        if(enSerie.length > 0) { htmlCompleto += `<tr class="tr-separador"><td colspan="100%"><div class="separador-box">EN SERIE</div></td></tr>` + buildFilas(enSerie); }
        htmlCompleto += `</tbody>`;
        if(resto.length > 0) { htmlCompleto += `<tbody class="tbody-resto-header"><tr class="tr-separador"><td colspan="100%"><div class="separador-box">RESTO DE LOS TIRADORES</div></td></tr></tbody><tbody class="tbody-resto">` + buildFilas(resto) + `</tbody>`; }
    } else { htmlCompleto += `<tbody>` + buildFilas(listaFiltrada) + `</tbody>`; }
    tabla.innerHTML = htmlCompleto;
}

function renderizarPedana(containerId, torneoConfig) {
    const cont = document.getElementById(containerId); if (!cont || !torneoConfig) return;
    let lista = [...tiradoresLocales].sort((a,b) => a.orden - b.orden);
    if (lista.length === 0) { cont.innerHTML = '<h3 style="text-align:center;">No hay tiradores</h3>'; return; }
    let idx = torneoConfig.tirador_actual_index || 0; if (idx >= lista.length) idx = lista.length - 1; let actual = lista[idx];

    let htmlPlatos = `<div class="plates-container" style="flex-wrap: wrap; justify-content: center; margin-top: 15px; gap: 6px;">`;
    let tirados = 0; let totalP = torneoConfig.modo_sin_limite ? Math.max(5, actual.resultados.length) : (torneoConfig.platos_por_serie * (torneoConfig.vueltas || 1));
    for(let i=0; i<totalP; i++){
        let val = actual.resultados[i]; if(val !== null && val !== undefined) tirados++;
        if(val === 1) htmlPlatos += `<div class="plate-box pedana-plate plate-hit">✔</div>`; else if (val === 0) htmlPlatos += `<div class="plate-box pedana-plate plate-miss">✖</div>`; else htmlPlatos += `<div class="plate-box pedana-plate" style="background-color: #111;"></div>`;
    }
    htmlPlatos += '</div>';

    let htmlNext = `<div style="text-align: left; position: relative;"><div class="pedana-lbl-prox">PRÓXIMOS TIRADORES</div><div class="pedana-next-grid">`;
    for(let i=1; i<=3; i++) {
        let sig = lista[idx + i];
        if (sig) {
            let catClass = sig.categoria.toLowerCase().includes('vet') ? 'supervet' : (sig.categoria.toLowerCase().includes('junior') ? 'junior' : (sig.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
            let nombreMostrar = sig.ausente ? `<span style="opacity:0.5;">${formatearNombre(sig.tirador)} [AUS]</span>` : formatearNombre(sig.tirador);
            htmlNext += `<div class="pedana-next-box"><div class="pedana-next-orden">${sig.orden}</div><div class="pedana-next-nombre">${nombreMostrar}</div><div><span class="tag-categoria ${catClass}" style="font-size: 0.9rem; padding: 4px 10px;">${sig.categoria.toUpperCase()}</span></div></div>`;
        } else { htmlNext += `<div class="pedana-next-box" style="opacity: 0.1;"><div class="pedana-next-orden">-</div></div>`; }
    }
    htmlNext += '</div></div>';

    let catClassAct = actual.categoria.toLowerCase().includes('vet') ? 'supervet' : (actual.categoria.toLowerCase().includes('junior') ? 'junior' : (actual.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
    let subTxt = torneoConfig.modo_sin_limite ? `${tirados} TIRADOS EN MODO SIN LÍMITE` : `DE ${totalP} OBJETIVOS • ${tirados} TIRADOS`;
    cont.innerHTML = `<div class="pedana-container"><div class="pedana-main" style="${actual.ausente ? 'opacity:0.5;' : ''}"><div class="pedana-lbl">LLAMADO A PEDANA</div><div class="pedana-orden">${actual.orden}</div><div class="pedana-nombre">${actual.ausente ? 'AUSENTE: ' : ''}${actual.tirador}</div><div><span class="tag-categoria ${catClassAct}" style="font-size: 1.1rem; padding: 5px 16px;">${actual.categoria.toUpperCase()}</span></div>${htmlPlatos}<div class="pedana-stats"><span class="numero-grande">${actual.totalAciertos}</span><span class="texto-chico">${subTxt}</span></div></div>${htmlNext}</div>`;
}

window.cambiarPedana = async function(delta) { if (!torneoAdmin) return; let max = tiradoresLocales.length - 1; let newIdx = (torneoAdmin.tirador_actual_index || 0) + delta; if (newIdx < 0) newIdx = 0; if (newIdx > max) newIdx = max; await clienteSupabase.from('torneos').update({ tirador_actual_index: newIdx }).eq('id', torneoAdmin.id); torneoAdmin.tirador_actual_index = newIdx; renderizarPedana('contenedor-pedana-admin', torneoAdmin); avisarALaTV(); }
async function sincronizarPedanaConJuez(idSeleccionado) { const porOrden = [...tiradoresLocales].sort((a, b) => a.orden - b.orden); let i = porOrden.findIndex(x => x.id === idSeleccionado); if (i !== -1) { let indexPedana = i + 1; if (indexPedana >= porOrden.length) indexPedana = Math.max(0, porOrden.length - 1); await clienteSupabase.from('torneos').update({ tirador_actual_index: indexPedana }).eq('id', torneoAdmin.id); torneoAdmin.tirador_actual_index = indexPedana; renderizarPedana('contenedor-pedana-admin', torneoAdmin); avisarALaTV(); } }

function claveRanking(t) { return [t.puntajeFinal, t.barrage || 0, t.totalAciertos]; }
function mismoRanking(a, b) { const x = claveRanking(a), y = claveRanking(b); return x[0] === y[0] && x[1] === y[1] && x[2] === y[2]; }
function ganadoresDeCategoria(cat) {
    const lista = tiradoresLocales.filter(t => t.categoria === cat && !t.ausente); if (lista.length === 0) return null;
    const conTiros = lista.filter(t => t.totalTirados > 0); 
    let totP = torneoAdmin.modo_sin_limite ? 9999 : (torneoAdmin.platos_por_serie * (torneoAdmin.vueltas || 1));
    const provisorio = torneoAdmin.modo_sin_limite ? true : lista.some(t => t.totalTirados < totP);
    if (conTiros.length === 0) return { ganadores: [], empate: false, provisorio: true, total: lista.length };
    const ordenados = [...conTiros].sort((a, b) => b.puntajeFinal - a.puntajeFinal || (b.barrage || 0) - (a.barrage || 0) || b.totalAciertos - a.totalAciertos || a.orden - b.orden);
    const mejor = ordenados[0]; const ganadores = ordenados.filter(t => mismoRanking(t, mejor)); let esEmpate = ganadores.length > 1; return { ganadores, empate: esEmpate, provisorio, total: lista.length };
}
function htmlGanadoresPorCategoria() { let html = '<div class="winners-grid">'; obtenerCategorias(torneoAdmin).forEach(cat => { const g = ganadoresDeCategoria(cat); if (!g) { html += `<div class="winner-box vacio"><h4>${cat.toUpperCase()}</h4><div class="winner-name" style="color:var(--text-muted); font-size:1rem;">Sin tiradores</div></div>`; return; } const estado = g.provisorio ? '<span class="winner-estado prov">PROVISORIO</span>' : '<span class="winner-estado fin">FINAL</span>'; if (g.ganadores.length === 0) { html += `<div class="winner-box"><h4>${cat.toUpperCase()} ${estado}</h4><div class="winner-name" style="color:var(--text-muted); font-size:1rem;">Aún sin resultados</div></div>`; return; } const nombres = g.ganadores.map(t => `<div class="winner-name">${t.tirador} <span class="winner-orden">Nº ${t.orden}</span></div>`).join(''); html += `<div class="winner-box ${g.empate ? 'empate' : 'unico'}"><h4>${cat.toUpperCase()} ${estado}</h4>${g.empate ? `<div class="winner-tag">EMPATE</div>` : ''}${nombres}<div class="winner-pts">${g.ganadores[0].totalAciertos} ${torneoAdmin.modo_sin_limite?'aciertos':`de ${torneoAdmin.platos_por_serie * (torneoAdmin.vueltas||1)}`}${g.ganadores[0].barrage > 0 ? ` (barrage ${g.ganadores[0].barrage})` : ''}</div></div>`; }); return html + '</div>'; }

function htmlStatsObjetivos(presentes) {
    const sinLim = torneoAdmin.modo_sin_limite; const porRonda = torneoAdmin.platos_por_serie; const vueltas = torneoAdmin.vueltas || 1;
    const datos = {};
    presentes.forEach(t => t.resultados.forEach((r, i) => {
        if (r === null || r === undefined) return;
        const n = (sinLim || !porRonda) ? i + 1 : (i % porRonda) + 1;
        if (!datos[n]) datos[n] = { t: 0, h: 0 };
        datos[n].t++; if (r === 1) datos[n].h++;
    }));
    const nums = Object.keys(datos).map(Number).sort((a, b) => a - b);
    const titulo = '<h2 class="titulo-amarillo">ACIERTO POR OBJETIVO</h2>';
    if (nums.length === 0) return titulo + '<p style="color:var(--text-muted);">Todavía no hay objetivos tirados.</p>';

    const pct = n => Number((datos[n].h / datos[n].t * 100).toFixed(2));
    const maxP = Math.max(...nums.map(pct)), minP = Math.min(...nums.map(pct));
    const iguales = maxP === minP;
    const mejores = nums.filter(n => pct(n) === maxP), peores = nums.filter(n => pct(n) === minP);
    const fmt = arr => arr.length === 1 ? `Objetivo ${arr[0]}` : `Objetivos ${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`;
    const detalle = n => `${pct(n).toFixed(1)}% (${datos[n].h} de ${datos[n].t})`;

    let cajas = '';
    if (!iguales) {
        cajas = `<div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
            <div class="stat-box" style="border-top-color: var(--accent-yellow);"><h4>MÁS ACERTADO</h4><div class="val" style="font-size:1.8rem;">${fmt(mejores)}</div><div class="sub">${detalle(mejores[0])}</div></div>
            <div class="stat-box" style="border-top-color: var(--danger);"><h4>MÁS ERRADO</h4><div class="val" style="font-size:1.8rem;">${fmt(peores)}</div><div class="sub">${detalle(peores[0])}</div></div></div>`;
    }

    const altoMax = 180;
    const barras = nums.map(n => {
        const p = pct(n); const color = iguales ? '#198754' : (p === maxP ? 'var(--accent-yellow)' : (p === minP ? 'var(--danger)' : '#198754'));
        return `<div style="flex: 1; min-width: 44px; display: flex; flex-direction: column; align-items: center;" title="Objetivo ${n}: ${detalle(n)}">
            <div style="height: ${altoMax + 22}px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; width: 100%;">
                <div style="font-size: 0.8rem; font-weight: bold; color: white; margin-bottom: 4px;">${Math.round(p)}%</div>
                <div style="width: 100%; max-width: 56px; height: ${Math.max(2, Math.round(p * altoMax / 100))}px; background-color: ${color}; border-radius: 4px 4px 0 0;"></div>
            </div>
            <div style="border-top: 1px solid var(--border); width: 100%; text-align: center; padding-top: 6px; font-weight: bold; color: white; font-size: 0.9rem;">${n}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${datos[n].h}/${datos[n].t}</div></div>`;
    }).join('');

    const nota = (!sinLim && vueltas > 1) ? `Cada objetivo suma los resultados de las ${vueltas} rondas.` : '';
    const leyenda = iguales ? 'Todos los objetivos tienen el mismo porcentaje de acierto.' : '<span style="color:var(--accent-yellow);">■</span> más acertado &nbsp; <span style="color:var(--danger);">■</span> más errado';
    return `${titulo}${cajas}<div style="background-color: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <div style="display:flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; font-size: 0.85rem; color: var(--text-muted);"><span>% de acierto por número de objetivo ${nota}</span><span>${leyenda}</span></div>
        <div style="display: flex; align-items: flex-end; gap: 8px; overflow-x: auto;">${barras}</div></div>`;
}

function renderizarStats() {
    const cont = document.getElementById('contenedor-stats'); if (!cont || !torneoAdmin) return; if (tiradoresLocales.length === 0) { cont.innerHTML = '<p>No hay datos.</p>'; return; }
    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    const catsList = obtenerCategorias(torneoAdmin); let presentes = tiradoresLocales.filter(t => !t.ausente); let totTiradores = presentes.length; let totObjetivos = torneoAdmin.modo_sin_limite ? '∞' : (totTiradores * torneoAdmin.platos_por_serie * (torneoAdmin.vueltas || 1)); let tirados = 0, pegados = 0, errados = 0, recaudado = 0; let catsCount = {}; catsList.forEach(c => catsCount[c] = 0);
    let paralelos = torneoAdmin.paralelos || [];
    presentes.forEach(t => { if(catsCount[t.categoria] !== undefined) catsCount[t.categoria]++; else catsCount[t.categoria] = 1; let subtotal = (costos[t.categoria] || 0); let pins = t.paralelos_inscriptos || []; paralelos.forEach(p => { if(pins.includes(p.nombre)) subtotal += p.costo; }); recaudado += subtotal; t.resultados.forEach(r => { if(r !== null && r !== undefined) { tirados++; if(r===1) pegados++; else errados++; } }); });
    let premios = Math.max(0, recaudado - (tirados * (costos["Objetivo"] || 1000)) - ((recaudado * (costos["Retencion"] || 10)) / 100));
    let htmlCatsGrid = ''; catsList.forEach(c => { htmlCatsGrid += `<div class="stat-box"><h4>${c.toUpperCase()}</h4><div class="val">${catsCount[c] || 0}</div></div>`; });
    cont.innerHTML = `<h2 class="titulo-amarillo">OBJETIVOS Y PARTICIPACIÓN</h2><div style="color: var(--danger); font-weight: bold; margin-bottom: 15px; font-size: 0.9rem;">(Los ${tiradoresLocales.length - presentes.length} tiradores ausentes han sido excluidos del conteo)</div><div class="stats-grid"><div class="stat-box azul"><h4>OBJETIVOS TOTALES</h4><div class="val">${totObjetivos}</div><div class="sub">${torneoAdmin.modo_sin_limite?'Sin límite':`${totTiradores} pres. x ${torneoAdmin.platos_por_serie * (torneoAdmin.vueltas||1)} platos`}</div></div><div class="stat-box" style="border-top-color: white;"><h4>TIRADOS</h4><div class="val">${tirados}</div><div class="sub">${torneoAdmin.modo_sin_limite?'-':(totObjetivos - tirados)} por tirar</div></div><div class="stat-box verde"><h4>ACERTADOS</h4><div class="val">${pegados}</div><div class="sub">${tirados>0?((pegados/tirados)*100).toFixed(1):0}% de aciertos</div></div><div class="stat-box rojo"><h4>ERRADOS</h4><div class="val">${errados}</div><div class="sub">${tirados>0?((errados/tirados)*100).toFixed(1):0}% de errados</div></div></div>${htmlStatsObjetivos(presentes)}<h2 class="titulo-amarillo">TIRADORES POR CATEGORÍA</h2><div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">${htmlCatsGrid}</div><h2 class="titulo-amarillo">GANADORES POR CATEGORÍA</h2>${htmlGanadoresPorCategoria()}<h2 class="titulo-amarillo">FINANZAS</h2><div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);"><div class="stat-box"><h4>TOTAL RECAUDADO</h4><div class="val">$ ${(recaudado).toLocaleString('es-AR')}</div><div class="sub">Inscripciones + Paralelos</div></div><div class="stat-box"><h4>SE QUEDA EL CLUB</h4><div class="val" style="color:var(--accent-yellow);">$ ${(recaudado - premios).toLocaleString('es-AR')}</div><div class="sub">Retención + Objetivos</div></div><div class="stat-box"><h4>VA A PREMIOS</h4><div class="val">$ ${(premios).toLocaleString('es-AR')}</div></div></div>`;
}

function cargarFormularioCostos() {
    if (!torneoAdmin) return; const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    const contCat = document.getElementById('contenedor-inputs-costos'); const contSis = document.getElementById('contenedor-sistema-costos');
    if(!contCat || !contSis) return; contCat.innerHTML = ''; contSis.innerHTML = '';
    for (let key in costos) {
        let isSystem = (key === "Objetivo" || key === "Retencion"); let label = key === "Objetivo" ? "Valor del objetivo ($)" : (key === "Retencion" ? "% retención del club" : `Inscripción ${key}`);
        if (isSystem) { contSis.innerHTML += `<div style="background: #111; padding: 12px; border-radius: 6px; border: 1px solid #222;"><label style="font-size: 0.85rem; color: var(--text-muted); font-weight: bold; display:block; margin-bottom:8px;">${label}</label><input type="number" class="input-costo-guardar" data-key="${key}" value="${costos[key]}" style="width:100%; box-sizing:border-box; background-color: #000;"></div>`; } 
        else { contCat.innerHTML += `<div style="background: #111; padding: 12px; border-radius: 6px; border: 1px solid #222;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><label style="font-size: 0.85rem; color: var(--text-muted); font-weight: bold;">${label}</label><button class="btn-outline-danger" style="padding: 2px 6px; font-size: 0.7rem; line-height: 1;" onclick="eliminarCategoriaConfig('${key}')">X</button></div><input type="number" class="input-costo-guardar" data-key="${key}" value="${costos[key]}" style="width:100%; box-sizing:border-box; background-color: #000;"></div>`; }
    }
}
window.agregarCategoriaConfig = function() { if (!torneoAdmin) return; const nuevaCat = document.getElementById('input-nueva-cat').value.trim(); if (!nuevaCat) return mostrarAlerta("Ingrese el nombre de la nueva categoría."); if (!torneoAdmin.costos) torneoAdmin.costos = {}; if (torneoAdmin.costos[nuevaCat] !== undefined) return mostrarAlerta("Esa categoría ya existe."); torneoAdmin.costos[nuevaCat] = 0; document.getElementById('input-nueva-cat').value = ''; cargarFormularioCostos(); renderSelectCategoriasGeneral(); mostrarAlerta(`Categoría "${nuevaCat}" agregada. Presioná 'Guardar Costos'.`); }
window.eliminarCategoriaConfig = function(catKey) { mostrarConfirmacion(`¿Eliminar categoría "${catKey}"?`, async () => { delete torneoAdmin.costos[catKey]; await clienteSupabase.from('torneos').update({ costos: torneoAdmin.costos }).eq('id', torneoAdmin.id); cargarFormularioCostos(); renderSelectCategoriasGeneral(); renderizarAdminBaseDatosTorneo(); renderizarStats(); renderizarFiltrosCategorias('filtros-cat-admin', torneoAdmin); mostrarAlerta("Eliminada correctamente."); }); }
window.guardarCostos = async function() { if (!torneoAdmin) return; let nuevosCostos = {}; document.querySelectorAll('.input-costo-guardar').forEach(inp => { nuevosCostos[inp.getAttribute('data-key')] = parseInt(inp.value) || 0; }); await clienteSupabase.from('torneos').update({ costos: nuevosCostos }).eq('id', torneoAdmin.id); torneoAdmin.costos = nuevosCostos; renderizarAdminBaseDatosTorneo(); renderizarStats(); renderSelectCategoriasGeneral(); renderizarFiltrosCategorias('filtros-cat-admin', torneoAdmin); mostrarAlerta("Costos actualizados con éxito."); }

function getGruposPlato() { if (!torneoAdmin || torneoAdmin.disciplina !== 'Plato') return []; let size = torneoAdmin.tamano_grupo || 1; let ordenados = [...tiradoresLocales].sort((a, b) => a.orden - b.orden); let grupos = []; for (let i = 0; i < ordenados.length; i += size) { grupos.push(ordenados.slice(i, i + size)); } return grupos; }

// ==========================================
// PESTAÑA JUECES (LÓGICA RONDAS Y SIN LIMITE)
// ==========================================
window.renderizarAdminJueces = function() {
    const sidebar = document.getElementById('juez-lista-tiradores'); if (!sidebar || !torneoAdmin) return; 
    const contGrupos = document.getElementById('contenedor-grupos-jueces'); const selectGrupos = document.getElementById('select-grupo-jueces'); sidebar.innerHTML = '';
    let listaMostrar = [...tiradoresLocales].sort((a, b) => a.orden - b.orden);
    if (torneoAdmin.disciplina === 'Plato') {
        contGrupos.style.display = 'block'; let grupos = getGruposPlato();
        if (selectGrupos.options.length === 0 || selectGrupos.options.length !== grupos.length + 1) { selectGrupos.innerHTML = '<option value="Todos">Todos los tiradores</option>'; grupos.forEach((g, idx) => { selectGrupos.innerHTML += `<option value="${idx}">Escuadra ${idx + 1} (Nº ${g[0].orden} al ${g[g.length-1].orden})</option>`; }); selectGrupos.value = grupoJuecesActivo; }
        if (grupoJuecesActivo !== 'Todos') { let gIdx = parseInt(grupoJuecesActivo); if (grupos[gIdx]) listaMostrar = grupos[gIdx]; }
    } else { contGrupos.style.display = 'none'; grupoJuecesActivo = 'Todos'; }

    const filtro = document.getElementById('buscador-jueces').value.toLowerCase(); if (filtro) listaMostrar = listaMostrar.filter(t => t.tirador.toLowerCase().includes(filtro));
    if (!tiradoresLocales.find(x => x.id === tiradorJuezActivoId)) { tiradorJuezActivoId = (listaMostrar[0] || {}).id; juezPlatoSeleccionadoIdx = null; }

    let totP = torneoAdmin.modo_sin_limite ? '∞' : (torneoAdmin.platos_por_serie * (torneoAdmin.vueltas || 1));
    listaMostrar.forEach(row => { sidebar.innerHTML += `<div class="juez-list-item ${(tiradorJuezActivoId === row.id) ? 'active' : ''}" style="${row.ausente ? 'opacity: 0.5;' : ''}" onclick="seleccionarTiradorJuez('${row.id}')"><span>${row.orden}. ${row.tirador}${row.ausente ? ' <span style="color:var(--danger); font-size:0.75rem; font-weight:bold;">[AUS]</span>' : ''}</span><span style="color: white; font-weight: bold;">${row.totalTirados}/${totP}</span></div>`; });
    renderizarPanelDerechoJuez();
}

window.cambiarGrupoJueces = function() { grupoJuecesActivo = document.getElementById('select-grupo-jueces').value; tiradorJuezActivoId = null; juezPlatoSeleccionadoIdx = null; renderizarAdminJueces(); }
window.seleccionarTiradorJuez = function(id) { tiradorJuezActivoId = id; juezPlatoSeleccionadoIdx = null; renderizarAdminJueces(); }
window.cambiarTiradorJuez = function(delta, llamar = false) {
    let listaBase = [...tiradoresLocales].sort((a, b) => a.orden - b.orden);
    if (torneoAdmin.disciplina === 'Plato' && grupoJuecesActivo !== 'Todos') {
        let grupos = getGruposPlato(); let gIdx = parseInt(grupoJuecesActivo);
        if (grupos[gIdx]) { listaBase = grupos[gIdx]; let i = listaBase.findIndex(x => x.id === tiradorJuezActivoId); if (i === -1) i = 0; let nuevoIdx = i + delta; if (nuevoIdx >= listaBase.length) nuevoIdx = 0; if (nuevoIdx < 0) nuevoIdx = listaBase.length - 1; tiradorJuezActivoId = listaBase[nuevoIdx].id; }
    } else {
        if (listaBase.length === 0) return; let i = listaBase.findIndex(x => x.id === tiradorJuezActivoId); if (i === -1) i = 0; tiradorJuezActivoId = listaBase[Math.max(0, Math.min(listaBase.length - 1, i + delta))].id;
    }
    juezPlatoSeleccionadoIdx = null; renderizarAdminJueces(); 
    const activo = document.querySelector('#juez-lista-tiradores .juez-list-item.active'); if (activo) activo.scrollIntoView({ block: 'nearest' }); if (llamar) sincronizarPedanaConJuez(tiradorJuezActivoId);
}

window.seleccionarVueltaJuez = function(v) { vueltaJuezActiva = v; juezPlatoSeleccionadoIdx = null; renderizarPanelDerechoJuez(); }
window.seleccionarCasillaJuez = function(idx) { juezPlatoSeleccionadoIdx = idx; renderizarPanelDerechoJuez(); }

function renderizarPanelDerechoJuez() {
    const panel = document.getElementById('juez-panel-activo'); 
    if (!panel || !tiradorJuezActivoId) { if(panel) panel.innerHTML = '<h2 style="margin-top: 0; color: var(--text-muted); text-align: center;">Seleccione un tirador de la lista</h2>'; return; }
    const t = tiradoresLocales.find(x => x.id === tiradorJuezActivoId); if (!t) return;
    
    let isSinLimite = torneoAdmin.modo_sin_limite;
    let limitRonda = torneoAdmin.platos_por_serie;
    let totalVueltas = isSinLimite ? 1 : (torneoAdmin.vueltas || 1);
    
    if(vueltaJuezActiva > totalVueltas) vueltaJuezActiva = totalVueltas;

    let idxInicioRonda = isSinLimite ? 0 : (vueltaJuezActiva - 1) * limitRonda;
    let idxFinRonda = isSinLimite ? t.resultados.length : vueltaJuezActiva * limitRonda;

    if (juezPlatoSeleccionadoIdx === null || juezPlatoSeleccionadoIdx < idxInicioRonda || juezPlatoSeleccionadoIdx >= idxFinRonda) {
        if (isSinLimite) {
            juezPlatoSeleccionadoIdx = t.resultados.length; // Posicion vacía al final
        } else {
            let pendiente = -1;
            for(let i = idxInicioRonda; i < idxFinRonda; i++) { if(t.resultados[i] === null) { pendiente = i; break; } }
            juezPlatoSeleccionadoIdx = (pendiente !== -1) ? pendiente : idxInicioRonda; 
        }
    }
    
    // TABS PARA RONDAS (si hay más de 1)
    let htmlRondas = '';
    if(!isSinLimite && totalVueltas > 1) {
        htmlRondas = '<div style="display:flex; justify-content:center; gap:5px; margin-bottom: 20px;">';
        for(let v=1; v<=totalVueltas; v++) {
            let colorActivo = (v === vueltaJuezActiva) ? 'var(--accent)' : '#111';
            let bordeActivo = (v === vueltaJuezActiva) ? 'white' : '#333';
            htmlRondas += `<button onclick="seleccionarVueltaJuez(${v})" style="background-color: ${colorActivo}; border: 1px solid ${bordeActivo}; padding: 6px 15px; font-size: 0.9rem; border-radius: 4px;">Ronda ${v}</button>`;
        }
        htmlRondas += '</div>';
    }

    let htmlPlatos = `<div class="plates-container" style="flex-wrap: wrap; justify-content: center; margin-bottom: 20px;">`;
    
    if (isSinLimite) {
        for(let i = 0; i <= t.resultados.length; i++) { 
            let val = t.resultados[i]; let isSelected = (i === juezPlatoSeleccionadoIdx && !t.ausente) ? 'plato-actual' : ''; 
            htmlPlatos += `<div class="plate-box admin-plate ${isSelected} ${val === 1 ? 'plate-hit' : (val === 0 ? 'plate-miss' : '')}" style="width: 45px; height: 45px; font-size:1.2rem; margin:3px; cursor:pointer;" onclick="seleccionarCasillaJuez(${i})">${val === 1 ? '✔' : (val === 0 ? '✖' : (i + 1))}</div>`; 
        }
    } else {
        for(let i = idxInicioRonda; i < idxFinRonda; i++) { 
            let val = t.resultados[i]; let isSelected = (i === juezPlatoSeleccionadoIdx && !t.ausente) ? 'plato-actual' : ''; 
            let textVisual = val === 1 ? '✔' : (val === 0 ? '✖' : (i - idxInicioRonda + 1));
            htmlPlatos += `<div class="plate-box admin-plate ${isSelected} ${val === 1 ? 'plate-hit' : (val === 0 ? 'plate-miss' : '')}" style="width: 45px; height: 45px; font-size:1.2rem; margin:3px; cursor:pointer;" onclick="seleccionarCasillaJuez(${i})">${textVisual}</div>`; 
        }
    }
    htmlPlatos += '</div>';
    
    let btnRotativoTxt = (torneoAdmin.disciplina === 'Plato' && grupoJuecesActivo !== 'Todos') ? 'Sig. de Escuadra ↺' : 'Siguiente tirador →';
    let labelPos = isSinLimite ? (juezPlatoSeleccionadoIdx + 1) : (juezPlatoSeleccionadoIdx - idxInicioRonda + 1);
    
    let botonesGrandes = '';
    if (!t.ausente) {
        botonesGrandes = `<div style="font-size: 0.95rem; color: var(--accent-yellow); font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Modificando Posición Nº ${labelPos}</div><div class="panel-juez-botones"><button class="btn-juez-grande btn-juez-acierto" onclick="marcarPlatoRapido('${t.id}', ${juezPlatoSeleccionadoIdx}, 1)"><div style="font-size: 3rem; line-height: 1; opacity: 0.9;">✔</div>ACIERTO</button><button class="btn-juez-grande btn-juez-error" onclick="marcarPlatoRapido('${t.id}', ${juezPlatoSeleccionadoIdx}, 0)"><div style="font-size: 3rem; line-height: 1; opacity: 0.9;">✖</div>ERROR</button></div><div style="text-align: center; color: #888; font-size: 0.85rem; font-weight: bold; margin-bottom: 15px;">(Toca arriba cualquier casilla para cambiar de posición)</div>`;
    }
    
    let serieTxt = isSinLimite ? `TIRADOS: ${t.totalTirados} | ACIERTOS: ${t.totalAciertos}` : `SERIE ${t.totalTirados === (limitRonda * totalVueltas) ? 'COMPLETA' : 'EN CURSO'}: ${t.totalTirados} DE ${limitRonda * totalVueltas} (Aciertos: ${t.totalAciertos})`;

    panel.innerHTML = `<div class="juez-main-header">${t.tirador}</div><div class="juez-main-subtitle">(Nº ${t.orden} - ${t.categoria})</div><div style="margin-bottom: 25px;"><button onclick="toggleAusente('${t.id}')" style="${t.ausente ? "background-color: var(--danger); color: white; border: 1px solid var(--danger); padding: 6px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;" : "background-color: transparent; color: var(--danger); border: 1px solid var(--danger); padding: 6px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;"}">${t.ausente ? '❌ MARCADO COMO AUSENTE (Click para deshacer)' : 'Marcar como AUSENTE'}</button></div><div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 15px; margin-bottom: 20px;"><button class="btn-outline" onclick="cambiarTiradorJuez(-1)" style="font-size: 1rem; padding: 10px 20px;">← Anterior</button><button onclick="cambiarTiradorJuez(1)" style="font-size: 1rem; padding: 10px 20px; background-color: var(--accent); color: white; font-weight: bold; border: none;" title="Cambia de tirador solo en esta pantalla de juez">${btnRotativoTxt}</button><button onclick="cambiarTiradorJuez(1, true)" style="font-size: 1rem; padding: 10px 20px; background-color: #D97706; color: white; font-weight: bold; border: none;" title="Pasa al siguiente y además lo llama en 'Ver tirador en pedana'">📢 Siguiente y llamar</button></div><div style="${t.ausente ? 'opacity: 0.3; pointer-events: none;' : ''}"><div style="font-size: 1.3rem; color: var(--accent-yellow); font-weight: bold; margin-bottom: 15px;">${serieTxt}</div>${htmlRondas}<div style="background-color: var(--bg-main); padding: 20px; border-radius: 8px; margin-top: 5px;">${htmlPlatos}${botonesGrandes}</div><div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 30px; background-color: var(--bg-main); padding: 20px; border-radius: 8px;"><label style="font-size: 1.2rem; font-weight: bold;">BARRAGE:</label><input type="number" id="input-barrage-${t.id}" class="barrage-input" value="${t.barrage || 0}"><button onclick="guardarBarrage('${t.id}')">Guardar</button></div></div>`;
}

window.marcarPlatoRapido = async function(idRow, idx, valor) {
    let t = tiradoresLocales.find(x => x.id === idRow); if(!t || t.ausente) return;
    
    if(torneoAdmin.modo_sin_limite) {
        if (idx >= t.resultados.length) t.resultados.push(valor); // Añadir nuevo
        else t.resultados[idx] = valor; // Modificar existente
        juezPlatoSeleccionadoIdx = t.resultados.length; // Siempre saltar al último (nuevo)
    } else {
        t.resultados[idx] = valor;
        let idxInicioRonda = (vueltaJuezActiva - 1) * torneoAdmin.platos_por_serie;
        let idxFinRonda = vueltaJuezActiva * torneoAdmin.platos_por_serie;
        let siguientePendiente = -1;
        for(let i = idxInicioRonda; i < idxFinRonda; i++) { if(t.resultados[i] === null) { siguientePendiente = i; break; } }
        if (siguientePendiente !== -1) { juezPlatoSeleccionadoIdx = siguientePendiente; } else { juezPlatoSeleccionadoIdx = Math.min(idx + 1, idxFinRonda - 1); }
    }
    
    t.totalAciertos = t.resultados.filter(r => r === 1).length; t.totalTirados = t.resultados.filter(r => r !== null && r !== undefined).length; t.puntajeFinal = t.totalAciertos + (t.barrage || 0);
    renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); renderizarPedana('contenedor-pedana-admin', torneoAdmin); renderizarStats();
    actividadTirador[idRow] = Date.now();
    await clienteSupabase.from('inscripciones').update({ resultados: t.resultados }).eq('id', idRow); avisarALaTV({ tiradorId: idRow });
}

window.toggleAusente = async function(id) { let t = tiradoresLocales.find(x => x.id === id); if(t) { t.ausente = !t.ausente; await clienteSupabase.from('inscripciones').update({ ausente: t.ausente }).eq('id', id); renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); renderizarStats(); renderizarAdminBaseDatosTorneo(); avisarALaTV(); } }
window.guardarBarrage = async function(id) { let t = tiradoresLocales.find(x => x.id === id); if(t) { t.barrage = parseInt(document.getElementById(`input-barrage-${id}`).value) || 0; t.puntajeFinal = t.totalAciertos + t.barrage; await clienteSupabase.from('inscripciones').update({ barrage: t.barrage }).eq('id', id); renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); avisarALaTV(); } }

function renderizarAdminBaseDatosTorneo() {
    const tbody = document.getElementById('lista-edicion-tiradores'); if (!tbody || !torneoAdmin) return; tbody.innerHTML = '';
    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000 };
    const paralelosDefinidos = torneoAdmin.paralelos || [];
    [...tiradoresLocales].sort((a, b) => a.orden - b.orden).forEach(row => {
        let catClass = row.categoria.toLowerCase().includes('vet') ? 'supervet' : (row.categoria.toLowerCase().includes('junior') ? 'junior' : (row.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
        let paralelosInscriptos = row.paralelos_inscriptos || []; let htmlParalelos = ''; let extraCostos = 0;
        if (paralelosDefinidos.length > 0) { paralelosDefinidos.forEach(p => { let participando = paralelosInscriptos.includes(p.nombre); if (participando) extraCostos += p.costo; let activeClass = participando ? 'active' : ''; htmlParalelos += `<span class="tag-paralelo ${activeClass}" onclick="toggleParaleloTirador('${row.id}', '${p.nombre}')" title="Costo: $${p.costo.toLocaleString('es-AR')}">${p.nombre}</span>`; }); } else { htmlParalelos = '<span style="color:#666; font-size:0.75rem;">Sin paralelos configurados</span>'; }
        let totalCobrar = (costos[row.categoria] || 0) + extraCostos;
        tbody.innerHTML += `<tr style="${row.ausente ? 'opacity: 0.6;' : ''}"><td><strong>${row.orden}</strong></td><td style="font-weight: bold; text-transform: uppercase;">${row.ausente ? `<span style="color:var(--danger); font-weight:bold;">[AUS]</span> ${row.tirador}` : row.tirador}</td><td><span class="tag-categoria ${catClass}">${row.categoria.toUpperCase()}</span></td><td>${htmlParalelos}</td><td style="color: white; font-weight: bold;">${row.ausente ? '-' : `$ ${totalCobrar.toLocaleString('es-AR')}`}</td><td><button class="btn-outline" onclick="abrirModalEditar('${row.id}', '${row.tirador}', ${row.orden}, '${row.categoria}')">Editar</button> <button class="btn-outline-danger" onclick="eliminarTirador('${row.id}')">Eliminar</button></td></tr>`;
    });
}

window.exportarExcel = function() {
    if (!torneoAdmin || tiradoresLocales.length === 0) return mostrarAlerta("No hay datos para exportar.");
    const datos = [...tiradoresLocales].sort((a, b) => b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden).map((t, i) => {
        let fila = { 'POS': t.ausente ? '-' : i + 1, 'ORDEN': t.orden, 'TIRADOR': t.tirador, 'CAT': t.categoria, 'ESTADO': t.ausente ? 'AUSENTE' : 'PRESENTE', 'PARALELOS': (t.paralelos_inscriptos || []).join(' - ') };
        for(let j=0; j<(torneoAdmin.modo_sin_limite ? t.resultados.length : (torneoAdmin.platos_por_serie*(torneoAdmin.vueltas||1))); j++) fila[`P${j+1}`] = t.resultados[j] === 1 ? 'A' : (t.resultados[j] === 0 ? 'F' : '-');
        fila['TOTAL'] = t.ausente ? '-' : t.totalAciertos; fila['BARRAGE'] = t.ausente ? '-' : (t.barrage || 0); fila['FINAL'] = t.ausente ? '-' : t.puntajeFinal; return fila;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Resultados"); XLSX.writeFile(wb, `Resultados_${torneoAdmin.nombre.replace(/ /g, '_')}.xlsx`);
}

function avisarALaTV(payload = {}) { canalRealtime.send({ type: 'broadcast', event: 'recargar_pantallas', payload }); }
window.abrirModalEditar = function(id, nom, ord, cat) { document.getElementById('edit-id').value = id; document.getElementById('edit-tirador').value = nom; document.getElementById('edit-orden').value = ord; document.getElementById('edit-categoria').value = cat; document.getElementById('modal-editar').style.display = 'flex'; }
window.cerrarModalEditar = () => document.getElementById('modal-editar').style.display = 'none';
window.guardarEdicionTirador = async function() { let nuevoOrden = parseInt(document.getElementById('edit-orden').value); let idActual = document.getElementById('edit-id').value; if (tiradoresLocales.some(t => t.orden === nuevoOrden && t.id !== idActual)) return mostrarAlerta(`El Nº ${nuevoOrden} ya está asignado.`); await clienteSupabase.from('inscripciones').update({ tirador: document.getElementById('edit-tirador').value, orden: nuevoOrden, categoria: document.getElementById('edit-categoria').value }).eq('id', idActual); cerrarModalEditar(); await cargarResultados(torneoAdmin.id); avisarALaTV(); }

window.agregarTirador = async function() {
    let orden = parseInt(document.getElementById('input-orden').value); let tirador = document.getElementById('input-tirador').value.trim(); let categoria = document.getElementById('input-categoria').value;
    if(!orden || !tirador) return mostrarAlerta("Faltan datos.");
    if (tiradoresLocales.some(t => t.orden === orden)) return mostrarAlerta(`El Nº ${orden} ya existe en este torneo.`);
    let resInicial = torneoAdmin.modo_sin_limite ? [] : Array(torneoAdmin.platos_por_serie * (torneoAdmin.vueltas || 1)).fill(null);
    await clienteSupabase.from('inscripciones').insert([{ torneo_id: torneoAdmin.id, orden: orden, tirador: tirador, categoria: categoria, resultados: resInicial, barrage: 0, ausente: false, paralelos_inscriptos: [] }]);
    if (!tiradoresMaster.some(t => t.nombre.toLowerCase() === tirador.toLowerCase())) { await clienteSupabase.from('tiradores').insert([{ nombre: tirador, categoria: categoria }]); await cargarMasterDB(); }
    document.getElementById('input-orden').value = ''; document.getElementById('input-tirador').value = ''; await cargarResultados(torneoAdmin.id); avisarALaTV();
}

window.eliminarTirador = function(id) { mostrarConfirmacion("¿Eliminar tirador?", async () => { await clienteSupabase.from('inscripciones').delete().eq('id', id); await cargarResultados(torneoAdmin.id); avisarALaTV(); }); }

window.crearTorneo = async function() {
    const n = document.getElementById('input-nuevo-torneo').value; const f = document.getElementById('input-fecha-torneo').value; const disc = document.getElementById('input-disciplina').value; const pSel = document.getElementById('input-platos').value; const pCust = document.getElementById('input-platos-custom').value; const grupo = document.getElementById('input-grupo-size').value; const vueltas = document.getElementById('input-vueltas').value;
    let modoSinLimite = (pSel === 'SinLímite');
    let pFinal = modoSinLimite ? 0 : ((pSel === 'Personalizado') ? parseInt(pCust) : parseInt(pSel));
    let gFinal = (disc === 'Plato') ? parseInt(grupo) : 1;
    let vFinal = modoSinLimite ? 1 : parseInt(vueltas);
    if (!n || !f || (!modoSinLimite && (isNaN(pFinal) || pFinal <= 0))) return mostrarAlerta("Nombre, fecha y cantidad de blancos son OBLIGATORIOS.");
    
    let c = { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    if (listaTorneos.length > 0 && listaTorneos[listaTorneos.length - 1].costos) c = JSON.parse(JSON.stringify(listaTorneos[listaTorneos.length - 1].costos));
    
    await clienteSupabase.from('torneos').insert([{ nombre: n, fecha: f, platos_por_serie: pFinal, estado: 'Inactivo', costos: c, tirador_actual_index: 0, disciplina: disc, tamano_grupo: gFinal, paralelos: [], vueltas: vFinal, modo_sin_limite: modoSinLimite }]);
    document.getElementById('input-nuevo-torneo').value = ''; document.getElementById('input-fecha-torneo').value = ''; await inicializarDatos(); avisarALaTV();
}

window.editarTorneoActual = async function() {
    const f = document.getElementById('edit-fecha-torneo').value; if (!f) return mostrarAlerta("La fecha no puede quedar vacía.");
    const disc = document.getElementById('edit-disciplina').value; const pSel = document.getElementById('edit-platos').value; const pCust = document.getElementById('edit-platos-custom').value; const grupo = document.getElementById('edit-grupo-size').value; const vueltas = document.getElementById('edit-vueltas').value;
    let modoSinLimite = (pSel === 'SinLímite');
    let pFinal = modoSinLimite ? 0 : ((pSel === 'Personalizado') ? parseInt(pCust) : parseInt(pSel));
    let gFinal = (disc === 'Plato') ? parseInt(grupo) : 1;
    let vFinal = modoSinLimite ? 1 : parseInt(vueltas);
    
    await clienteSupabase.from('torneos').update({ nombre: document.getElementById('edit-nombre-torneo').value, fecha: f, platos_por_serie: pFinal, disciplina: disc, tamano_grupo: gFinal, vueltas: vFinal, modo_sin_limite: modoSinLimite }).eq('id', torneoAdmin.id);
    await inicializarDatos(); avisarALaTV(); mostrarAlerta('Torneo actualizado.');
}

window.eliminarTorneoActual = function() { mostrarConfirmacion("¿ELIMINAR torneo completo y TODOS sus tiradores?", async () => { await clienteSupabase.from('inscripciones').delete().eq('torneo_id', torneoAdmin.id); await clienteSupabase.from('torneos').delete().eq('id', torneoAdmin.id); torneoAdmin = null; await inicializarDatos(); avisarALaTV(); }); }

canalRealtime.on('broadcast', { event: 'recargar_pantallas' }, async (msg) => { if (!esAdmin) { const tid = msg && msg.payload && msg.payload.tiradorId; if (tid) actividadTirador[tid] = Date.now(); if (torneoTV) { const { data } = await clienteSupabase.from('torneos').select('*').eq('id', torneoTV.id).single(); if (data) torneoTV = data; cargarResultados(torneoTV.id); } else inicializarDatos(); } }).subscribe();
// En modo sin límite, refresca para que el cartel TIRANDO se apague solo al pasar la inactividad
setInterval(() => { if (!esAdmin && torneoTV && torneoTV.modo_sin_limite) cargarResultados(torneoTV.id); }, 30000);
document.addEventListener('DOMContentLoaded', verificarSesion);