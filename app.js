// ACÁ PONÉ TUS CREDENCIALES REALES
const SUPABASE_URL = 'https://nhfruepiiweznuapwfve.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VYJepoCDxfA-PVvK51Wykw_b6ZAB7jO';

const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const esAdmin = document.getElementById('admin-body') !== null;
let torneoTV = null;      
let torneoAdmin = null;   
let listaTorneos = [];
let tiradoresLocales = [];
let tiradorJuezActivoId = null;
let grupoJuecesActivo = 'Todos';

let filtroCategoria = 'Todas';
let filtroBusqueda = '';
let modoVistaTV = 'resultados'; 
let modoTvActivo = false;

const canalRealtime = clienteSupabase.channel('sala-sincronizacion');

// RELOJ Y FECHA DINÁMICA
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
        document.getElementById('check-modo-tv').checked = false;
        modoTvActivo = false;
        document.getElementById('body-app').classList.remove('modo-tv-activo');
        detenerScrollAutoTV();
        if (torneoTV) cargarResultados(torneoTV.id);
    }
});

// ==========================================
// MODALES GLOBALES
// ==========================================
window.mostrarAlerta = function(msg) { document.getElementById('alerta-mensaje').innerText = msg; document.getElementById('modal-alerta').style.display = 'flex'; }
window.cerrarAlerta = function() { document.getElementById('modal-alerta').style.display = 'none'; }
window.mostrarConfirmacion = function(msg, onConfirm) {
    document.getElementById('confirm-mensaje').innerText = msg; document.getElementById('modal-confirm').style.display = 'flex';
    document.getElementById('btn-confirm-ok').onclick = function() { document.getElementById('modal-confirm').style.display = 'none'; onConfirm(); };
}
window.cerrarConfirmacion = function() { document.getElementById('modal-confirm').style.display = 'none'; }

// ==========================================
// SESIONES Y DATOS
// ==========================================
async function verificarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (esAdmin) {
        if (!session) window.location.href = 'index.html'; 
        else { document.getElementById('admin-body').style.display = 'block'; inicializarDatos(); }
    } else inicializarDatos(); 
}
window.abrirModalLogin = () => document.getElementById('modal-login').style.display = 'flex';
window.cerrarModalLogin = () => { document.getElementById('modal-login').style.display = 'none'; document.getElementById('login-error').style.display = 'none'; }
window.iniciarSesion = async function() {
    const { error } = await clienteSupabase.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-pass').value });
    if (error) document.getElementById('login-error').style.display = 'block'; else window.location.href = 'admin.html';
}
window.cerrarSesion = async function() { await clienteSupabase.auth.signOut(); window.location.href = 'index.html'; }

async function inicializarDatos() {
    tiradoresLocales = [];
    const { data: torneos } = await clienteSupabase.from('torneos').select('*').order('id', { ascending: true });
    listaTorneos = torneos || [];
    
    if (esAdmin) {
        renderizarBotonesTorneosAdmin();
        if (!torneoAdmin && listaTorneos.length > 0) seleccionarTorneoAdmin(listaTorneos[0].id);
        else if (torneoAdmin) seleccionarTorneoAdmin(torneoAdmin.id);
    } else {
        if (torneoTV) await cargarResultados(torneoTV.id);
        else renderizarTarjetasInicio();
    }
}

// ==========================================
// DISCIPLINA Y TAMAÑOS DINÁMICOS
// ==========================================
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
    
    cambiarPlatosPersonalizado(prefijo);
}

window.cambiarPlatosPersonalizado = function(prefijo) {
    const val = document.getElementById(`${prefijo}-platos`).value;
    document.getElementById(`${prefijo}-platos-custom`).style.display = (val === 'Personalizado') ? 'block' : 'none';
}

// INICIO - BUSCADOR DE TORNEOS Y CARTEL EN CURSO
window.renderizarTarjetasInicio = function() {
    const div = document.getElementById('grid-torneos-publicos');
    const inputBuscador = document.getElementById('buscador-torneos-publico');
    const filtro = inputBuscador ? inputBuscador.value.toLowerCase() : '';
    
    if (!div) return;
    div.innerHTML = '';
    
    let filtrados = listaTorneos;
    if (filtro !== '') {
        filtrados = listaTorneos.filter(t => t.nombre.toLowerCase().includes(filtro));
    }
    
    if (filtrados.length === 0) return div.innerHTML = '<p style="color:var(--text-muted); font-size:1.2rem;">No se encontraron torneos con ese nombre.</p>';
    
    filtrados.forEach(t => {
        let fechaFormat = t.fecha ? `<br><span style="font-size: 0.9rem; color: #888;">${t.fecha.split('-').reverse().join('/')}</span>` : '';
        let badgeLive = t.estado === 'En curso' ? '<span class="badge-en-curso">🔴 EN CURSO</span>' : '';
        let disciplinaStr = t.disciplina ? t.disciplina : 'Helice';
        let word = disciplinaStr === 'Plato' ? 'platos' : 'hélices';
        
        div.innerHTML += `
            <div class="card-publica" onclick="abrirVistaTV('${t.id}')">
                <h3>${t.nombre} ${badgeLive} ${fechaFormat}</h3>
                <p>• ${disciplinaStr} - ${t.platos_por_serie || 12} ${word}</p>
            </div>`;
    });
}

window.abrirVistaTV = async function(id) {
    document.getElementById('vista-inicio').style.display = 'none'; document.getElementById('vista-tv').style.display = 'block';
    torneoTV = listaTorneos.find(t => t.id === id);
    if (!torneoTV.platos_por_serie) torneoTV.platos_por_serie = 12;
    document.getElementById('nombre-torneo').innerText = torneoTV.nombre;
    filtroCategoria = 'Todas'; filtroBusqueda = ''; 
    await cargarResultados(torneoTV.id);
}
window.volverAlInicio = function() {
    document.getElementById('vista-tv').style.display = 'none'; document.getElementById('vista-inicio').style.display = 'block';
    torneoTV = null; renderizarTarjetasInicio();
}

window.toggleModoTV = function() {
    modoTvActivo = document.getElementById('check-modo-tv').checked;
    const bodyEl = document.getElementById('body-app');
    
    if (modoTvActivo) {
        bodyEl.classList.add('modo-tv-activo');
        let docEl = document.documentElement;
        if (docEl.requestFullscreen) { docEl.requestFullscreen().catch(e => console.log(e)); }
        else if (docEl.webkitRequestFullscreen) { docEl.webkitRequestFullscreen(); }
        else if (docEl.msRequestFullscreen) { docEl.msRequestFullscreen(); }
        iniciarScrollAutoTV();
    } else {
        bodyEl.classList.remove('modo-tv-activo');
        detenerScrollAutoTV();
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) { document.exitFullscreen().catch(e => console.log(e)); }
            else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
            else if (document.msExitFullscreen) { document.msExitFullscreen(); }
        }
    }
    if (torneoTV) cargarResultados(torneoTV.id);
}

window.cambiarModoTV = function(modo, elementoBtn) {
    modoVistaTV = modo;
    document.querySelectorAll('.tab-btn-tv').forEach(b => b.classList.remove('active'));
    elementoBtn.classList.add('active');
    document.querySelectorAll('.modo-tv-pane').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });

    if (modo === 'resultados') {
        const pane = document.getElementById('contenedor-modo-resultados');
        pane.style.display = 'block'; pane.classList.add('active');
    } else if (modo === 'pedana') {
        const pane = document.getElementById('contenedor-modo-pedana');
        pane.style.display = 'block'; pane.classList.add('active');
    } else if (modo === 'dividido') {
        const pane = document.getElementById('contenedor-modo-dividido');
        pane.style.display = 'block'; pane.classList.add('active');
    }
    if (torneoTV) cargarResultados(torneoTV.id);
}

// ==========================================
// LÓGICA DE AUTO-SCROLL
// ==========================================
let frameScrollTV = null;
function iniciarScrollAutoTV() {
    detenerScrollAutoTV();
    document.querySelectorAll('.tbody-resto').forEach(c => {
        c.dataset.pausa = "true"; c.dataset.scrollReal = 0; c.scrollTop = 0;
        setTimeout(() => { if (modoTvActivo) c.dataset.pausa = "false"; }, 3000);
    });

    function loopScroll() {
        if (!modoTvActivo) return;
        const panelesResto = document.querySelectorAll('.tbody-resto');
        panelesResto.forEach(c => {
            if (c.scrollHeight > c.clientHeight) {
                if (c.dataset.pausa === "true") return;

                let scrollReal = parseFloat(c.dataset.scrollReal || c.scrollTop);
                let maxScroll = c.scrollHeight - c.clientHeight;

                if (scrollReal >= maxScroll - 1) {
                    c.scrollTop = maxScroll; c.dataset.pausa = "true";
                    setTimeout(() => { 
                        if (!modoTvActivo) return;
                        c.scrollTop = 0; c.dataset.scrollReal = 0;
                        setTimeout(() => { if (!modoTvActivo) return; c.dataset.pausa = "false"; }, 3000); 
                    }, 3500); 
                    return;
                }
                
                scrollReal += 0.25; c.dataset.scrollReal = scrollReal; c.scrollTop = Math.floor(scrollReal); 
            }
        });
        frameScrollTV = requestAnimationFrame(loopScroll);
    }
    loopScroll();
}
function detenerScrollAutoTV() {
    if (frameScrollTV) cancelAnimationFrame(frameScrollTV);
    document.querySelectorAll('.tbody-resto').forEach(c => { c.dataset.scrollReal = 0; c.dataset.pausa = "false"; });
}

function renderizarBotonesTorneosAdmin() {
    const div = document.getElementById('botones-torneos');
    if (!div) return;
    div.innerHTML = '';
    listaTorneos.forEach(t => { div.innerHTML += `<button class="btn-torneo ${torneoAdmin && torneoAdmin.id === t.id ? 'admin-selected' : ''}" onclick="seleccionarTorneoAdmin('${t.id}')">${t.nombre}</button>`; });
}

window.seleccionarTorneoAdmin = async function(id) {
    torneoAdmin = listaTorneos.find(t => t.id === id);
    if (!torneoAdmin) return;
    if(!torneoAdmin.platos_por_serie) torneoAdmin.platos_por_serie = 12;
    
    document.getElementById('admin-torneo-titulo').innerText = `${torneoAdmin.nombre}`;
    tiradorJuezActivoId = null; 
    grupoJuecesActivo = 'Todos';
    
    document.getElementById('edit-nombre-torneo').value = torneoAdmin.nombre;
    document.getElementById('edit-fecha-torneo').value = torneoAdmin.fecha || '';
    
    // Configurar campos de disciplina
    let disc = torneoAdmin.disciplina || 'Helice';
    let editDisc = document.getElementById('edit-disciplina');
    if (editDisc) { 
        editDisc.value = disc; 
        cambiarDisciplinaUi('edit'); 
    }
    
    let editPlatos = document.getElementById('edit-platos');
    let editCustom = document.getElementById('edit-platos-custom');
    let encontrado = false;
    for (let i = 0; i < editPlatos.options.length; i++) {
        if (editPlatos.options[i].value == torneoAdmin.platos_por_serie) { 
            editPlatos.selectedIndex = i; 
            encontrado = true; 
            break; 
        }
    }
    if (!encontrado && editPlatos) {
        editPlatos.value = 'Personalizado';
        editCustom.value = torneoAdmin.platos_por_serie;
        cambiarPlatosPersonalizado('edit');
    }
    
    document.getElementById('edit-grupo-size').value = torneoAdmin.tamano_grupo || 1;

    // BOTON DE ESTADO
    const btnEstado = document.getElementById('btn-estado-torneo');
    if (btnEstado) {
        let enCurso = torneoAdmin.estado === 'En curso';
        btnEstado.innerText = enCurso ? '⏹ Finalizar Transmisión' : '▶ Activar "EN CURSO"';
        btnEstado.style.backgroundColor = enCurso ? 'var(--danger)' : '#2EA043';
        btnEstado.style.color = 'white';
        btnEstado.style.border = 'none';
    }

    cargarFormularioCostos(); renderizarSelectsCategorias(); renderizarBotonesTorneosAdmin(); await cargarResultados(torneoAdmin.id);
}

// NUEVA FUNCIÓN ESTADO TORNEO
window.toggleEstadoTorneoActual = async function() {
    if (!torneoAdmin) return;
    let nuevoEstado = (torneoAdmin.estado === 'En curso') ? 'Finalizado' : 'En curso';
    await clienteSupabase.from('torneos').update({ estado: nuevoEstado }).eq('id', torneoAdmin.id);
    torneoAdmin.estado = nuevoEstado;
    
    seleccionarTorneoAdmin(torneoAdmin.id);
    avisarALaTV(); 
}

window.abrirPestana = function(idTab, elementoBtn) {
    document.querySelectorAll('.tab-pane').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(idTab).classList.add('active'); elementoBtn.classList.add('active');
}

async function cargarResultados(idTorneo) {
    if (!idTorneo) return;
    const { data } = await clienteSupabase.from('inscripciones').select('*').eq('torneo_id', idTorneo);
    if (data) {
        data.forEach(row => {
            let totalPlatos = esAdmin ? (torneoAdmin ? torneoAdmin.platos_por_serie : 12) : (torneoTV ? torneoTV.platos_por_serie : 12);
            if (!row.resultados || !Array.isArray(row.resultados)) row.resultados = Array(totalPlatos).fill(null);
            row.totalAciertos = row.resultados.filter(r => r === 1).length;
            row.totalTirados = row.resultados.filter(r => r !== null).length;
            row.barrage = row.barrage || 0; row.ausente = row.ausente || false; row.puntajeFinal = row.totalAciertos + row.barrage;
        });
        tiradoresLocales = data;
    } else tiradoresLocales = [];

    const objTorneo = esAdmin ? torneoAdmin : torneoTV;
    if (esAdmin) {
        renderizarFiltrosCategorias('filtros-cat-admin', objTorneo);
        renderizarAdminJueces(); renderizarAdminBaseDatos(); renderizarStats();
        renderizarVistaResultadosUnificada('cabecera-tabla-admin', objTorneo);
        renderizarPedana('contenedor-pedana-admin', objTorneo);
    } else if (torneoTV) {
        renderizarFiltrosCategorias('filtros-cat-tv', objTorneo);
        renderizarVistaResultadosUnificada('cabecera-tabla-tv', objTorneo);
        renderizarPedana('contenedor-pedana-tv', objTorneo);
        if (modoVistaTV === 'dividido') {
            renderizarVistaResultadosUnificada('cabecera-tabla-split', objTorneo);
            renderizarPedana('contenedor-pedana-split', objTorneo);
        }
    }
}

function obtenerCategorias(torneoConfig) {
    if (!torneoConfig || !torneoConfig.costos) return ["Senior", "Veterano", "Super Vet.", "Dama", "Principiante", "Junior"];
    return Object.keys(torneoConfig.costos).filter(k => k !== "Objetivo" && k !== "Retencion");
}
function renderizarFiltrosCategorias(containerId, torneoConfig) {
    const cont = document.getElementById(containerId);
    if (!cont || !torneoConfig) return;
    const cats = obtenerCategorias(torneoConfig);
    let html = `<button class="btn-cat ${filtroCategoria === 'Todas' ? 'active' : ''}" onclick="setFiltroCategoria('Todas')">Todas</button>`;
    cats.forEach(c => { html += `<button class="btn-cat ${filtroCategoria === c ? 'active' : ''}" onclick="setFiltroCategoria('${c}')">${c}</button>`; });
    cont.innerHTML = html;
}
function renderizarSelectsCategorias() {
    if (!torneoAdmin) return;
    const cats = obtenerCategorias(torneoAdmin);
    let html = ''; cats.forEach(c => html += `<option value="${c}">${c}</option>`);
    const selectAdd = document.getElementById('input-categoria'); const selectEdit = document.getElementById('edit-categoria');
    if (selectAdd) selectAdd.innerHTML = html; if (selectEdit) selectEdit.innerHTML = html;
}
window.setFiltroCategoria = function(cat) { 
    filtroCategoria = cat; const objTorneo = esAdmin ? torneoAdmin : torneoTV;
    if (esAdmin) { renderizarFiltrosCategorias('filtros-cat-admin', objTorneo); cargarResultados(torneoAdmin.id); } 
    else { renderizarFiltrosCategorias('filtros-cat-tv', objTorneo); cargarResultados(torneoTV.id); }
}
window.setFiltroBusqueda = function(txt) { 
    filtroBusqueda = txt.toLowerCase(); 
    if(esAdmin) cargarResultados(torneoAdmin.id); else cargarResultados(torneoTV.id); 
}
function formatearNombre(nombre) { return nombre.length > 14 ? nombre.substring(0, 14).trim() + '...' : nombre; }

function renderizarVistaResultadosUnificada(idCabecera, torneoConfig) {
    const theadDOM = document.getElementById(idCabecera);
    if (!theadDOM || !torneoConfig) return;
    const tabla = theadDOM.parentElement; 
    
    tabla.className = torneoConfig.platos_por_serie > 12 ? 'muchos-platos' : '';
    
    let listaFiltrada = [...tiradoresLocales];
    if (filtroCategoria !== 'Todas') listaFiltrada = listaFiltrada.filter(t => t.categoria === filtroCategoria);
    if (filtroBusqueda !== '') listaFiltrada = listaFiltrada.filter(t => t.tirador.toLowerCase().includes(filtroBusqueda) || t.categoria.toLowerCase().includes(filtroBusqueda) || t.orden.toString() === filtroBusqueda);
    
    listaFiltrada.sort((a, b) => {
        if (a.ausente && !b.ausente) return 1; if (!a.ausente && b.ausente) return -1;
        return b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden;
    });

    let posActual = 1; let lastScoreIdentifier = null;
    listaFiltrada.forEach((row, index) => {
        if (row.ausente) { row.posicionFija = '-'; return; }
        let currentScoreIdentifier = `${row.puntajeFinal}-${row.barrage}-${row.totalAciertos}`;
        if (lastScoreIdentifier !== currentScoreIdentifier) { posActual = index + 1; lastScoreIdentifier = currentScoreIdentifier; }
        row.posicionFija = posActual;
    });

    const wPos = '4%', wNum = '4%', wTirador = '21%', wCat = '8%', wTot = '5.5%', wBar = '5.5%', wFin = '6%';
    const wPlato = (46 / Math.max(1, torneoConfig.platos_por_serie)) + '%'; 

    let htmlCabecera = `<thead id="${idCabecera}"><tr><th style="width:${wPos}; text-align:center;">POS.</th><th style="width:${wNum}; text-align:center;">Nº</th><th style="width:${wTirador}; text-align:left; padding-left:15px;">TIRADOR</th><th style="width:${wCat}; text-align:center;">CAT.</th>`;
    for(let i=1; i<=torneoConfig.platos_por_serie; i++) htmlCabecera += `<th style="width:${wPlato}; text-align:center;">${i}</th>`;
    htmlCabecera += `<th style="width:${wTot}; text-align:center;">TOTAL</th><th style="width:${wBar}; text-align:center;">BARRAGE</th><th style="width:${wFin}; text-align:center;">FINAL</th></tr></thead>`;

    function buildFilas(lista) {
        let html = '';
        lista.forEach(row => {
            let htmlPlatosMultiTD = '';
            for(let i = 0; i < torneoConfig.platos_por_serie; i++) {
                let val = row.resultados[i];
                if (val === 1) htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box plate-hit mx-auto">✔</div></td>`; 
                else if (val === 0) htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box plate-miss mx-auto">✖</div></td>`; 
                else htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box mx-auto">-</div></td>`;
            }
            let barrageTxt = row.barrage > 0 && !row.ausente ? `<span style="color:var(--accent-yellow); font-weight:900;">${row.barrage}</span>` : '-';
            let badgeSerie = row.totalAciertos === torneoConfig.platos_por_serie && torneoConfig.platos_por_serie > 0 && !row.ausente ? `<span class="badge-serie">EN SERIE</span>` : '';
            let ausenteBadge = row.ausente ? `<span style="background:var(--danger); color:white; font-size:0.65rem; padding:2px 6px; border-radius:3px; margin-left:8px; font-weight:bold;">AUSENTE</span>` : '';
            let catClass = row.categoria.toLowerCase().includes('vet') ? 'supervet' : (row.categoria.toLowerCase().includes('junior') ? 'junior' : (row.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
            
            html += `<tr style="${row.ausente ? 'opacity: 0.35;' : ''}">
                <td style="width:${wPos}; color: white; font-weight: bold; background-color: #050505; text-align:center;">${row.posicionFija}</td>
                <td style="width:${wNum}; text-align:center; font-weight: normal; color: #AAA;">${row.orden}</td>
                <td style="width:${wTirador}; text-align: left; padding-left:15px; font-weight:bold; white-space:nowrap; overflow:hidden; color:white;" title="${row.tirador}">${formatearNombre(row.tirador)} ${badgeSerie} ${ausenteBadge}</td>
                <td style="width:${wCat}; font-size: 0.85rem; text-align:center;"><span class="tag-categoria ${catClass}">${row.categoria.toUpperCase()}</span></td>
                ${htmlPlatosMultiTD}
                <td style="width:${wTot}; font-size: 1.3rem; font-weight: bold; text-align:center; color:white;">${row.ausente ? '-' : row.totalAciertos}</td>
                <td style="width:${wBar}; font-size: 1.2rem; font-weight: bold; text-align:center;">${barrageTxt}</td>
                <td style="width:${wFin}; font-size: 1.6rem; font-weight: bold; color: white; text-align:center;">${row.ausente ? '-' : row.puntajeFinal}</td>
            </tr>`;
        });
        return html;
    }

    let htmlCompleto = htmlCabecera;
    if (modoTvActivo) {
        let enSerie = listaFiltrada.filter(t => t.totalAciertos === torneoConfig.platos_por_serie && t.totalTirados > 0 && !t.ausente);
        let resto = listaFiltrada.filter(t => !(t.totalAciertos === torneoConfig.platos_por_serie && t.totalTirados > 0 && !t.ausente));
        htmlCompleto += `<tbody class="tbody-enserie">`;
        if(enSerie.length > 0) { htmlCompleto += `<tr class="tr-separador"><td colspan="100%"><div class="separador-box">EN SERIE</div></td></tr>` + buildFilas(enSerie); }
        htmlCompleto += `</tbody>`;
        if(resto.length > 0) { htmlCompleto += `<tbody class="tbody-resto-header"><tr class="tr-separador"><td colspan="100%"><div class="separador-box">RESTO DE LOS TIRADORES</div></td></tr></tbody><tbody class="tbody-resto">` + buildFilas(resto) + `</tbody>`; }
    } else {
        htmlCompleto += `<tbody>` + buildFilas(listaFiltrada) + `</tbody>`;
    }
    tabla.innerHTML = htmlCompleto;
}

function renderizarPedana(containerId, torneoConfig) {
    const cont = document.getElementById(containerId);
    if (!cont || !torneoConfig) return;
    let lista = [...tiradoresLocales].sort((a,b) => a.orden - b.orden);
    if (lista.length === 0) { cont.innerHTML = '<h3 style="text-align:center;">No hay tiradores</h3>'; return; }
    
    let idx = torneoConfig.tirador_actual_index || 0;
    if (idx >= lista.length) idx = lista.length - 1;
    let actual = lista[idx];

    let htmlPlatos = `<div class="plates-container" style="flex-wrap: wrap; justify-content: center; margin-top: 15px; gap: 6px;">`;
    let tirados = 0;
    for(let i=0; i<torneoConfig.platos_por_serie; i++){
        let val = actual.resultados[i]; if(val !== null) tirados++;
        if(val === 1) htmlPlatos += `<div class="plate-box pedana-plate plate-hit">✔</div>`;
        else if (val === 0) htmlPlatos += `<div class="plate-box pedana-plate plate-miss">✖</div>`;
        else htmlPlatos += `<div class="plate-box pedana-plate" style="background-color: #111;"></div>`;
    }
    htmlPlatos += '</div>';

    let htmlNext = `<div style="text-align: left; position: relative;"><div class="pedana-lbl-prox">PRÓXIMOS TIRADORES</div><div class="pedana-next-grid">`;
    for(let i=1; i<=3; i++) {
        let sig = lista[idx + i];
        if (sig) {
            let catClass = sig.categoria.toLowerCase().includes('vet') ? 'supervet' : (sig.categoria.toLowerCase().includes('junior') ? 'junior' : (sig.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
            let nombreMostrar = sig.ausente ? `<span style="opacity:0.5;">${formatearNombre(sig.tirador)} [AUS]</span>` : formatearNombre(sig.tirador);
            htmlNext += `<div class="pedana-next-box"><div class="pedana-next-orden">${sig.orden}</div><div class="pedana-next-nombre">${nombreMostrar}</div><div><span class="tag-categoria ${catClass}" style="font-size: 0.9rem; padding: 4px 10px;">${sig.categoria.toUpperCase()}</span></div></div>`;
        } else {
            htmlNext += `<div class="pedana-next-box" style="opacity: 0.1;"><div class="pedana-next-orden">-</div></div>`;
        }
    }
    htmlNext += '</div></div>';

    let catClassAct = actual.categoria.toLowerCase().includes('vet') ? 'supervet' : (actual.categoria.toLowerCase().includes('junior') ? 'junior' : (actual.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
    cont.innerHTML = `<div class="pedana-container"><div class="pedana-main" style="${actual.ausente ? 'opacity:0.5;' : ''}"><div class="pedana-lbl">LLAMADO A PEDANA</div><div class="pedana-orden">${actual.orden}</div><div class="pedana-nombre">${actual.ausente ? 'AUSENTE: ' : ''}${actual.tirador}</div><div><span class="tag-categoria ${catClassAct}" style="font-size: 1.1rem; padding: 5px 16px;">${actual.categoria.toUpperCase()}</span></div>${htmlPlatos}<div class="pedana-stats"><span class="numero-grande">${actual.totalAciertos}</span><span class="texto-chico">DE ${torneoConfig.platos_por_serie} PLATOS • ${tirados} TIRADOS</span></div></div>${htmlNext}</div>`;
}

window.cambiarPedana = async function(delta) {
    if (!torneoAdmin) return;
    let max = tiradoresLocales.length - 1; let newIdx = (torneoAdmin.tirador_actual_index || 0) + delta;
    if (newIdx < 0) newIdx = 0; if (newIdx > max) newIdx = max;
    await clienteSupabase.from('torneos').update({ tirador_actual_index: newIdx }).eq('id', torneoAdmin.id);
    torneoAdmin.tirador_actual_index = newIdx; renderizarPedana('contenedor-pedana-admin', torneoAdmin); avisarALaTV();
}

async function sincronizarPedanaConJuez(idSeleccionado) {
    const porOrden = [...tiradoresLocales].sort((a, b) => a.orden - b.orden);
    let i = porOrden.findIndex(x => x.id === idSeleccionado);
    if (i !== -1) {
        let indexPedana = i + 1; if (indexPedana >= porOrden.length) indexPedana = Math.max(0, porOrden.length - 1);
        await clienteSupabase.from('torneos').update({ tirador_actual_index: indexPedana }).eq('id', torneoAdmin.id);
        torneoAdmin.tirador_actual_index = indexPedana; renderizarPedana('contenedor-pedana-admin', torneoAdmin); avisarALaTV();
    }
}

function claveRanking(t) { return [t.puntajeFinal, t.barrage || 0, t.totalAciertos]; }
function mismoRanking(a, b) { const x = claveRanking(a), y = claveRanking(b); return x[0] === y[0] && x[1] === y[1] && x[2] === y[2]; }
function ganadoresDeCategoria(cat) {
    const lista = tiradoresLocales.filter(t => t.categoria === cat && !t.ausente);
    if (lista.length === 0) return null;
    const conTiros = lista.filter(t => t.totalTirados > 0); const provisorio = lista.some(t => t.totalTirados < torneoAdmin.platos_por_serie);
    if (conTiros.length === 0) return { ganadores: [], empate: false, provisorio: true, total: lista.length };
    const ordenados = [...conTiros].sort((a, b) => b.puntajeFinal - a.puntajeFinal || (b.barrage || 0) - (a.barrage || 0) || b.totalAciertos - a.totalAciertos || a.orden - b.orden);
    const mejor = ordenados[0]; const ganadores = ordenados.filter(t => mismoRanking(t, mejor)); let esEmpate = ganadores.length > 1;
    return { ganadores, empate: esEmpate, provisorio, total: lista.length };
}
function htmlGanadoresPorCategoria() {
    let html = '<div class="winners-grid">';
    obtenerCategorias(torneoAdmin).forEach(cat => {
        const g = ganadoresDeCategoria(cat);
        if (!g) { html += `<div class="winner-box vacio"><h4>${cat.toUpperCase()}</h4><div class="winner-name" style="color:var(--text-muted); font-size:1rem;">Sin tiradores</div></div>`; return; }
        const estado = g.provisorio ? '<span class="winner-estado prov">PROVISORIO</span>' : '<span class="winner-estado fin">FINAL</span>';
        if (g.ganadores.length === 0) { html += `<div class="winner-box"><h4>${cat.toUpperCase()} ${estado}</h4><div class="winner-name" style="color:var(--text-muted); font-size:1rem;">Aún sin resultados</div></div>`; return; }
        const nombres = g.ganadores.map(t => `<div class="winner-name">${t.tirador} <span class="winner-orden">Nº ${t.orden}</span></div>`).join('');
        html += `<div class="winner-box ${g.empate ? 'empate' : 'unico'}"><h4>${cat.toUpperCase()} ${estado}</h4>${g.empate ? `<div class="winner-tag">EMPATE</div>` : ''}${nombres}<div class="winner-pts">${g.ganadores[0].totalAciertos} de ${torneoAdmin.platos_por_serie}${g.ganadores[0].barrage > 0 ? ` (barrage ${g.ganadores[0].barrage})` : ''}</div></div>`;
    });
    return html + '</div>';
}

function renderizarStats() {
    const cont = document.getElementById('contenedor-stats'); if (!cont || !torneoAdmin) return;
    if (tiradoresLocales.length === 0) { cont.innerHTML = '<p>No hay datos.</p>'; return; }
    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    const catsList = obtenerCategorias(torneoAdmin);
    let presentes = tiradoresLocales.filter(t => !t.ausente);
    let totTiradores = presentes.length; let totObjetivos = totTiradores * torneoAdmin.platos_por_serie; let tirados = 0, pegados = 0, errados = 0, recaudado = 0; let catsCount = {};
    catsList.forEach(c => catsCount[c] = 0);
    presentes.forEach(t => { if(catsCount[t.categoria] !== undefined) catsCount[t.categoria]++; else catsCount[t.categoria] = 1; recaudado += (costos[t.categoria] || 0); t.resultados.forEach(r => { if(r !== null) { tirados++; if(r===1) pegados++; else errados++; } }); });
    let premios = Math.max(0, recaudado - (tirados * (costos["Objetivo"] || 1000)) - ((recaudado * (costos["Retencion"] || 10)) / 100));
    let htmlCatsGrid = ''; catsList.forEach(c => { htmlCatsGrid += `<div class="stat-box"><h4>${c.toUpperCase()}</h4><div class="val">${catsCount[c] || 0}</div></div>`; });
    
    cont.innerHTML = `
        <h2 class="titulo-amarillo">OBJETIVOS Y PARTICIPACIÓN</h2><div style="color: var(--danger); font-weight: bold; margin-bottom: 15px; font-size: 0.9rem;">(Los ${tiradoresLocales.length - presentes.length} tiradores ausentes han sido excluidos del conteo)</div>
        <div class="stats-grid"><div class="stat-box azul"><h4>OBJETIVOS TOTALES</h4><div class="val">${totObjetivos}</div><div class="sub">${totTiradores} presentes x ${torneoAdmin.platos_por_serie} platos</div></div><div class="stat-box" style="border-top-color: white;"><h4>TIRADOS</h4><div class="val">${tirados}</div><div class="sub">${totObjetivos - tirados} por tirar</div></div><div class="stat-box verde"><h4>ACERTADOS</h4><div class="val">${pegados}</div><div class="sub">${tirados>0?((pegados/tirados)*100).toFixed(1):0}% de aciertos</div></div><div class="stat-box rojo"><h4>ERRADOS</h4><div class="val">${errados}</div><div class="sub">${tirados>0?((errados/tirados)*100).toFixed(1):0}% de errados</div></div></div>
        <h2 class="titulo-amarillo">TIRADORES POR CATEGORÍA</h2><div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">${htmlCatsGrid}</div>
        <h2 class="titulo-amarillo">GANADORES POR CATEGORÍA</h2>${htmlGanadoresPorCategoria()}
        <h2 class="titulo-amarillo">FINANZAS</h2><div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);"><div class="stat-box"><h4>TOTAL RECAUDADO</h4><div class="val">$ ${(recaudado).toLocaleString('es-AR')}</div></div><div class="stat-box"><h4>SE QUEDA EL CLUB</h4><div class="val" style="color:var(--accent-yellow);">$ ${(recaudado - premios).toLocaleString('es-AR')}</div><div class="sub">Retención + Objetivos</div></div><div class="stat-box"><h4>VA A PREMIOS</h4><div class="val">$ ${(premios).toLocaleString('es-AR')}</div></div></div>`;
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
window.agregarCategoriaConfig = function() {
    if (!torneoAdmin) return; const nuevaCat = document.getElementById('input-nueva-cat').value.trim();
    if (!nuevaCat) return mostrarAlerta("Ingrese el nombre de la nueva categoría."); if (!torneoAdmin.costos) torneoAdmin.costos = {};
    if (torneoAdmin.costos[nuevaCat] !== undefined) return mostrarAlerta("Esa categoría ya existe.");
    torneoAdmin.costos[nuevaCat] = 0; document.getElementById('input-nueva-cat').value = ''; cargarFormularioCostos(); renderizarSelectsCategorias(); mostrarAlerta(`Categoría "${nuevaCat}" agregada. Presioná 'Guardar Costos'.`);
}
window.eliminarCategoriaConfig = function(catKey) {
    mostrarConfirmacion(`¿Eliminar categoría "${catKey}"?`, async () => {
        delete torneoAdmin.costos[catKey]; await clienteSupabase.from('torneos').update({ costos: torneoAdmin.costos }).eq('id', torneoAdmin.id);
        cargarFormularioCostos(); renderizarSelectsCategorias(); renderizarAdminBaseDatos(); renderizarStats(); renderizarFiltrosCategorias('filtros-cat-admin', torneoAdmin); mostrarAlerta("Eliminada correctamente.");
    });
}
window.guardarCostos = async function() {
    if (!torneoAdmin) return; let nuevosCostos = {};
    document.querySelectorAll('.input-costo-guardar').forEach(inp => { nuevosCostos[inp.getAttribute('data-key')] = parseInt(inp.value) || 0; });
    await clienteSupabase.from('torneos').update({ costos: nuevosCostos }).eq('id', torneoAdmin.id);
    torneoAdmin.costos = nuevosCostos; renderizarAdminBaseDatos(); renderizarStats(); renderizarSelectsCategorias(); renderizarFiltrosCategorias('filtros-cat-admin', torneoAdmin); mostrarAlerta("Costos actualizados con éxito.");
}

// ==========================================
// MODO JUECES CON GRUPOS/ESCUADRAS (PLATO)
// ==========================================
function getGruposPlato() {
    if (!torneoAdmin || torneoAdmin.disciplina !== 'Plato') return [];
    let size = torneoAdmin.tamano_grupo || 1;
    let ordenados = [...tiradoresLocales].sort((a, b) => a.orden - b.orden);
    let grupos = [];
    for (let i = 0; i < ordenados.length; i += size) {
        grupos.push(ordenados.slice(i, i + size));
    }
    return grupos;
}

window.renderizarAdminJueces = function() {
    const sidebar = document.getElementById('juez-lista-tiradores'); if (!sidebar || !torneoAdmin) return; 
    const contGrupos = document.getElementById('contenedor-grupos-jueces');
    const selectGrupos = document.getElementById('select-grupo-jueces');
    sidebar.innerHTML = '';
    
    let listaMostrar = [...tiradoresLocales].sort((a, b) => a.orden - b.orden); // Ordenar siempre por Nº para el juez
    
    // Filtro por Escuadras (Solo si es Plato)
    if (torneoAdmin.disciplina === 'Plato') {
        contGrupos.style.display = 'block';
        let grupos = getGruposPlato();
        
        // Recargar el select si cambió la cantidad de escuadras
        if (selectGrupos.options.length === 0 || selectGrupos.options.length !== grupos.length + 1) {
            selectGrupos.innerHTML = '<option value="Todos">Todos los tiradores</option>';
            grupos.forEach((g, idx) => {
                selectGrupos.innerHTML += `<option value="${idx}">Escuadra ${idx + 1} (Nº ${g[0].orden} al ${g[g.length-1].orden})</option>`;
            });
            selectGrupos.value = grupoJuecesActivo;
        }

        if (grupoJuecesActivo !== 'Todos') {
            let gIdx = parseInt(grupoJuecesActivo);
            if (grupos[gIdx]) listaMostrar = grupos[gIdx];
        }
    } else {
        contGrupos.style.display = 'none';
        grupoJuecesActivo = 'Todos';
    }

    const filtro = document.getElementById('buscador-jueces').value.toLowerCase();
    if (filtro) listaMostrar = listaMostrar.filter(t => t.tirador.toLowerCase().includes(filtro));
    
    if (!tiradoresLocales.find(x => x.id === tiradorJuezActivoId)) {
        tiradorJuezActivoId = (listaMostrar[0] || {}).id;
    }

    listaMostrar.forEach(row => { 
        sidebar.innerHTML += `<div class="juez-list-item ${(tiradorJuezActivoId === row.id) ? 'active' : ''}" style="${row.ausente ? 'opacity: 0.5;' : ''}" onclick="seleccionarTiradorJuez('${row.id}')"><span>${row.orden}. ${row.tirador}${row.ausente ? ' <span style="color:var(--danger); font-size:0.75rem; font-weight:bold;">[AUS]</span>' : ''}</span><span style="color: white; font-weight: bold;">${row.totalTirados}/${torneoAdmin.platos_por_serie}</span></div>`; 
    });
    
    renderizarPanelDerechoJuez();
}

window.cambiarGrupoJueces = function() {
    grupoJuecesActivo = document.getElementById('select-grupo-jueces').value;
    tiradorJuezActivoId = null; 
    renderizarAdminJueces();
}

window.seleccionarTiradorJuez = function(id) { 
    tiradorJuezActivoId = id; 
    renderizarAdminJueces(); 
    sincronizarPedanaConJuez(id); 
}

window.cambiarTiradorJuez = function(delta) {
    let listaBase = [...tiradoresLocales].sort((a, b) => a.orden - b.orden);
    
    // Si estamos en Plato y hay un grupo seleccionado, hacemos que rote dentro del grupo
    if (torneoAdmin.disciplina === 'Plato' && grupoJuecesActivo !== 'Todos') {
        let grupos = getGruposPlato();
        let gIdx = parseInt(grupoJuecesActivo);
        if (grupos[gIdx]) {
            listaBase = grupos[gIdx];
            let i = listaBase.findIndex(x => x.id === tiradorJuezActivoId);
            if (i === -1) i = 0;
            
            // Navegación Rotativa
            let nuevoIdx = i + delta;
            if (nuevoIdx >= listaBase.length) nuevoIdx = 0; // Vuelve al inicio del grupo
            if (nuevoIdx < 0) nuevoIdx = listaBase.length - 1; // Vuelve al final del grupo
            
            tiradorJuezActivoId = listaBase[nuevoIdx].id;
        }
    } else {
        // Navegación Lineal (Hélice o Plato viendo "Todos")
        if (listaBase.length === 0) return;
        let i = listaBase.findIndex(x => x.id === tiradorJuezActivoId); 
        if (i === -1) i = 0;
        tiradorJuezActivoId = listaBase[Math.max(0, Math.min(listaBase.length - 1, i + delta))].id;
    }
    
    renderizarAdminJueces(); 
    const activo = document.querySelector('#juez-lista-tiradores .juez-list-item.active'); 
    if (activo) activo.scrollIntoView({ block: 'nearest' });
    sincronizarPedanaConJuez(tiradorJuezActivoId);
}

function renderizarPanelDerechoJuez() {
    const panel = document.getElementById('juez-panel-activo'); if (!panel || !tiradorJuezActivoId) { if(panel) panel.innerHTML = '<h2 style="margin-top: 0; color: var(--text-muted); text-align: center;">Seleccione un tirador de la lista</h2>'; return; }
    const t = tiradoresLocales.find(x => x.id === tiradorJuezActivoId); if (!t) return;
    let htmlPlatos = '<div class="plates-container" style="flex-wrap: wrap; justify-content: center; margin-bottom: 30px;">';
    for(let i = 0; i < torneoAdmin.platos_por_serie; i++) { let val = t.resultados[i]; htmlPlatos += `<div class="plate-box admin-plate ${val === 1 ? 'plate-hit' : (val === 0 ? 'plate-miss' : '')}" style="width: 45px; height: 45px; font-size:1.2rem; margin:3px;" onclick="togglePlato('${t.id}', ${i}, this)">${val === 1 ? '✔' : (val === 0 ? '✖' : (i + 1))}</div>`; }
    htmlPlatos += '</div>';
    
    let btnRotativoTxt = (torneoAdmin.disciplina === 'Plato' && grupoJuecesActivo !== 'Todos') ? 'Sig. de Escuadra ↺' : 'Siguiente tirador →';
    
    panel.innerHTML = `<div class="juez-main-header">${t.tirador}</div><div class="juez-main-subtitle">(Nº ${t.orden} - ${t.categoria})</div><div style="margin-bottom: 25px;"><button onclick="toggleAusente('${t.id}')" style="${t.ausente ? "background-color: var(--danger); color: white; border: 1px solid var(--danger); padding: 6px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;" : "background-color: transparent; color: var(--danger); border: 1px solid var(--danger); padding: 6px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;"}">${t.ausente ? '❌ MARCADO COMO AUSENTE (Click para deshacer)' : 'Marcar como AUSENTE'}</button></div><div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 20px;"><button class="btn-outline" onclick="cambiarTiradorJuez(-1)" style="font-size: 1rem; padding: 10px 20px;">← Anterior</button><button onclick="cambiarTiradorJuez(1)" style="font-size: 1rem; padding: 10px 20px; background-color: var(--accent); color: black;">${btnRotativoTxt}</button></div><div style="${t.ausente ? 'opacity: 0.3; pointer-events: none;' : ''}"><div style="font-size: 1.5rem; color: ${t.totalTirados === torneoAdmin.platos_por_serie ? 'var(--success)' : 'var(--accent-yellow)'}; font-weight: bold; margin-bottom: 5px;">SERIE ${t.totalTirados === torneoAdmin.platos_por_serie ? 'COMPLETA' : 'EN CURSO'}: ${t.totalTirados} DE ${torneoAdmin.platos_por_serie}</div><div style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 20px;">Aciertos: ${t.totalAciertos}</div><div style="background-color: var(--bg-main); padding: 20px; border-radius: 8px; margin-bottom: 20px;">${htmlPlatos}</div><div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 30px; background-color: var(--bg-main); padding: 20px; border-radius: 8px;"><label style="font-size: 1.2rem; font-weight: bold;">BARRAGE:</label><input type="number" id="input-barrage-${t.id}" class="barrage-input" value="${t.barrage || 0}"><button onclick="guardarBarrage('${t.id}')">Guardar</button></div></div>`;
}

window.toggleAusente = async function(id) {
    let t = tiradoresLocales.find(x => x.id === id);
    if(t) { t.ausente = !t.ausente; await clienteSupabase.from('inscripciones').update({ ausente: t.ausente }).eq('id', id); renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); renderizarStats(); avisarALaTV(); }
}
window.guardarBarrage = async function(id) {
    let t = tiradoresLocales.find(x => x.id === id); if(t) { t.barrage = parseInt(document.getElementById(`input-barrage-${id}`).value) || 0; t.puntajeFinal = t.totalAciertos + t.barrage; await clienteSupabase.from('inscripciones').update({ barrage: t.barrage }).eq('id', id); renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); avisarALaTV(); }
}

function renderizarAdminBaseDatos() {
    const tbody = document.getElementById('lista-edicion-tiradores'); if (!tbody || !torneoAdmin) return; tbody.innerHTML = '';
    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000 };
    [...tiradoresLocales].sort((a, b) => a.orden - b.orden).forEach(row => {
        let catClass = row.categoria.toLowerCase().includes('vet') ? 'supervet' : (row.categoria.toLowerCase().includes('junior') ? 'junior' : (row.categoria.toLowerCase().includes('principiante') ? 'principiante' : ''));
        tbody.innerHTML += `<tr style="${row.ausente ? 'opacity: 0.6;' : ''}"><td><strong>${row.orden}</strong></td><td style="font-weight: bold; text-transform: uppercase;">${row.ausente ? `<span style="color:var(--danger); font-weight:bold;">[AUS]</span> ${row.tirador}` : row.tirador}</td><td><span class="tag-categoria ${catClass}">${row.categoria.toUpperCase()}</span></td><td><span class="tag-paralelo">P1</span> <span class="tag-paralelo">P2</span></td><td style="color: white; font-weight: bold;">${row.ausente ? '-' : `$ ${(costos[row.categoria] || 0).toLocaleString('es-AR')}`}</td><td><button class="btn-outline" onclick="abrirModalEditar('${row.id}', '${row.tirador}', ${row.orden}, '${row.categoria}')">Editar</button> <button class="btn-outline-danger" onclick="eliminarTirador('${row.id}')">Eliminar</button></td></tr>`;
    });
}

window.exportarExcel = function() {
    if (!torneoAdmin || tiradoresLocales.length === 0) return mostrarAlerta("No hay datos para exportar.");
    const datos = [...tiradoresLocales].sort((a, b) => b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden).map((t, i) => {
        let fila = { 'POS': t.ausente ? '-' : i + 1, 'ORDEN': t.orden, 'TIRADOR': t.tirador, 'CAT': t.categoria, 'ESTADO': t.ausente ? 'AUSENTE' : 'PRESENTE' };
        for(let j=0; j<torneoAdmin.platos_por_serie; j++) fila[`P${j+1}`] = t.resultados[j] === 1 ? 'A' : (t.resultados[j] === 0 ? 'F' : '-');
        fila['TOTAL'] = t.ausente ? '-' : t.totalAciertos; fila['BARRAGE'] = t.ausente ? '-' : (t.barrage || 0); fila['FINAL'] = t.ausente ? '-' : t.puntajeFinal; return fila;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Resultados"); XLSX.writeFile(wb, `Resultados_${torneoAdmin.nombre.replace(/ /g, '_')}.xlsx`);
}

function avisarALaTV() { canalRealtime.send({ type: 'broadcast', event: 'recargar_pantallas', payload: {} }); }

window.togglePlato = async function(idRow, idx, html) {
    let t = tiradoresLocales.find(x => x.id === idRow); if(t.ausente) return;
    t.resultados[idx] = t.resultados[idx] === null ? 1 : (t.resultados[idx] === 1 ? 0 : null);
    t.totalAciertos = t.resultados.filter(r => r === 1).length; t.totalTirados = t.resultados.filter(r => r !== null).length; t.puntajeFinal = t.totalAciertos + (t.barrage || 0);
    renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); renderizarPedana('contenedor-pedana-admin', torneoAdmin); renderizarStats();
    await clienteSupabase.from('inscripciones').update({ resultados: t.resultados }).eq('id', idRow); avisarALaTV();
}

window.abrirModalEditar = function(id, nom, ord, cat) { document.getElementById('edit-id').value = id; document.getElementById('edit-tirador').value = nom; document.getElementById('edit-orden').value = ord; document.getElementById('edit-categoria').value = cat; document.getElementById('modal-editar').style.display = 'flex'; }
window.cerrarModalEditar = () => document.getElementById('modal-editar').style.display = 'none';

window.guardarEdicionTirador = async function() {
    let nuevoOrden = parseInt(document.getElementById('edit-orden').value); let idActual = document.getElementById('edit-id').value;
    if (tiradoresLocales.some(t => t.orden === nuevoOrden && t.id !== idActual)) return mostrarAlerta(`El Nº ${nuevoOrden} ya está asignado.`);
    await clienteSupabase.from('inscripciones').update({ tirador: document.getElementById('edit-tirador').value, orden: nuevoOrden, categoria: document.getElementById('edit-categoria').value }).eq('id', idActual);
    cerrarModalEditar(); await cargarResultados(torneoAdmin.id); avisarALaTV();
}

window.agregarTirador = async function() {
    let orden = parseInt(document.getElementById('input-orden').value); let tirador = document.getElementById('input-tirador').value;
    if(!orden || !tirador) return mostrarAlerta("Faltan datos.");
    if (tiradoresLocales.some(t => t.orden === orden)) return mostrarAlerta(`El Nº ${orden} ya existe.`);
    await clienteSupabase.from('inscripciones').insert([{ torneo_id: torneoAdmin.id, orden: orden, tirador: tirador, categoria: document.getElementById('input-categoria').value, resultados: Array(torneoAdmin.platos_por_serie).fill(null), barrage: 0, ausente: false }]);
    document.getElementById('input-orden').value = ''; document.getElementById('input-tirador').value = ''; await cargarResultados(torneoAdmin.id); avisarALaTV();
}

window.eliminarTirador = function(id) { mostrarConfirmacion("¿Eliminar tirador?", async () => { await clienteSupabase.from('inscripciones').delete().eq('id', id); await cargarResultados(torneoAdmin.id); avisarALaTV(); }); }

// ==========================================
// CREACIÓN Y EDICIÓN DE TORNEOS CON DISCIPLINA
// ==========================================
window.crearTorneo = async function() {
    const n = document.getElementById('input-nuevo-torneo').value; 
    const f = document.getElementById('input-fecha-torneo').value; 
    
    const disc = document.getElementById('input-disciplina').value;
    const pSel = document.getElementById('input-platos').value;
    const pCust = document.getElementById('input-platos-custom').value;
    const grupo = document.getElementById('input-grupo-size').value;
    
    let pFinal = (pSel === 'Personalizado') ? parseInt(pCust) : parseInt(pSel);
    let gFinal = (disc === 'Plato') ? parseInt(grupo) : 1;

    if (!n || !f || !pFinal || pFinal <= 0) return mostrarAlerta("Nombre, fecha y cantidad de blancos son OBLIGATORIOS.");
    
    let c = { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    if (listaTorneos.length > 0 && listaTorneos[listaTorneos.length - 1].costos) c = JSON.parse(JSON.stringify(listaTorneos[listaTorneos.length - 1].costos));
    
    await clienteSupabase.from('torneos').insert([{ 
        nombre: n, fecha: f, 
        platos_por_serie: pFinal, estado: 'Inactivo', costos: c, tirador_actual_index: 0,
        disciplina: disc, tamano_grupo: gFinal
    }]);
    
    document.getElementById('input-nuevo-torneo').value = ''; document.getElementById('input-fecha-torneo').value = ''; await inicializarDatos(); avisarALaTV();
}

window.editarTorneoActual = async function() {
    const f = document.getElementById('edit-fecha-torneo').value; if (!f) return mostrarAlerta("La fecha no puede quedar vacía.");
    
    const disc = document.getElementById('edit-disciplina').value;
    const pSel = document.getElementById('edit-platos').value;
    const pCust = document.getElementById('edit-platos-custom').value;
    const grupo = document.getElementById('edit-grupo-size').value;
    
    let pFinal = (pSel === 'Personalizado') ? parseInt(pCust) : parseInt(pSel);
    let gFinal = (disc === 'Plato') ? parseInt(grupo) : 1;

    await clienteSupabase.from('torneos').update({ 
        nombre: document.getElementById('edit-nombre-torneo').value, 
        fecha: f, platos_por_serie: pFinal,
        disciplina: disc, tamano_grupo: gFinal
    }).eq('id', torneoAdmin.id);
    
    await inicializarDatos(); avisarALaTV(); mostrarAlerta('Torneo actualizado.');
}

window.eliminarTorneoActual = function() {
    mostrarConfirmacion("¿ELIMINAR torneo completo y TODOS sus tiradores?", async () => {
        await clienteSupabase.from('inscripciones').delete().eq('torneo_id', torneoAdmin.id); await clienteSupabase.from('torneos').delete().eq('id', torneoAdmin.id);
        torneoAdmin = null; await inicializarDatos(); avisarALaTV();
    });
}

canalRealtime.on('broadcast', { event: 'recargar_pantallas' }, async () => {
    if (!esAdmin) {
        if (torneoTV) {
            const { data } = await clienteSupabase.from('torneos').select('*').eq('id', torneoTV.id).single();
            if (data) torneoTV = data; cargarResultados(torneoTV.id);
        } else inicializarDatos(); 
    }
}).subscribe();
document.addEventListener('DOMContentLoaded', verificarSesion);